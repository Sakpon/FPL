"""Orchestration: build predictions, run optimizer, log recommendations, compute
accuracy vs actual results."""

from __future__ import annotations

from datetime import datetime
from typing import Iterable

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    ActualResult,
    ModelVersion,
    Player,
    Recommendation,
)
from app.ml.optimizer import optimize
from app.ml.predict import predict_for_gw


POSITIONS = ("GK", "DEF", "MID", "FWD")


def _latest_model_version_id(db: Session) -> int | None:
    row = db.execute(
        select(ModelVersion).order_by(ModelVersion.id.desc()).limit(1)
    ).scalar_one_or_none()
    return row.id if row else None


def _player_team_map(db: Session, player_ids: Iterable[int]) -> dict[int, int]:
    rows = db.query(Player.id, Player.team_id).filter(Player.id.in_(list(player_ids))).all()
    return {pid: tid for pid, tid in rows}


def generate_recommendations(
    db: Session, gw: int, season: str = "live"
) -> dict:
    preds = predict_for_gw(db, target_gw=gw, target_season=season)
    if preds.empty:
        return {"status": "no_predictions"}

    # Top pick per position
    top_picks = {}
    for pos in POSITIONS:
        pos_df = preds[preds["position"] == pos].sort_values(
            "predicted_points", ascending=False
        )
        if not pos_df.empty:
            top_picks[pos] = int(pos_df.iloc[0]["player_id"])

    # Run optimizer for best XI + captain
    team_map = _player_team_map(db, preds["player_id"].tolist())
    # The optimizer needs integer tenths for price; align type
    preds["price"] = preds["price"].fillna(40).astype(int)
    pos_counts = preds["position"].value_counts().to_dict()
    print(
        f"[recs] predictions per position: {pos_counts} | "
        f"total={len(preds)} | price range={preds['price'].min()}-{preds['price'].max()}"
    )
    opt = optimize(preds[["player_id", "position", "price", "predicted_points"]], team_map)

    opt_squad_ids = set(opt.squad["player_id"].astype(int).tolist())
    starter_ids = set(opt.squad.loc[opt.squad["is_starter"], "player_id"].astype(int).tolist())

    model_version_id = _latest_model_version_id(db)

    # Clear previous recommendations for this gw/season to keep it idempotent
    db.query(Recommendation).filter_by(gw=gw, season=season).delete()
    db.commit()

    written = 0
    for _, row in preds.iterrows():
        pid = int(row["player_id"])
        rec = Recommendation(
            gw=gw, season=season, player_id=pid, position=row["position"],
            predicted_points=float(row["predicted_points"]),
            p10=float(row["p10"]), p90=float(row["p90"]),
            rank_in_position=int(row["rank_in_position"]),
            is_top_pick=(top_picks.get(row["position"]) == pid),
            is_captain=(pid == opt.captain_id),
            in_best_xi=(pid in starter_ids),
            social_score=float(row.get("social_score", 0.0) or 0.0),
            model_version_id=model_version_id,
            created_at=datetime.utcnow(),
        )
        db.add(rec)
        written += 1
    db.commit()

    return {
        "status": "ok",
        "written": written,
        "top_picks": top_picks,
        "captain_id": opt.captain_id,
        "squad_cost": opt.cost,
        "expected_points": round(opt.expected_points, 2),
    }


def accuracy_for_gw(db: Session, gw: int, season: str = "live") -> dict:
    recs = db.query(Recommendation).filter_by(gw=gw, season=season).all()
    if not recs:
        return {"gw": gw, "status": "no_recommendations"}

    actual_rows = {
        (r.player_id): r.actual_points
        for r in db.query(ActualResult).filter_by(gw=gw, season=season).all()
    }
    if not actual_rows:
        return {"gw": gw, "status": "no_actuals_yet"}

    preds = []
    actuals = []
    per_pos = {p: {"preds": [], "actuals": []} for p in POSITIONS}
    for r in recs:
        if r.player_id not in actual_rows:
            continue
        a = actual_rows[r.player_id]
        preds.append(r.predicted_points)
        actuals.append(a)
        per_pos[r.position]["preds"].append(r.predicted_points)
        per_pos[r.position]["actuals"].append(a)

    if not preds:
        return {"gw": gw, "status": "no_overlap"}

    import numpy as np
    from scipy.stats import spearmanr

    preds_a = np.array(preds)
    acts_a = np.array(actuals)
    mae = float(np.mean(np.abs(preds_a - acts_a)))
    rmse = float(np.sqrt(np.mean((preds_a - acts_a) ** 2)))
    rho, _ = spearmanr(preds_a, acts_a)

    top_picks_hit = 0
    top_picks_total = 0
    for pos in POSITIONS:
        pos_recs = [r for r in recs if r.position == pos]
        if not pos_recs:
            continue
        top_recs = sorted(
            (r for r in pos_recs if r.is_top_pick), key=lambda r: r.predicted_points, reverse=True
        )
        if not top_recs:
            continue
        actual_top5 = sorted(
            (
                (actual_rows.get(r.player_id, 0), r.player_id)
                for r in pos_recs if r.player_id in actual_rows
            ),
            reverse=True,
        )[:5]
        top5_ids = {pid for _, pid in actual_top5}
        for r in top_recs:
            top_picks_total += 1
            if r.player_id in top5_ids:
                top_picks_hit += 1

    # Captain success
    cap = next((r for r in recs if r.is_captain), None)
    cap_actual = actual_rows.get(cap.player_id) if cap else None

    # XI realised vs optimal hindsight
    xi_recs = [r for r in recs if r.in_best_xi]
    xi_realised = sum(actual_rows.get(r.player_id, 0) for r in xi_recs)
    if cap and cap.player_id in actual_rows:
        xi_realised += actual_rows[cap.player_id]  # captain doubles

    return {
        "gw": gw,
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "rank_corr": round(float(rho) if rho is not None and not np.isnan(rho) else 0.0, 3),
        "n": int(len(preds)),
        "top_picks_hit": top_picks_hit,
        "top_picks_total": top_picks_total,
        "captain_actual": cap_actual,
        "xi_realised": int(xi_realised),
        "per_position": {
            p: {
                "mae": round(
                    float(np.mean(np.abs(np.array(v["preds"]) - np.array(v["actuals"]))))
                    if v["preds"] else 0.0,
                    3,
                ),
                "n": len(v["preds"]),
            }
            for p, v in per_pos.items()
        },
    }
