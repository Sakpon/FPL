"""Social media ingest for top-10 FPL gurus.

YouTube:
- Uses `youtube-transcript-api` to fetch caption transcripts (no key needed).
- Caller provides a list of recent video IDs per channel. Fetching the channel
  video list requires either the YouTube Data API (key) or `yt-dlp` — we keep
  that out of the hot path and accept a list of video IDs to stay dependency-
  light.

X:
- Scraping X is restrictive; this module exposes a `record_tweet_mentions()`
  helper that accepts pre-parsed tweet dicts (so you can plug in snscrape,
  the paid API, or manual admin entry).

NLP:
- Rule-based player mention detection against the player web_name index.
- Simple sentiment using positive/captain/differential/avoid lexicons.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from sqlalchemy.orm import Session

from app.db.models import GuruMention, GuruSource, Player

POS_WORDS = {
    "captain", "captaincy", "essential", "nailed", "love", "stacked",
    "must-have", "must have", "triple up", "locked in", "set piece", "penalty taker",
    "form", "great fixture", "easy run", "banker", "popular pick",
}
CAPTAIN_WORDS = {"captain", "captaincy", "armband", "skipper", "triple captain"}
DIFF_WORDS = {"differential", "punt", "under the radar", "low owned", "off the radar"}
AVOID_WORDS = {"avoid", "sell", "drop", "injured", "rotation risk", "benched", "banned", "suspended", "stay away"}


@dataclass
class MentionExtract:
    player_id: int
    sentiment: float
    captain: bool
    differential: bool
    avoid: bool
    snippet: str


def _build_player_index(db: Session) -> list[tuple[re.Pattern[str], int]]:
    players = db.query(Player.id, Player.web_name, Player.second_name).all()
    index: list[tuple[re.Pattern[str], int]] = []
    # Prefer longer names first so "Bruno Fernandes" beats "Bruno" alone
    for pid, web_name, second_name in sorted(
        players, key=lambda r: len(r[1] or ""), reverse=True
    ):
        names = {n for n in (web_name, second_name) if n and len(n) > 2}
        for name in names:
            # word-boundary, case-insensitive
            pat = re.compile(rf"\b{re.escape(name)}\b", re.IGNORECASE)
            index.append((pat, pid))
    return index


def _score_window(text: str) -> tuple[float, bool, bool, bool]:
    t = text.lower()

    def any_of(words):
        return any(w in t for w in words)

    captain = any_of(CAPTAIN_WORDS)
    diff = any_of(DIFF_WORDS)
    avoid = any_of(AVOID_WORDS)
    sentiment = 0.0
    sentiment += 0.3 * sum(w in t for w in POS_WORDS)
    if captain:
        sentiment += 0.8
    if diff:
        sentiment += 0.2
    if avoid:
        sentiment -= 1.0
    return max(-1.0, min(1.5, sentiment)), captain, diff, avoid


def extract_mentions(
    db: Session, text: str, window: int = 80
) -> list[MentionExtract]:
    index = _build_player_index(db)
    seen: dict[int, MentionExtract] = {}
    for pat, pid in index:
        for m in pat.finditer(text):
            start = max(0, m.start() - window)
            end = min(len(text), m.end() + window)
            snippet = text[start:end]
            score, cap, diff, av = _score_window(snippet)
            prev = seen.get(pid)
            if prev is None or score > prev.sentiment:
                seen[pid] = MentionExtract(
                    player_id=pid, sentiment=score, captain=cap,
                    differential=diff, avoid=av, snippet=snippet.strip()[:300],
                )
    return list(seen.values())


def record_mentions(
    db: Session, source: GuruSource, gw: int, text: str
) -> int:
    mentions = extract_mentions(db, text)
    for m in mentions:
        db.add(GuruMention(
            source_id=source.id, player_id=m.player_id, gw=gw,
            sentiment=m.sentiment, is_captain_pick=m.captain,
            is_avoid=m.avoid, is_differential=m.differential,
            snippet=m.snippet,
        ))
    db.commit()
    return len(mentions)


def fetch_youtube_transcript(video_id: str) -> str:
    from youtube_transcript_api import YouTubeTranscriptApi

    lines = YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])
    return " ".join(line["text"] for line in lines if line.get("text"))


def ingest_youtube_video(
    db: Session, handle: str, video_id: str, gw: int
) -> int:
    src = db.query(GuruSource).filter_by(platform="youtube", handle=handle).first()
    if src is None:
        return 0
    try:
        transcript = fetch_youtube_transcript(video_id)
    except Exception:  # noqa: BLE001
        return 0
    return record_mentions(db, src, gw, transcript)


def record_tweet_mentions(
    db: Session, handle: str, gw: int, tweets: Iterable[str]
) -> int:
    src = db.query(GuruSource).filter_by(platform="x", handle=handle).first()
    if src is None:
        return 0
    total = 0
    for tweet in tweets:
        total += record_mentions(db, src, gw, tweet)
    return total
