"""Ingest the live/current-season data from the official FPL API."""

from __future__ import annotations

import asyncio
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ActualResult, Fixture, Gameweek, Player, PlayerGWStats, Team
from app.db.session import SessionLocal
from app.ingest import fpl_api

CURRENT_SEASON_PREFIX = 9999  # live-season rows live in their own namespace
CURRENT_SEASON = "live"


def _tid(team_id: int) -> int:
    return CURRENT_SEASON_PREFIX * 100 + team_id


def _pid(element_id: int) -> int:
    return CURRENT_SEASON_PREFIX * 10000 + element_id


async def sync_bootstrap() -> dict[str, int]:
    counts = {"teams": 0, "players": 0, "gws": 0}
    data = await fpl_api.fetch_bootstrap()

    with SessionLocal() as db:
        for t in data.get("teams", []):
            tid = _tid(t["id"])
            team = db.get(Team, tid)
            if team is None:
                team = Team(id=tid)
                db.add(team)
                counts["teams"] += 1
            team.name = t["name"][:64]
            team.short_name = t["short_name"][:8]
            team.strength = t.get("strength", 3)
            team.strength_attack_home = t.get("strength_attack_home", 1000)
            team.strength_attack_away = t.get("strength_attack_away", 1000)
            team.strength_defence_home = t.get("strength_defence_home", 1000)
            team.strength_defence_away = t.get("strength_defence_away", 1000)

        for p in data.get("elements", []):
            pid = _pid(p["id"])
            player = db.get(Player, pid)
            if player is None:
                player = Player(id=pid)
                db.add(player)
                counts["players"] += 1
            player.first_name = p.get("first_name", "")[:64]
            player.second_name = p.get("second_name", "")[:64]
            player.web_name = p.get("web_name", "")[:64]
            player.team_id = _tid(p["team"])
            player.position = fpl_api.POSITION_MAP.get(p["element_type"], "MID")
            player.now_cost = p.get("now_cost", 40)
            player.status = p.get("status", "a")[:2]
            player.chance_of_playing = p.get("chance_of_playing_next_round")
            player.selected_by_percent = float(p.get("selected_by_percent", 0) or 0)
            player.form = float(p.get("form", 0) or 0)
            player.total_points = p.get("total_points", 0)
            player.points_per_game = float(p.get("points_per_game", 0) or 0)
            player.ict_index = float(p.get("ict_index", 0) or 0)
            player.expected_goals = float(p.get("expected_goals", 0) or 0)
            player.expected_assists = float(p.get("expected_assists", 0) or 0)
            player.news = (p.get("news", "") or "")[:500]

        for e in data.get("events", []):
            gw = db.get(Gameweek, e["id"])
            if gw is None:
                gw = Gameweek(id=e["id"])
                db.add(gw)
                counts["gws"] += 1
            gw.name = e.get("name", f"Gameweek {e['id']}")[:32]
            gw.season = CURRENT_SEASON
            gw.deadline_time = fpl_api.parse_deadline(e.get("deadline_time"))
            gw.is_current = e.get("is_current", False)
            gw.is_next = e.get("is_next", False)
            gw.finished = e.get("finished", False)
            gw.average_entry_score = e.get("average_entry_score", 0) or 0
            gw.highest_score = e.get("highest_score", 0) or 0

        db.commit()

    return counts


async def sync_fixtures() -> int:
    fixtures = await fpl_api.fetch_fixtures()
    added = 0
    with SessionLocal() as db:
        for f in fixtures:
            fid = CURRENT_SEASON_PREFIX * 100000 + f["id"]
            fx = db.get(Fixture, fid)
            if fx is None:
                fx = Fixture(id=fid)
                db.add(fx)
                added += 1
            fx.gw = f.get("event") or 0
            fx.season = CURRENT_SEASON
            fx.home_team_id = _tid(f["team_h"])
            fx.away_team_id = _tid(f["team_a"])
            fx.team_h_difficulty = f.get("team_h_difficulty", 3)
            fx.team_a_difficulty = f.get("team_a_difficulty", 3)
            fx.kickoff_time = fpl_api.parse_deadline(f.get("kickoff_time"))
            fx.finished = f.get("finished", False)
        db.commit()
    return added


