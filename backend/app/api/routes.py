from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.schemas import (
    AccuracyOut,
    BestXiOut,
    GameweekOut,
    GuruMentionOut,
    PlayerOut,
    RecommendationOut,
    TopPicksOut,
)
from app.db.models import (
    ActualResult,
    Gameweek,
    GuruMention,
    GuruSource,
    Player,
    PlayerGWStats,
    Recommendation,
    Team,
)
from app.db.session import get_db
from app.services.recommendations import accuracy_for_gw, generate_recommendations

router = APIRouter()


def _current_gw(db: Session) -> Gameweek:
    gw = db.execute(select(Gameweek).where(Gameweek.is_next == True)).scalar()  # noqa: E712
    if gw is None:
        gw = db.execute(select(Gameweek).where(Gameweek.is_current == True)).scalar()  # noqa: E712
    if gw is None:
        gw = db.execute(
            select(Gameweek).order_by(Gameweek.id.desc()).limit(1)
        ).scalar()
    if gw is None:
        raise HTTPException(404, "No gameweeks loaded")
    return gw


def _rec_to_out(r: Recommendation, team_lookup: dict[int, str]) -> RecommendationOut:
    return RecommendationOut(
        player_id=r.player_id,
        web_name=r.player.web_name if r.player else "",
        position=r.position,
        team_short=team_lookup.get(r.player.team_id if r.player else -1),
        price=(r.player.now_cost / 10.0) if r.player else 0.0,
        predicted_points=round(r.predicted_points, 2),
        p10=round(r.p10, 2),
        p90=round(r.p90, 2),
        rank_in_position=r.rank_in_position,
        is_top_pick=r.is_top_pick,
        is_captain=r.is_captain,
        in_best_xi=r.in_best_xi,
        social_score=round(r.social_score, 2),
    )


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@router.get("/gameweeks/current", response_model=GameweekOut)
def current_gameweek(db: Session = Depends(get_db)) -> GameweekOut:
    gw = _current_gw(db)
    return GameweekOut.model_validate(gw, from_attributes=True)


@router.get("/gameweeks", response_model=list[GameweekOut])
def list_gameweeks(db: Session = Depends(get_db)) -> list[GameweekOut]:
    gws = db.query(Gameweek).order_by(Gameweek.id).all()
    return [GameweekOut.model_validate(g, from_attributes=True) for g in gws]


def _team_lookup(db: Session) -> dict[int, str]:
    return {t.id: t.short_name for t in db.query(Team).all()}


@router.get("/players", response_model=list[PlayerOut])
def list_players(
    position: str | None = Query(default=None, pattern="^(GK|DEF|MID|FWD)$"),
    limit: int = 200,
    search: str | None = None,
    db: Session = Depends(get_db),
) -> list[PlayerOut]:
    q = db.query(Player).filter(Player.id >= 99990000, Player.id < 99999999)  # live season only
    if position:
        q = q.filter(Player.position == position)
    if search:
        like = f"%{search}%"
        q = q.filter(
            (Player.web_name.ilike(like))
            | (Player.first_name.ilike(like))
            | (Player.second_name.ilike(like))
        )
    q = q.order_by(Player.total_points.desc()).limit(limit)
    teams = _team_lookup(db)
    return [
        PlayerOut(
            id=p.id, web_name=p.web_name, first_name=p.first_name,
            second_name=p.second_name, position=p.position,
            team_id=p.team_id, team_short=teams.get(p.team_id),
            team_name=(p.team.name if p.team else None),
            price=p.now_cost / 10.0, form=p.form,
            total_points=p.total_points,
            selected_by_percent=p.selected_by_percent,
            news=p.news,
        )
        for p in q.all()
    ]


