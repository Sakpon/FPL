"""Load trained per-position models and predict the upcoming gameweek."""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.core.config import settings
from app.ml.features import build_matrix

MODEL_DIR: Path = settings.model_dir
POSITIONS = ("GK", "DEF", "MID", "FWD")


def _load(pos: str, prefix: str):
    path = MODEL_DIR / f"{prefix}_{pos}.joblib"
    if not path.exists():
        return None
    return joblib.load(path)


def predict_for_gw(db: Session, target_gw: int, target_season: str = "live") -> pd.DataFrame:
    """Build predictions for (target_season, target_gw).

    We construct features for ALL rows available and filter to the target row
    per player at the end. The rolling features for target_gw use prior GWs,
    so prediction is valid even if no PlayerGWStats row exists yet for target_gw.
    """
    fm = build_matrix(db)
    mask = (fm.meta["season"] == target_season) & (fm.meta["gw"] == target_gw)

    if not mask.any():
        # fallback: use latest available GW row per player to generate a forecast
        latest = (
            fm.meta[fm.meta["season"] == target_season]
            .sort_values(["player_id", "gw"])
            .groupby("player_id")
            .tail(1)
        )
        mask = fm.meta.index.isin(latest.index)

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
        })
        frame["rank_in_position"] = (
            frame["predicted_points"].rank(ascending=False, method="min").astype(int)
        )
        preds_frames.append(frame)

    if not preds_frames:
        return pd.DataFrame()
    return pd.concat(preds_frames, ignore_index=True)
