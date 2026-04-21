"""Deterministic offline seed for local dev / CI / demos.

Generates synthetic-but-realistic data so the portal runs end-to-end without
network. Uses fixed seeds so predictions are reproducible.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta

from app.db.init_db import init_db
from app.db.models import (
    ActualResult,
    Fixture,
    Gameweek,
    GuruMention,
    GuruSource,
    Player,
    PlayerGWStats,
    Team,
)
from app.db.session import SessionLocal

TEAMS = [
    ("Arsenal", "ARS"), ("Aston Villa", "AVL"), ("Bournemouth", "BOU"),
    ("Brentford", "BRE"), ("Brighton", "BHA"), ("Chelsea", "CHE"),
    ("Crystal Palace", "CRY"), ("Everton", "EVE"), ("Fulham", "FUL"),
    ("Liverpool", "LIV"), ("Man City", "MCI"), ("Man Utd", "MUN"),
    ("Newcastle", "NEW"), ("Nott'm Forest", "NFO"), ("Spurs", "TOT"),
    ("West Ham", "WHU"), ("Wolves", "WOL"), ("Burnley", "BUR"),
    ("Leicester", "LEI"), ("Leeds", "LEE"),
]

PLAYER_POOL = {
    "GK": [
        ("David", "Raya", "Raya", 10, 55), ("Alisson", "Becker", "Alisson", 10, 55),
        ("Ederson", "Moraes", "Ederson", 11, 55), ("Jordan", "Pickford", "Pickford", 8, 50),
        ("Nick", "Pope", "Pope", 13, 50), ("Robert", "Sanchez", "Sanchez", 6, 47),
        ("Andre", "Onana", "Onana", 12, 50), ("Mark", "Flekken", "Flekken", 4, 45),
        ("Bernd", "Leno", "Leno", 9, 47), ("Matz", "Sels", "Sels", 14, 48),
    ],
    "DEF": [
        ("William", "Saliba", "Saliba", 1, 60), ("Gabriel", "Magalhaes", "Gabriel", 1, 60),
        ("Virgil", "van Dijk", "Van Dijk", 10, 65), ("Trent", "Alexander-Arnold", "TAA", 10, 70),
        ("Kieran", "Trippier", "Trippier", 13, 65), ("Ruben", "Dias", "Dias", 11, 58),
        ("Josko", "Gvardiol", "Gvardiol", 11, 55), ("Pervis", "Estupinan", "Estupinan", 5, 50),
        ("Pedro", "Porro", "Porro", 15, 55), ("Cristian", "Romero", "Romero", 15, 55),
        ("Micky", "van de Ven", "Van de Ven", 15, 50), ("Ola", "Aina", "Aina", 14, 50),
        ("Murillo", "Santiago", "Murillo", 14, 55), ("Lewis", "Hall", "Hall", 13, 48),
        ("Jurrien", "Timber", "Timber", 1, 55), ("Ben", "White", "White", 1, 55),
        ("Antonee", "Robinson", "Robinson", 9, 48), ("Joachim", "Andersen", "Andersen", 9, 45),
        ("Vitalii", "Mykolenko", "Mykolenko", 8, 45), ("James", "Tarkowski", "Tarkowski", 8, 45),
    ],
    "MID": [
        ("Mohamed", "Salah", "Salah", 10, 130), ("Bukayo", "Saka", "Saka", 1, 100),
        ("Cole", "Palmer", "Palmer", 6, 110), ("Bruno", "Fernandes", "Bruno F.", 12, 85),
        ("Phil", "Foden", "Foden", 11, 95), ("Kevin", "De Bruyne", "KDB", 11, 95),
        ("Martin", "Odegaard", "Odegaard", 1, 85), ("Son", "Heung-min", "Son", 15, 100),
        ("James", "Maddison", "Maddison", 15, 75), ("Luis", "Diaz", "Diaz", 10, 75),
        ("Morgan", "Rogers", "Rogers", 2, 55), ("Bryan", "Mbeumo", "Mbeumo", 4, 75),
        ("Anthony", "Gordon", "Gordon", 13, 75), ("Jacob", "Murphy", "Murphy", 13, 55),
        ("Eberechi", "Eze", "Eze", 7, 70), ("Jarrod", "Bowen", "Bowen", 16, 75),
        ("Mohammed", "Kudus", "Kudus", 16, 65), ("Dwight", "McNeil", "McNeil", 8, 50),
        ("Morgan", "Gibbs-White", "Gibbs-White", 14, 65), ("Alex", "Iwobi", "Iwobi", 9, 55),
    ],
    "FWD": [
        ("Erling", "Haaland", "Haaland", 11, 145), ("Alexander", "Isak", "Isak", 13, 85),
        ("Ollie", "Watkins", "Watkins", 2, 90), ("Chris", "Wood", "Wood", 14, 65),
        ("Dominic", "Solanke", "Solanke", 15, 75), ("Jean-Philippe", "Mateta", "Mateta", 7, 65),
        ("Nicolas", "Jackson", "Jackson", 6, 75), ("Darwin", "Nunez", "Nunez", 10, 75),
        ("Rasmus", "Hojlund", "Hojlund", 12, 65), ("Yoane", "Wissa", "Wissa", 4, 65),
    ],
}

GURUS = [
    ("Let's Talk FPL", "youtube", "LetsTalkFPL", 1.3),
    ("FPL Harry", "youtube", "FPLHarry", 1.2),
    ("FPL Family", "youtube", "FPLFamily", 1.1),
    ("FPL Mate", "youtube", "FPLMate", 1.0),
    ("FPL Focal", "youtube", "FPLFocal", 1.0),
    ("Planet FPL", "youtube", "PlanetFPL", 1.1),
    ("FPL Raptor", "youtube", "FPLRaptor", 1.2),
    ("FPL BlackBox", "youtube", "FPLBlackBox", 1.3),
    ("The FPL Wire", "youtube", "TheFPLWire", 0.9),
    ("FPL Andy", "youtube", "FPLAndy", 1.0),
    ("@FPLHarry", "x", "FPLHarry", 1.1),
    ("@LetsTalkFPL", "x", "LetsTalkFPL", 1.1),
    ("@OfficialFPL", "x", "OfficialFPL", 1.0),
]


def seed(seasons: tuple[str, ...] = ("2023-24", "2024-25", "live")) -> dict[str, int]:
    init_db()
    rng = random.Random(42)
    stats_written = 0
    fixtures_written = 0

    with SessionLocal() as db:
        # wipe previous seed (keep schema) for idempotency
        for tbl in [
            GuruMention, GuruSource, ActualResult, PlayerGWStats,
            Fixture, Gameweek, Player, Team,
        ]:
            db.query(tbl).delete()
        db.commit()

        # Teams: one canonical set, re-used per season with season-prefixed ids
        for season in seasons:
            season_prefix = int(season.split("-")[0]) if season != "live" else 9999
            for i, (name, short) in enumerate(TEAMS, start=1):
                tid = season_prefix * 100 + i
                db.add(Team(
                    id=tid, name=name, short_name=short,
                    strength=rng.randint(2, 5),
                    strength_attack_home=1000 + rng.randint(-200, 400),
                    strength_attack_away=1000 + rng.randint(-300, 300),
                    strength_defence_home=1000 + rng.randint(-200, 400),
                    strength_defence_away=1000 + rng.randint(-300, 300),
                ))
        db.commit()

        # Gameweeks (live season)
        base = datetime(2026, 4, 15)
        for g in range(1, 39):
            db.add(Gameweek(
                id=g, name=f"Gameweek {g}", season="live",
                deadline_time=base - timedelta(days=(38 - g) * 7),
                is_current=(g == 34), is_next=(g == 35),
                finished=(g < 34),
                average_entry_score=rng.randint(38, 70),
                highest_score=rng.randint(85, 140),
            ))
        db.commit()

        for season in seasons:
            season_prefix = int(season.split("-")[0]) if season != "live" else 9999
            team_offset = season_prefix * 100
            player_offset = season_prefix * 10000

            # Players
            element_id = 0
            for pos, pool in PLAYER_POOL.items():
                for first, last, web, team_idx, base_pts in pool:
                    element_id += 1
                    pid = player_offset + element_id
                    # price jitter between seasons
                    price = 40 + base_pts // 2 + rng.randint(-3, 5)
                    db.add(Player(
                        id=pid, first_name=first, second_name=last, web_name=web,
                        team_id=team_offset + team_idx, position=pos,
                        now_cost=max(38, min(145, price)),
                        status="a",
                        selected_by_percent=round(rng.uniform(0.1, 55.0), 1),
                        form=round(rng.uniform(0.0, 8.0), 1),
                        total_points=base_pts + rng.randint(-25, 35),
                        points_per_game=round(base_pts / 38 + rng.uniform(-0.4, 0.4), 1),
                        ict_index=round(rng.uniform(40, 320), 1),
                        expected_goals=round(rng.uniform(0, 22), 2),
                        expected_assists=round(rng.uniform(0, 14), 2),
                    ))
            db.commit()

            # Fixtures per gameweek
            n_gws = 38
            for gw in range(1, n_gws + 1):
                teams = list(range(1, 21))
                rng.shuffle(teams)
                for i in range(0, 20, 2):
                    home, away = teams[i], teams[i + 1]
                    fid = season_prefix * 100000 + (gw * 100) + (i // 2)
                    db.add(Fixture(
                        id=fid, gw=gw, season=season,
                        home_team_id=team_offset + home,
                        away_team_id=team_offset + away,
                        team_h_difficulty=rng.randint(2, 5),
                        team_a_difficulty=rng.randint(2, 5),
                        finished=(season != "live") or (gw < 34),
                    ))
                    fixtures_written += 1
            db.commit()

            # Per-GW stats for each player — realistic distribution
            for pos, pool in PLAYER_POOL.items():
                for i, (first, last, web, team_idx, base_pts) in enumerate(pool, start=1):
                    pid = player_offset + _position_start(pos) + i
                    ppg = base_pts / 38.0
                    for gw in range(1, n_gws + 1):
                        # synthesize points around PPG with noise + occasional haul
                        haul = rng.random() < 0.08
                        mins = 90 if rng.random() < 0.78 else rng.choice([0, 20, 45, 60, 70, 85])
                        pts = max(0, int(rng.gauss(ppg, 2.4)))
                        if mins == 0:
                            pts = 0
                        if haul and mins >= 60:
                            pts += rng.randint(5, 12)
                        bonus = 3 if haul else (rng.choice([0, 0, 0, 1, 2]) if pts >= 6 else 0)
                        goals = 0
                        assists = 0
                        if pos in ("MID", "FWD") and pts >= 7:
                            goals = rng.choice([1, 1, 2])
                        elif pos == "DEF" and pts >= 7:
                            goals = rng.choice([0, 0, 1])
                        if pts >= 5 and rng.random() < 0.3:
                            assists = 1
                        db.add(PlayerGWStats(
                            player_id=pid, season=season, gw=gw,
                            opponent_team_id=team_offset + rng.randint(1, 20),
                            was_home=bool(gw % 2),
                            minutes=mins, goals_scored=goals, assists=assists,
                            clean_sheets=(1 if pos in ("GK", "DEF") and rng.random() < 0.33 else 0),
                            goals_conceded=rng.randint(0, 3),
                            saves=(rng.randint(0, 6) if pos == "GK" else 0),
                            bonus=bonus, bps=pts * 3 + rng.randint(-4, 8),
                            influence=round(rng.uniform(0, 80), 1),
                            creativity=round(rng.uniform(0, 80), 1),
                            threat=round(rng.uniform(0, 120), 1),
                            ict_index=round(rng.uniform(0, 25), 1),
                            expected_goals=round(rng.uniform(0, 0.8), 2),
                            expected_assists=round(rng.uniform(0, 0.6), 2),
                            expected_goal_involvements=round(rng.uniform(0, 1.2), 2),
                            expected_goals_conceded=round(rng.uniform(0.5, 2.2), 2),
                            value=40 + base_pts // 2,
                            total_points=pts,
                        ))
                        stats_written += 1
                        # also write actual_results for the live season past GWs
                        if season == "live" and gw < 34:
                            db.add(ActualResult(
                                player_id=pid, season="live", gw=gw,
                                actual_points=pts, goals_scored=goals,
                                assists=assists,
                                clean_sheet=(pos in ("GK", "DEF") and rng.random() < 0.33),
                                minutes=mins, bonus=bonus,
                            ))
                db.commit()

        # Gurus + mentions for upcoming GW 35
        for name, platform, handle, w in GURUS:
            db.add(GuruSource(name=name, platform=platform, handle=handle, weight=w))
        db.commit()

        # pick some preferred players per guru for the upcoming GW
        sources = db.query(GuruSource).all()
        live_prefix = 9999
        for src in sources:
            # guru favours 4-6 players
            live_players = db.query(Player).filter(
                Player.id.between(live_prefix * 10000, live_prefix * 10000 + 9999)
            ).all()
            rng.shuffle(live_players)
            picks = live_players[: rng.randint(4, 7)]
            for i, player in enumerate(picks):
                db.add(GuruMention(
                    source_id=src.id,
                    player_id=player.id,
                    gw=35,
                    sentiment=round(rng.uniform(0.2, 1.0), 2),
                    is_captain_pick=(i == 0 and rng.random() < 0.5),
                    is_differential=(player.selected_by_percent < 8 and rng.random() < 0.4),
                    is_avoid=False,
                    snippet=f"{src.name} highlighted {player.web_name} for GW35",
                ))
        db.commit()

    return {"fixtures": fixtures_written, "stats": stats_written}


def _position_start(pos: str) -> int:
    order = ["GK", "DEF", "MID", "FWD"]
    n = {"GK": len(PLAYER_POOL["GK"]), "DEF": len(PLAYER_POOL["DEF"]),
         "MID": len(PLAYER_POOL["MID"]), "FWD": len(PLAYER_POOL["FWD"])}
    start = 0
    for p in order:
        if p == pos:
            return start
        start += n[p]
    return start


if __name__ == "__main__":
    import json

    print(json.dumps(seed(), indent=2))