@router.get("/players/{player_id}", response_model=PlayerOut)
def player_detail(player_id: int, db: Session = Depends(get_db)) -> PlayerOut:
    p = db.get(Player, player_id)
    if p is None:
        raise HTTPException(404, "Player not found")
    teams = _team_lookup(db)
    return PlayerOut(
        id=p.id, web_name=p.web_name, first_name=p.first_name,
        second_name=p.second_name, position=p.position,
        team_id=p.team_id, team_short=teams.get(p.team_id),
        team_name=(p.team.name if p.team else None),
        price=p.now_cost / 10.0, form=p.form,
        total_points=p.total_points,
        selected_by_percent=p.selected_by_percent, news=p.news,
    )


@router.get("/players/{player_id}/history")
def player_history(player_id: int, db: Session = Depends(get_db)) -> list[dict]:
    rows = (
        db.query(PlayerGWStats)
        .filter(PlayerGWStats.player_id == player_id)
        .order_by(PlayerGWStats.season, PlayerGWStats.gw)
        .limit(250)
        .all()
    )
    return [
        {
            "season": r.season, "gw": r.gw,
            "points": r.total_points, "minutes": r.minutes,
            "goals": r.goals_scored, "assists": r.assists,
            "bonus": r.bonus, "bps": r.bps, "xg": r.expected_goals,
            "xa": r.expected_assists,
        }
        for r in rows
    ]


@router.get("/recommendations/top-picks/{gw}", response_model=TopPicksOut)
def top_picks(gw: int, db: Session = Depends(get_db)) -> TopPicksOut:
    recs = (
        db.query(Recommendation)
        .filter(Recommendation.gw == gw, Recommendation.is_top_pick == True)  # noqa: E712
        .all()
    )
    if not recs:
        raise HTTPException(404, "No recommendations for gw")
    teams = _team_lookup(db)
    picks = {r.position: _rec_to_out(r, teams) for r in recs}
    return TopPicksOut(gw=gw, picks=picks)


@router.get("/recommendations/best-xi/{gw}", response_model=BestXiOut)
def best_xi(gw: int, db: Session = Depends(get_db)) -> BestXiOut:
    recs = (
        db.query(Recommendation)
        .filter(
            Recommendation.gw == gw,
            (Recommendation.in_best_xi == True) | (Recommendation.is_captain == True),  # noqa: E712
        )
        .all()
    )
    if not recs:
        raise HTTPException(404, "No best XI for gw — run /admin/generate first")
    teams = _team_lookup(db)
    starters = [r for r in recs if r.in_best_xi]
    bench_recs = (
        db.query(Recommendation)
        .filter(Recommendation.gw == gw, Recommendation.in_best_xi == False)  # noqa: E712
        .order_by(Recommendation.predicted_points.desc())
        .all()
    )
    # optimizer marks exactly 15 as squad; bench is 4 non-starters with highest preds
    starter_ids = {r.player_id for r in starters}
    # We need 15 squad - but model doesn't store is_squad separately;
    # use captain + starters + top-preds across all positions not in starters
    bench: list[Recommendation] = []
    cap_id = next((r.player_id for r in recs if r.is_captain), None)
    captain_rec = next((r for r in recs if r.is_captain), None)
    cost = 0.0
    xp = 0.0
    for r in starters:
        cost += (r.player.now_cost / 10.0) if r.player else 0
        xp += r.predicted_points
    if captain_rec:
        xp += captain_rec.predicted_points  # captain doubles
    # pick best 4 from bench_recs (outside XI)
    for r in bench_recs:
        if len(bench) == 4:
            break
        if r.player_id in starter_ids:
            continue
        bench.append(r)
        cost += (r.player.now_cost / 10.0) if r.player else 0

    return BestXiOut(
        gw=gw,
        captain=_rec_to_out(captain_rec, teams) if captain_rec else None,
        starters=[_rec_to_out(r, teams) for r in starters],
        bench=[_rec_to_out(r, teams) for r in bench],
        expected_points=round(xp, 2),
        squad_cost=round(cost, 1),
    )


