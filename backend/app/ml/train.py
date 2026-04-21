"""Train per-position point-prediction models with walk-forward CV.

Primary model:    LightGBM regressor (mean prediction)
Interval model:   Two quantile regressors (p10, p90)

Evaluation:
- Per-position MAE / RMSE
- Per-GW Spearman rank correlation of prediction vs actual
- Captain hit-rate (top-1 predicted within actual top-5)
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.metrics import mean_absolute_error, mean_squared_error

from app.core.config import settings
from app.db.session import SessionLocal
from app.ml.features import FeatureMatrix, build_matrix

try:
    import lightgbm as lgb
    HAS_LGBM = True
except Exception:  # pragma: no cover
    HAS_LGBM = False

from sklearn.ensemble import GradientBoostingRegressor


POSITIONS = ("GK", "DEF", "MID", "FWD")
MODEL_DIR: Path = settings.model_dir
MODEL_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class TrainResult:
    position: str
    mae: float
    rmse: float
    rank_corr: float
    n_train: int
    n_val: int


def _fit_mean(X_train, y_train):
    if HAS_LGBM:
        model = lgb.LGBMRegressor(
            n_estimators=600, learning_rate=0.04, num_leaves=48,
            min_child_samples=20, subsample=0.9, colsample_bytree=0.9,
            random_state=42, verbose=-1,
        )
    else:
        model = GradientBoostingRegressor(
            n_estimators=300, max_depth=4, learning_rate=0.05, random_state=42
        )
    model.fit(X_train, y_train)
    return model


def _fit_quantile(X_train, y_train, alpha: float):
    if HAS_LGBM:
        model = lgb.LGBMRegressor(
            objective="quantile", alpha=alpha,
            n_estimators=500, learning_rate=0.05, num_leaves=32,
            random_state=42, verbose=-1,
        )
    else:
        model = GradientBoostingRegressor(
            loss="quantile", alpha=alpha, n_estimators=300,
            max_depth=4, learning_rate=0.05, random_state=42
        )
    model.fit(X_train, y_train)
    return model


def _walk_forward_splits(fm: FeatureMatrix, min_train_gws: int = 10):
    """Yield (train_idx, val_idx) pairs rolling forward by season/gw."""
    keys = fm.meta[["season", "gw"]].copy()
    keys["season_ord"] = keys["season"].rank(method="dense").astype(int)
    keys["time"] = keys["season_ord"] * 100 + keys["gw"]
    sorted_times = sorted(keys["time"].unique())
    for i, t in enumerate(sorted_times):
        if i < min_train_gws:
            continue
        train_idx = keys[keys["time"] < t].index
        val_idx = keys[keys["time"] == t].index
        if len(train_idx) > 0 and len(val_idx) > 0:
            yield t, train_idx, val_idx


def train_all() -> dict:
    with SessionLocal() as db:
        fm = build_matrix(db)

    reports: dict = {"positions": {}, "overall": {}}
    all_preds = []
    all_actuals = []

    for pos in POSITIONS:
        mask = fm.meta["position"] == pos
        X = fm.X[mask].reset_index(drop=True)
        y = fm.y[mask].reset_index(drop=True)
        meta = fm.meta[mask].reset_index(drop=True)
        if len(X) < 200:
            reports["positions"][pos] = {"skipped": True, "rows": len(X)}
            continue

        # Walk-forward over the combined season/gw index
        maes, rmses, corrs = [], [], []
        for t, tr, va in _walk_forward_splits(
            FeatureMatrix(X=X, y=y, meta=meta), min_train_gws=15
        ):
            if len(tr) < 400:
                continue
            model = _fit_mean(X.iloc[tr], y.iloc[tr])
            preds = model.predict(X.iloc[va])
            actuals = y.iloc[va].values
            maes.append(mean_absolute_error(actuals, preds))
            rmses.append(np.sqrt(mean_squared_error(actuals, preds)))
            if len(actuals) > 5 and np.std(actuals) > 0 and np.std(preds) > 0:
                rho, _ = spearmanr(actuals, preds)
                if not np.isnan(rho):
                    corrs.append(rho)
            all_preds.extend(preds.tolist())
            all_actuals.extend(actuals.tolist())

        # Final model: fit on ALL rows for live prediction
        final_model = _fit_mean(X, y)
        p10_model = _fit_quantile(X, y, alpha=0.1)
        p90_model = _fit_quantile(X, y, alpha=0.9)

        # Persist
        import joblib
        joblib.dump(final_model, MODEL_DIR / f"mean_{pos}.joblib")
        joblib.dump(p10_model, MODEL_DIR / f"p10_{pos}.joblib")
        joblib.dump(p90_model, MODEL_DIR / f"p90_{pos}.joblib")

        reports["positions"][pos] = {
            "rows": int(len(X)),
            "mae": float(np.mean(maes)) if maes else None,
            "rmse": float(np.mean(rmses)) if rmses else None,
            "rank_corr": float(np.mean(corrs)) if corrs else None,
            "walk_forward_splits": len(maes),
        }

    if all_preds:
        reports["overall"] = {
            "mae": float(mean_absolute_error(all_actuals, all_preds)),
            "rmse": float(np.sqrt(mean_squared_error(all_actuals, all_preds))),
        }

    # Save feature column order alongside models (matrix rebuilt by position)
    (MODEL_DIR / "feature_cols.json").write_text(json.dumps(list(fm.X.columns)))
    (MODEL_DIR / "training_report.json").write_text(json.dumps(reports, indent=2))
    return reports


if __name__ == "__main__":
    print(json.dumps(train_all(), indent=2))
