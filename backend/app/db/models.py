from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), index=True)
    short_name: Mapped[str] = mapped_column(String(8))
    strength: Mapped[int] = mapped_column(Integer, default=3)
    strength_attack_home: Mapped[int] = mapped_column(Integer, default=1000)
    strength_attack_away: Mapped[int] = mapped_column(Integer, default=1000)
    strength_defence_home: Mapped[int] = mapped_column(Integer, default=1000)
    strength_defence_away: Mapped[int] = mapped_column(Integer, default=1000)


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(64))
    second_name: Mapped[str] = mapped_column(String(64))
    web_name: Mapped[str] = mapped_column(String(64), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    position: Mapped[str] = mapped_column(String(4), index=True)  # GK/DEF/MID/FWD
    now_cost: Mapped[int] = mapped_column(Integer, default=40)  # tenths of £m
    status: Mapped[str] = mapped_column(String(2), default="a")  # a, d, i, s, u
    chance_of_playing: Mapped[int | None] = mapped_column(Integer, nullable=True)
    selected_by_percent: Mapped[float] = mapped_column(Float, default=0.0)
    form: Mapped[float] = mapped_column(Float, default=0.0)
    total_points: Mapped[int] = mapped_column(Integer, default=0)
    points_per_game: Mapped[float] = mapped_column(Float, default=0.0)
    ict_index: Mapped[float] = mapped_column(Float, default=0.0)
    expected_goals: Mapped[float] = mapped_column(Float, default=0.0)
    expected_assists: Mapped[float] = mapped_column(Float, default=0.0)
    news: Mapped[str] = mapped_column(Text, default="")

    team: Mapped["Team"] = relationship(lazy="joined")


class Gameweek(Base):
    __tablename__ = "gameweeks"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(32))
    season: Mapped[str] = mapped_column(String(8), index=True)
    deadline_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)
    is_next: Mapped[bool] = mapped_column(Boolean, default=False)
    finished: Mapped[bool] = mapped_column(Boolean, default=False)
    average_entry_score: Mapped[int] = mapped_column(Integer, default=0)
    highest_score: Mapped[int] = mapped_column(Integer, default=0)


class Fixture(Base):
    __tablename__ = "fixtures"

    id: Mapped[int] = mapped_column(primary_key=True)
    gw: Mapped[int] = mapped_column(Integer, index=True)
    season: Mapped[str] = mapped_column(String(8), index=True)
    home_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    away_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    team_h_difficulty: Mapped[int] = mapped_column(Integer, default=3)
    team_a_difficulty: Mapped[int] = mapped_column(Integer, default=3)
    kickoff_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished: Mapped[bool] = mapped_column(Boolean, default=False)


