"""Feature engineering for FPL point prediction.

Design:
- One row per (player, season, gw).
- Rolling windows only use PAST gameweeks to avoid target leakage.
- Features are split into: form (rolling), fixture context, team strength,
  player price/ownership, social (guru mentions).
- Per-position models are trained; here we build one matrix and let the
  trainer split by position.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import (
    Fixture,
    GuruMention,
    GuruSource,
    Player,
    PlayerGWStats,
    Team,
)

ROLLING_WINDOWS = (3, 5, 10)


@dataclass
class FeatureMatrix:
    X: pd.DataFrame
    y: pd.Series
    meta: pd.DataFrame  # player_id, season, gw, position


ROLLING_COLS = [
    "minutes", "goals_scored", "assists", "clean_sheets", "saves",
    "bonus", "bps", "ict_index", "expected_goals", "expected_assists",
    "expected_goal_involvements", "expected_goals_conceded",
    "total_points", "threat", "creativity", "influence",
]


def _load_player_frame(db: Session) -> pd.DataFrame:
    players = (
        db.query(
            Player.id, Player.web_name, Player.position, Player.team_id, Player.now_cost
        )
        .all()
    )
    return pd.DataFrame(
        players, columns=["player_id", "web_name", "position", "team_id", "price"]
    )


def _load_team_frame(db: Session) -> pd.DataFrame:
    rows = db.query(
        Team.id, Team.strength, Team.strength_attack_home, Team.strength_attack_away,
        Team.strength_defence_home, Team.strength_defence_away,
    ).all()
    return pd.DataFrame(
        rows,
        columns=[
            "team_id", "team_strength", "tsah", "tsaa", "tsdh", "tsda",
        ],
    )


def _load_stats_frame(db: Session) -> pd.DataFrame:
    rows = db.query(PlayerGWStats).all()
    if not rows:
        return pd.DataFrame()
    data = [
        {
            "player_id": r.player_id,
            "season": r.season,
            "gw": r.gw,
            "opponent_team_id": r.opponent_team_id,
            "was_home": int(r.was_home),
            "minutes": r.minutes,
            "goals_scored": r.goals_scored,
            "assists": r.assists,
            "clean_sheets": r.clean_sheets,
            "saves": r.saves,
            "bonus": r.bonus,
            "bps": r.bps,
            "ict_index": r.ict_index,
            "expected_goals": r.expected_goals,
            "expected_assists": r.expected_assists,
            "expected_goal_involvements": r.expected_goal_involvements,
            "expected_goals_conceded": r.expected_goals_conceded,
            "total_points": r.total_points,
            "threat": r.threat,
            "creativity": r.creativity,
            "influence": r.influence,
        }
        for r in rows
    ]
    return pd.DataFrame(data)


def _load_fixture_frame(db: Session) -> pd.DataFrame:
    rows = db.query(
        Fixture.gw, Fixture.season, Fixture.home_team_id, Fixture.away_team_id,
        Fixture.team_h_difficulty, Fixture.team_a_difficulty,
    ).all()
    return pd.DataFrame(
        rows,
        columns=["gw", "season", "home_team_id", "away_team_id", "h_diff", "a_diff"],
    )


def _load_social_frame(db: Session) -> pd.DataFrame:
    rows = (
        db.query(
            GuruMention.player_id, GuruMention.gw, GuruMention.sentiment,
            GuruMention.is_captain_pick, GuruMention.is_avoid,
            GuruMention.is_differential, GuruSource.weight,
        )
        .join(GuruSource, GuruMention.source_id == GuruSource.id)
        .all()
    )
    if not rows:
        return pd.DataFrame(
            columns=[
                "player_id", "gw", "social_mentions", "social_weighted_sentiment",
                "social_captain_mentions", "social_avoid_mentions",
                "social_differential_mentions",
            ]
        )
    df = pd.DataFrame(
        rows,
        columns=["player_id", "gw", "sentiment", "captain", "avoid", "diff", "weight"],
    )
    df["weighted"] = df["sentiment"] * df["weight"]
    grouped = (
        df.groupby(["player_id", "gw"])
        .agg(
            social_mentions=("sentiment", "count"),
            social_weighted_sentiment=("weighted", "sum"),
            social_captain_mentions=("captain", "sum"),
            social_avoid_mentions=("avoid", "sum"),
            social_differential_mentions=("diff", "sum"),
        )
        .reset_index()
    )
    return grouped


def _rolling_features(stats: pd.DataFrame) -> pd.DataFrame:
    stats = stats.sort_values(["player_id", "season", "gw"]).copy()
    out = stats[["player_id", "season", "gw"]].copy()
    grouped = stats.groupby(["player_id", "season"], group_keys=False)

    for w in ROLLING_WINDOWS:
        for col in ROLLING_COLS:
            # shift(1) to prevent leakage: rolling window over prior GWs only
            r = grouped[col].apply(lambda s: s.shift(1).rolling(w, min_periods=1).mean())
            out[f"{col}_mean_{w}"] = r.values

    # season-to-date
    for col in ("total_points", "minutes", "expected_goals", "expected_assists"):
        out[f"{col}_cum"] = grouped[col].cumsum().shift(1).fillna(0).values

    return out


def build_matrix(db: Session) -> FeatureMatrix:
    stats = _load_stats_frame(db)
    if stats.empty:
        raise RuntimeError("No player_gw_stats rows — run ingestion or seed first.")

    players = _load_player_frame(db)
    teams = _load_team_frame(db)
    fixtures = _load_fixture_frame(db)
    social = _load_social_frame(db)

    rolling = _rolling_features(stats)
    df = stats.merge(rolling, on=["player_id", "season", "gw"], how="left")
    df = df.merge(players, on="player_id", how="left")
    df = df.merge(teams, on="team_id", how="left")

    # Fixture features: was_home determines which side's difficulty applies
    opponent = df[["opponent_team_id"]].rename(columns={"opponent_team_id": "team_id"})
    opp_team = opponent.merge(teams, on="team_id", how="left").add_prefix("opp_")
    df = pd.concat([df.reset_index(drop=True), opp_team.reset_index(drop=True)], axis=1)

    # Social merge (by player+gw, season-agnostic since live)
    df = df.merge(social, on=["player_id", "gw"], how="left")
    for c in (
        "social_mentions", "social_weighted_sentiment", "social_captain_mentions",
        "social_avoid_mentions", "social_differential_mentions",
    ):
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0).astype(float)

    # Encode position as int (per-position training keeps this constant anyway,
    # but having it helps combined validation)
    df["pos_code"] = df["position"].map({"GK": 0, "DEF": 1, "MID": 2, "FWD": 3}).fillna(2)

    # Target
    y = df["total_points"].astype(float)

    meta = df[["player_id", "season", "gw", "position", "web_name", "price"]].copy()

    feature_cols = [
        c for c in df.columns
        if c.endswith(tuple(f"_mean_{w}" for w in ROLLING_WINDOWS))
        or c.endswith("_cum")
        or c in {
            "was_home", "price", "pos_code",
            "team_strength", "tsah", "tsaa", "tsdh", "tsda",
            "opp_team_strength", "opp_tsah", "opp_tsaa", "opp_tsdh", "opp_tsda",
            "social_mentions", "social_weighted_sentiment",
            "social_captain_mentions", "social_avoid_mentions",
            "social_differential_mentions",
        }
    ]
    X = df[feature_cols].copy()
    for c in X.columns:
        X[c] = pd.to_numeric(X[c], errors="coerce")
    X = X.fillna(0.0).astype(float)
    return FeatureMatrix(X=X, y=y, meta=meta)
