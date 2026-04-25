"""Load trained per-position models and predict the upcoming gameweek."""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Fixture, Player
from app.ml.features import build_matrix

MODEL_DIR: Path = settings.model_dir
POSITIONS = ("GK", "DEF", "MID", "FWD")

# status codes that mean "will not play this GW" if chance_of_playing is None/0.
# 'a' available, 'd' doubtful, 'i' injured, 's' suspended, 'u' unavailable, 'n' not in squad.
UNAVAILABLE_STATUSES = {"i", "s", "u", "n"}


def _load(pos: str, prefix: str):
    path = MODEL_DIR / f"{prefix}_{pos}.joblib"
    if not path.exists():
        return None
    return joblib.load(path)


def _availability_factor(status: str | None, chance: int | None) -> float:
    """Return the multiplicative factor to apply to predicted points.

    Logic:
      - chance_of_playing in [0, 100] → use as-is (0 = out).
      - chance None but status in UNAVAILABLE_STATUSES → treat as 0.
      - otherwise → 1.0 (fully available).
    """
    if chance is not None:
        return max(0.0, min(float(chance), 100.0)) / 100.0
    if status and status.lower() in UNAVAILABLE_STATUSES:
        return 0.0
    return 1.0


def predict_for_gw(db: Session, target_gw: int, target_season: str = "live") -> pd.DataFrame:
    """Build predictions for (target_season, target_gw).

    We construct features for ALL rows available and filter to the target row
    per player at the end. The rolling features for target_gw use prior GWs,
    so prediction is valid even if no PlayerGWStats row exists yet for target_gw.
    Raw model output is scaled by the player's chance_of_playing_next_round so
    injured / doubtful players fall down the ranking naturally.
    """
    fm = build_matrix(db)

    # Restrict to teams that actually have a fixture in target_gw. Without
    # this, the latest-row fallback below leaks blank-GW players (no fixture
    # this week) into recommendations using their last-played stats.
    fixture_rows = (
        db.query(Fixture.home_team_id, Fixture.away_team_id)
        .filter(Fixture.season == target_season, Fixture.gw == target_gw)
        .all()
    )
    playing_team_ids: set[int] = set()
    for h, a in fixture_rows:
        if h is not None:
            playing_team_ids.add(h)
        if a is not None:
            playing_team_ids.add(a)

    if playing_team_ids:
        team_map = {
            pid: tid for pid, tid in db.query(Player.id, Player.team_id).all()
        }
        plays = (
            fm.meta["player_id"].map(team_map).isin(playing_team_ids).fillna(False)
        )
        print(
            f"[predict] target_gw={target_gw} season={target_season} "
            f"teams_with_fixture={len(playing_team_ids)} "
            f"players_eligible={int(plays.sum())}"
        )
    else:
        # No fixtures known for this GW — don't filter (avoids returning empty).
        plays = pd.Series(True, index=fm.meta.index)
        print(
            f"[predict] target_gw={target_gw} season={target_season} "
            f"no fixture rows found, skipping team filter"
        )

    mask = (
        (fm.meta["season"] == target_season)
        & (fm.meta["gw"] == target_gw)
        & plays
    )

    if not mask.any():
        # fallback: use latest available GW row per player to generate a forecast
        latest = (
            fm.meta[(fm.meta["season"] == target_season) & plays]
            .sort_values(["player_id", "gw"])
            .groupby("player_id")
            .tail(1)
        )
        mask = fm.meta.index.isin(latest.index)

    # Pull availability for every player we might predict for — cheap dict lookup.
    avail_rows = db.query(Player.id, Player.status, Player.chance_of_playing).all()
    avail = {pid: (status, chance) for pid, status, chance in avail_rows}

    preds_frames = []
    for pos in POSITIONS:
        pos_mask = mask & (fm.meta["position"] == pos)
        if not pos_mask.any():
            continue
        X = fm.X[pos_mask]
        meta = fm.meta[pos_mask]
        mean_m = _load(pos, "mean")
        p10_m = _load(pos, "p10")
        p90_m = _load(pos, "p90")
        if mean_m is None:
            continue
        mean = mean_m.predict(X)
        p10 = p10_m.predict(X) if p10_m is not None else mean - 2.0
        p90 = p90_m.predict(X) if p90_m is not None else mean + 2.0
        # guard: points are non-negative
        mean = np.clip(mean, 0, None)
        p10 = np.clip(p10, 0, None)
        p90 = np.clip(p90, 0, None)

        pids = meta["player_id"].values
        factor = np.array([
            _availability_factor(*avail.get(int(pid), (None, None))) for pid in pids
        ])
        mean = mean * factor
        p10 = p10 * factor
        p90 = p90 * factor
        statuses = np.array(
            [avail.get(int(pid), (None, None))[0] or "a" for pid in pids]
        )
        chances = np.array(
            [avail.get(int(pid), (None, None))[1] for pid in pids], dtype=object
        )

        social = X.get("social_weighted_sentiment")
        social_arr = social.values if social is not None else np.zeros(len(X))
        frame = pd.DataFrame({
            "player_id": meta["player_id"].values,
            "position": pos,
            "web_name": meta["web_name"].values,
            "price": meta["price"].values,
            "predicted_points": mean,
            "p10": p10,
            "p90": p90,
            "social_score": social_arr,
            "status": statuses,
            "chance_of_playing": chances,
            "availability_factor": factor,
        })
        frame["rank_in_position"] = (
            frame["predicted_points"].rank(ascending=False, method="min").astype(int)
        )
        preds_frames.append(frame)

    if not preds_frames:
        return pd.DataFrame()
    return pd.concat(preds_frames, ignore_index=True)