class PlayerGWStats(Base):
    """Historical per-player per-gameweek stats (3 seasons)."""

    __tablename__ = "player_gw_stats"
    __table_args__ = (UniqueConstraint("player_id", "season", "gw", name="uq_pgs"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    season: Mapped[str] = mapped_column(String(8), index=True)
    gw: Mapped[int] = mapped_column(Integer, index=True)
    opponent_team_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    was_home: Mapped[bool] = mapped_column(Boolean, default=False)
    minutes: Mapped[int] = mapped_column(Integer, default=0)
    goals_scored: Mapped[int] = mapped_column(Integer, default=0)
    assists: Mapped[int] = mapped_column(Integer, default=0)
    clean_sheets: Mapped[int] = mapped_column(Integer, default=0)
    goals_conceded: Mapped[int] = mapped_column(Integer, default=0)
    own_goals: Mapped[int] = mapped_column(Integer, default=0)
    penalties_saved: Mapped[int] = mapped_column(Integer, default=0)
    penalties_missed: Mapped[int] = mapped_column(Integer, default=0)
    yellow_cards: Mapped[int] = mapped_column(Integer, default=0)
    red_cards: Mapped[int] = mapped_column(Integer, default=0)
    saves: Mapped[int] = mapped_column(Integer, default=0)
    bonus: Mapped[int] = mapped_column(Integer, default=0)
    bps: Mapped[int] = mapped_column(Integer, default=0)
    influence: Mapped[float] = mapped_column(Float, default=0.0)
    creativity: Mapped[float] = mapped_column(Float, default=0.0)
    threat: Mapped[float] = mapped_column(Float, default=0.0)
    ict_index: Mapped[float] = mapped_column(Float, default=0.0)
    expected_goals: Mapped[float] = mapped_column(Float, default=0.0)
    expected_assists: Mapped[float] = mapped_column(Float, default=0.0)
    expected_goal_involvements: Mapped[float] = mapped_column(Float, default=0.0)
    expected_goals_conceded: Mapped[float] = mapped_column(Float, default=0.0)
    value: Mapped[int] = mapped_column(Integer, default=40)
    total_points: Mapped[int] = mapped_column(Integer, default=0)


class GuruSource(Base):
    __tablename__ = "guru_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    platform: Mapped[str] = mapped_column(String(16), index=True)  # youtube / x
    handle: Mapped[str] = mapped_column(String(128))
    weight: Mapped[float] = mapped_column(Float, default=1.0)


class GuruMention(Base):
    __tablename__ = "guru_mentions"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("guru_sources.id"), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    gw: Mapped[int] = mapped_column(Integer, index=True)
    sentiment: Mapped[float] = mapped_column(Float, default=0.0)  # -1..+1
    is_captain_pick: Mapped[bool] = mapped_column(Boolean, default=False)
    is_avoid: Mapped[bool] = mapped_column(Boolean, default=False)
    is_differential: Mapped[bool] = mapped_column(Boolean, default=False)
    snippet: Mapped[str] = mapped_column(Text, default="")
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    source: Mapped["GuruSource"] = relationship(lazy="joined")
    player: Mapped["Player"] = relationship(lazy="joined")


class ModelVersion(Base):
    __tablename__ = "model_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    trained_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    mae: Mapped[float] = mapped_column(Float, default=0.0)
    rmse: Mapped[float] = mapped_column(Float, default=0.0)
    rank_corr: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str] = mapped_column(Text, default="")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(primary_key=True)
    gw: Mapped[int] = mapped_column(Integer, index=True)
    season: Mapped[str] = mapped_column(String(8), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    position: Mapped[str] = mapped_column(String(4), index=True)
    predicted_points: Mapped[float] = mapped_column(Float, default=0.0)
    p10: Mapped[float] = mapped_column(Float, default=0.0)
    p90: Mapped[float] = mapped_column(Float, default=0.0)
    rank_in_position: Mapped[int] = mapped_column(Integer, default=0)
    is_top_pick: Mapped[bool] = mapped_column(Boolean, default=False)
    is_captain: Mapped[bool] = mapped_column(Boolean, default=False)
    in_best_xi: Mapped[bool] = mapped_column(Boolean, default=False)
    social_score: Mapped[float] = mapped_column(Float, default=0.0)
    model_version_id: Mapped[int | None] = mapped_column(
        ForeignKey("model_versions.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    player: Mapped["Player"] = relationship(lazy="joined")


class ActualResult(Base):
    __tablename__ = "actual_results"
    __table_args__ = (UniqueConstraint("player_id", "season", "gw", name="uq_actual"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    gw: Mapped[int] = mapped_column(Integer, index=True)
    season: Mapped[str] = mapped_column(String(8), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    actual_points: Mapped[int] = mapped_column(Integer, default=0)
    goals_scored: Mapped[int] = mapped_column(Integer, default=0)
    assists: Mapped[int] = mapped_column(Integer, default=0)
    clean_sheet: Mapped[bool] = mapped_column(Boolean, default=False)
    minutes: Mapped[int] = mapped_column(Integer, default=0)
    bonus: Mapped[int] = mapped_column(Integer, default=0)
