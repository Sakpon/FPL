"""Ingest historical FPL data from vaastav/Fantasy-Premier-League GitHub repo.

We pull:
- `{season}/players_raw.csv`  - player master list for the season
- `{season}/teams.csv`        - teams master list
- `{season}/fixtures.csv`     - all fixtures with difficulty
- `{season}/gws/merged_gw.csv`- per-player per-gameweek rows

This covers 3 full seasons (or however many we configure).
"""

from __future__ import annotations

import io
from typing import Iterable

import httpx
import pandas as pd
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
def _fetch_csv(url: str) -> pd.DataFrame:
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        return pd.read_csv(io.BytesIO(r.content))


def season_url(season: str, path: str) -> str:
    return f"{settings.vaastav_raw_base}/data/{season}/{path}"


def fetch_players_raw(season: str) -> pd.DataFrame:
    return _fetch_csv(season_url(season, "players_raw.csv"))


def fetch_teams(season: str) -> pd.DataFrame:
    return _fetch_csv(season_url(season, "teams.csv"))


def fetch_fixtures(season: str) -> pd.DataFrame:
    return _fetch_csv(season_url(season, "fixtures.csv"))


def fetch_merged_gw(season: str) -> pd.DataFrame:
    return _fetch_csv(season_url(season, "gws/merged_gw.csv"))


def iter_seasons(seasons: Iterable[str] | None = None) -> Iterable[str]:
    yield from (seasons or settings.historical_seasons)
