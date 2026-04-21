"""Client for the official FPL API.

Endpoints used:
- /bootstrap-static/   players, teams, gameweeks
- /fixtures/           fixtures + difficulty
- /event/{id}/live/    live points for a gameweek
- /element-summary/{id}/  per-player history (current season)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings

POSITION_MAP = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
async def _get_json(client: httpx.AsyncClient, path: str) -> Any:
    r = await client.get(f"{settings.fpl_api_base}{path}", timeout=30.0)
    r.raise_for_status()
    return r.json()


async def fetch_bootstrap() -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        return await _get_json(client, "/bootstrap-static/")


async def fetch_fixtures() -> list[dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        return await _get_json(client, "/fixtures/")


async def fetch_event_live(event_id: int) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        return await _get_json(client, f"/event/{event_id}/live/")


async def fetch_element_summary(element_id: int) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        return await _get_json(client, f"/element-summary/{element_id}/")


def parse_deadline(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
