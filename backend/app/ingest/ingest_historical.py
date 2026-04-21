"""Ingest 3 seasons of historical FPL data from vaastav into our DB."""

from __future__ import annotations

import math

import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import Fixture, Gameweek, Player, PlayerGWStats, Team
from app.db.session import SessionLocal
from app.ingest import vaastav


POSITION_NAMES = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}


def _safe_int(v, default: int = 0) -> int:
    try:
        if v is None or (isinstance(v, float) and math.isnan(v)):
            return default
        return int(v)
    except (TypeError, ValueError):
        return default


def _safe_float(v, default: float = 0.0) -> float:
    try:
        if v is None or (isinstance(v, float) and math.isnan(v)):
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def ingest_season(db: Session, season: str) -> dict[str, int]:
    """Load one season's worth of data.

    Players and teams are scoped per-season via a synthetic `player_id` using
    `season * 10000 + element`. This keeps 3 seasons distinct without a
    composite PK migration, and lets the model treat each season independently.
    """
    counts = {"teams": 0, "players": 0, "fixtures": 0, "stats": 0}

    season_prefix = int(season.split("-")[0])  # e.g. 2023
    team_id_offset = season_prefix * 100  # team id 1..20 -> 202301..202320

    teams_df = vaastav.fetch_teams(season)
    for _, row in teams_df.iterrows():
        tid = team_id_offset + _safe_int(row.get("id"))
        if db.get(Team, tid) is not None:
            continue
        db.add(
            Team(
                id=tid,
                name=str(row.get("name", ""))[:64],
                short_name=str(row.get("short_name", ""))[:8],
                strength=_safe_int(row.get("strength"), 3),
                strength_attack_home=_safe_int(row.get("strength_attack_home"), 1000),
                strength_attack_away=_safe_int(row.get("strength_attack_away"), 1000),
                strength_defence_home=_safe_int(row.get("strength_defence_home"), 1000),
                strength_defence_away=_safe_int(row.get("strength_defence_away"), 1000),
            )
        )
        counts["teams"] += 1
    db.commit()

    players_df = vaastav.fetch_players_raw(season)
    player_id_offset = season_prefix * 10000
    for _, row in players_df.iterrows():
        pid = player_id_offset + _safe_int(row.get("id"))
        if db.get(Player, pid) is not None:
            continue
        db.add(
            Player(
                id=pid,
                first_name=str(row.get("first_name", ""))[:64],
                second_name=str(row.get("second_name", ""))[:64],
                web_name=str(row.get("web_name", ""))[:64],
                team_id=team_id_offset + _safe_int(row.get("team")),
                position=POSITION_NAMES.get(
                    _safe_int(row.get("element_type")), "MID"
                ),
                now_cost=_safe_int(row.get("now_cost"), 40),
                status=str(row.get("status", "a"))[:2],
                chance_of_playing=_safe_int(row.get("chance_of_playing_next_round")) or None,
                selected_by_percent=_safe_float(row.get("selected_by_percent")),
                form=_safe_float(row.get("form")),
                total_points=_safe_int(row.get("total_points")),
                points_per_game=_safe_float(row.get("points_per_game")),
                ict_index=_safe_float(row.get("ict_index")),
                expected_goals=_safe_float(row.get("expected_goals")),
                expected_assists=_safe_float(row.get("expected_assists")),
                news=str(row.get("news", ""))[:500],
            )
        )
        counts["players"] += 1
    db.commit()

    fixtures_df = vaastav.fetch_fixtures(season)
    for _, row in fixtures_df.iterrows():
        fid = season_prefix * 100000 + _safe_int(row.get("id"))
        if db.get(Fixture, fid) is not None:
            continue
        gw = _safe_int(row.get("event"))
        if gw == 0:
            continue
        db.add(
            Fixture(
                id=fid,
                gw=gw,
                season=season,
                home_team_id=team_id_offset + _safe_int(row.get("team_h")),
                away_team_id=team_id_offset + _safe_int(row.get("team_a")),
                team_h_difficulty=_safe_int(row.get("team_h_difficulty"), 3),
                team_a_difficulty=_safe_int(row.get("team_a_difficulty"), 3),
                kickoff_time=None,
                finished=bool(row.get("finished", False)),
            )
        )
        counts["fixtures"] += 1
    db.commit()

    gw_df = vaastav.fetch_merged_gw(season)
    # merged_gw.csv has 'element' column for player id
    for _, row in gw_df.iterrows():
        element = _safe_int(row.get("element"))
        gw = _safe_int(row.get("GW") or row.get("round"))
        if element == 0 or gw == 0:
            continue
        pid = player_id_offset + element
        stat = PlayerGWStats(
            player_id=pid,
            season=season,
            gw=gw,
            opponent_team_id=team_id_offset + _safe_int(row.get("opponent_team")),
            was_home=bool(row.get("was_home", False)),
            minutes=_safe_int(row.get("minutes")),
            goals_scored=_safe_int(row.get("goals_scored")),
            assists=_safe_int(row.get("assists")),
            clean_sheets=_safe_int(row.get("clean_sheets")),
            goals_conceded=_safe_int(row.get("goals_conceded")),
            own_goals=_safe_int(row.get("own_goals")),
            penalties_saved=_safe_int(row.get("penalties_saved")),
            penalties_missed=_safe_int(row.get("penalties_missed")),
            yellow_cards=_safe_int(row.get("yellow_cards")),
            red_cards=_safe_int(row.get("red_cards")),
            saves=_safe_int(row.get("saves")),
            bonus=_safe_int(row.get("bonus")),
            bps=_safe_int(row.get("bps")),
            influence=_safe_float(row.get("influence")),
            creativity=_safe_float(row.get("creativity")),
            threat=_safe_float(row.get("threat")),
            ict_index=_safe_float(row.get("ict_index")),
            expected_goals=_safe_float(row.get("expected_goals")),
            expected_assists=_safe_float(row.get("expected_assists")),
            expected_goal_involvements=_safe_float(
                row.get("expected_goal_involvements")
            ),
            expected_goals_conceded=_safe_float(row.get("expected_goals_conceded")),
            value=_safe_int(row.get("value"), 40),
            total_points=_safe_int(row.get("total_points")),
        )
        db.add(stat)
        counts["stats"] += 1
    db.commit()

    return counts


def ingest_all() -> dict[str, dict[str, int]]:
    from app.core.config import settings
    from app.db.init_db import init_db

    init_db()
    summary: dict[str, dict[str, int]] = {}
    with SessionLocal() as db:
        for season in settings.historical_seasons:
            try:
                summary[season] = ingest_season(db, season)
            except Exception as e:  # noqa: BLE001
                summary[season] = {"error": 1, "message": str(e)[:200]}
    return summary


if __name__ == "__main__":
    import json

    print(json.dumps(ingest_all(), indent=2))
