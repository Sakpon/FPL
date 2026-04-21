from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class PlayerOut(BaseModel):
    id: int
    web_name: str
    first_name: str
    second_name: str
    position: str
    team_id: int
    team_name: str | None = None
    team_short: str | None = None
    price: float  # £m
    form: float
    total_points: int
    selected_by_percent: float
    news: str | None = None

    class Config:
        from_attributes = True


class RecommendationOut(BaseModel):
    player_id: int
    web_name: str
    position: str
    team_short: str | None
    price: float
    predicted_points: float
    p10: float
    p90: float
    rank_in_position: int
    is_top_pick: bool
    is_captain: bool
    in_best_xi: bool
    social_score: float


class GameweekOut(BaseModel):
    id: int
    name: str
    deadline_time: datetime | None
    is_current: bool
    is_next: bool
    finished: bool
    average_entry_score: int
    highest_score: int


class AccuracyOut(BaseModel):
    gw: int
    mae: float | None = None
    rmse: float | None = None
    rank_corr: float | None = None
    n: int | None = None
    captain_actual: int | None = None
    xi_realised: int | None = None
    top_picks_hit: int | None = None
    top_picks_total: int | None = None
    status: str | None = None


class GuruMentionOut(BaseModel):
    source_name: str
    platform: str
    player_id: int
    web_name: str
    position: str
    sentiment: float
    is_captain_pick: bool
    is_avoid: bool
    is_differential: bool
    snippet: str
    captured_at: datetime


class BestXiOut(BaseModel):
    gw: int
    captain: RecommendationOut | None
    starters: list[RecommendationOut]
    bench: list[RecommendationOut]
    expected_points: float
    squad_cost: float


class TopPicksOut(BaseModel):
    gw: int
    picks: dict[str, RecommendationOut]


class TrainReport(BaseModel):
    positions: dict
    overall: dict


class AccuracyHistoryRow(BaseModel):
    gw: int
    mae: float
    rmse: float
    rank_corr: float
    xi_realised: int
    captain_actual: int | None