async def sync_live_points(event_id: int) -> int:
    """Write ActualResult + PlayerGWStats for a finished gameweek from the
    /event/{id}/live/ endpoint. Training needs PlayerGWStats for its feature
    matrix; ActualResult is what accuracy_for_gw compares predictions against.
    """
    data = await fpl_api.fetch_event_live(event_id)
    elements = data.get("elements", [])
    written = 0
    with SessionLocal() as db:
        # Map fixtures in this GW → opponent + home/away for each player's team
        fixtures = db.query(Fixture).filter_by(gw=event_id, season=CURRENT_SEASON).all()
        team_ctx: dict[int, tuple[int, bool]] = {}  # team_id → (opponent_team_id, was_home)
        for f in fixtures:
            team_ctx[f.home_team_id] = (f.away_team_id, True)
            team_ctx[f.away_team_id] = (f.home_team_id, False)

        for e in elements:
            pid = _pid(e["id"])
            player = db.get(Player, pid)
            if player is None:
                continue
            stats = e.get("stats", {})
            opp, home = team_ctx.get(player.team_id, (None, False))

            actual = db.execute(
                select(ActualResult).where(
                    ActualResult.player_id == pid,
                    ActualResult.season == CURRENT_SEASON,
                    ActualResult.gw == event_id,
                )
            ).scalar_one_or_none()
            if actual is None:
                actual = ActualResult(
                    player_id=pid, season=CURRENT_SEASON, gw=event_id
                )
                db.add(actual)
            actual.actual_points = stats.get("total_points", 0) or 0
            actual.goals_scored = stats.get("goals_scored", 0) or 0
            actual.assists = stats.get("assists", 0) or 0
            actual.clean_sheet = bool(stats.get("clean_sheets", 0))
            actual.minutes = stats.get("minutes", 0) or 0
            actual.bonus = stats.get("bonus", 0) or 0

            gws = db.execute(
                select(PlayerGWStats).where(
                    PlayerGWStats.player_id == pid,
                    PlayerGWStats.season == CURRENT_SEASON,
                    PlayerGWStats.gw == event_id,
                )
            ).scalar_one_or_none()
            if gws is None:
                gws = PlayerGWStats(
                    player_id=pid, season=CURRENT_SEASON, gw=event_id
                )
                db.add(gws)
            gws.opponent_team_id = opp
            gws.was_home = home
            gws.minutes = stats.get("minutes", 0) or 0
            gws.goals_scored = stats.get("goals_scored", 0) or 0
            gws.assists = stats.get("assists", 0) or 0
            gws.clean_sheets = stats.get("clean_sheets", 0) or 0
            gws.goals_conceded = stats.get("goals_conceded", 0) or 0
            gws.own_goals = stats.get("own_goals", 0) or 0
            gws.penalties_saved = stats.get("penalties_saved", 0) or 0
            gws.penalties_missed = stats.get("penalties_missed", 0) or 0
            gws.yellow_cards = stats.get("yellow_cards", 0) or 0
            gws.red_cards = stats.get("red_cards", 0) or 0
            gws.saves = stats.get("saves", 0) or 0
            gws.bonus = stats.get("bonus", 0) or 0
            gws.bps = stats.get("bps", 0) or 0
            gws.influence = float(stats.get("influence") or 0)
            gws.creativity = float(stats.get("creativity") or 0)
            gws.threat = float(stats.get("threat") or 0)
            gws.ict_index = float(stats.get("ict_index") or 0)
            gws.expected_goals = float(stats.get("expected_goals") or 0)
            gws.expected_assists = float(stats.get("expected_assists") or 0)
            gws.expected_goal_involvements = float(
                stats.get("expected_goal_involvements") or 0
            )
            gws.expected_goals_conceded = float(
                stats.get("expected_goals_conceded") or 0
            )
            gws.value = player.now_cost or 40
            gws.total_points = stats.get("total_points", 0) or 0
            written += 1
        db.commit()
    return written


async def sync_all() -> dict[str, int]:
    r1 = await sync_bootstrap()
    r2 = await sync_fixtures()
    return {**r1, "fixtures": r2}


if __name__ == "__main__":
    print(asyncio.run(sync_all()))