@router.get("/recommendations/{gw}", response_model=list[RecommendationOut])
def recs_for_gw(
    gw: int,
    position: str | None = Query(default=None, pattern="^(GK|DEF|MID|FWD)$"),
    limit: int = 50,
    db: Session = Depends(get_db),
) -> list[RecommendationOut]:
    q = db.query(Recommendation).filter(Recommendation.gw == gw)
    if position:
        q = q.filter(Recommendation.position == position)
    q = q.order_by(Recommendation.predicted_points.desc()).limit(limit)
    teams = _team_lookup(db)
    return [_rec_to_out(r, teams) for r in q.all()]


@router.get("/accuracy/history", response_model=list[AccuracyOut])
def accuracy_history(db: Session = Depends(get_db)) -> list[AccuracyOut]:
    # Use aggregated SQL for a quick sparkline; detailed per-gw comes from recompute
    gws = (
        db.query(Recommendation.gw)
        .filter(Recommendation.season == "live")
        .distinct()
        .order_by(Recommendation.gw)
        .all()
    )
    out: list[AccuracyOut] = []
    for (g,) in gws:
        acc = accuracy_for_gw(db, g, "live")
        out.append(AccuracyOut(**{k: v for k, v in acc.items() if k != "per_position"}))
    return out


@router.get("/accuracy/{gw}", response_model=AccuracyOut)
def accuracy_endpoint(gw: int, db: Session = Depends(get_db)) -> AccuracyOut:
    acc = accuracy_for_gw(db, gw, "live")
    return AccuracyOut(**{k: v for k, v in acc.items() if k != "per_position"})


@router.get("/gurus/mentions/{gw}", response_model=list[GuruMentionOut])
def guru_mentions(
    gw: int, limit: int = 100, db: Session = Depends(get_db)
) -> list[GuruMentionOut]:
    rows = (
        db.query(GuruMention, GuruSource, Player)
        .join(GuruSource, GuruMention.source_id == GuruSource.id)
        .join(Player, GuruMention.player_id == Player.id)
        .filter(GuruMention.gw == gw)
        .order_by(GuruMention.captured_at.desc())
        .limit(limit)
        .all()
    )
    return [
        GuruMentionOut(
            source_name=src.name, platform=src.platform,
            player_id=p.id, web_name=p.web_name, position=p.position,
            sentiment=m.sentiment, is_captain_pick=m.is_captain_pick,
            is_avoid=m.is_avoid, is_differential=m.is_differential,
            snippet=m.snippet, captured_at=m.captured_at,
        )
        for (m, src, p) in rows
    ]


@router.get("/gurus/summary/{gw}")
def gurus_summary(gw: int, db: Session = Depends(get_db)) -> list[dict]:
    """Most-mentioned players for a gameweek."""
    rows = (
        db.query(
            Player.id, Player.web_name, Player.position,
            func.count(GuruMention.id).label("mentions"),
            func.sum(GuruMention.sentiment).label("sentiment_sum"),
        )
        .join(GuruMention, GuruMention.player_id == Player.id)
        .filter(GuruMention.gw == gw)
        .group_by(Player.id)
        .order_by(func.count(GuruMention.id).desc())
        .limit(20)
        .all()
    )
    teams = _team_lookup(db)
    out = []
    for pid, name, pos, n, senti in rows:
        p = db.get(Player, pid)
        out.append({
            "player_id": pid, "web_name": name, "position": pos,
            "team_short": teams.get(p.team_id) if p else None,
            "mentions": int(n), "sentiment_sum": round(float(senti or 0), 2),
        })
    return out


# ---------- admin endpoints (no auth; dev-only) ----------

@router.post("/admin/seed")
def admin_seed() -> dict:
    from app.ingest.seed_offline import seed

    return seed()


@router.post("/admin/train")
def admin_train() -> dict:
    from app.ml.train import train_all

    return train_all()


@router.post("/admin/generate/{gw}")
def admin_generate(gw: int, db: Session = Depends(get_db)) -> dict:
    return generate_recommendations(db, gw=gw, season="live")
