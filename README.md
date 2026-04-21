# FPL Oracle — Prediction Portal

A full-stack Fantasy Premier League prediction portal that:

1. Predicts **the highest-scoring player per position** each gameweek.
2. Picks the **best XI under £100m** (ILP optimizer) with a captain pick.
3. **Logs every recommendation** in a SQLite database and **compares it to actual
   points earned** after each gameweek finishes.
4. Fuses **3 seasons of historical FPL data** with **social-media signal** from
   the top-10 FPL YouTubers and X handles.

---

## Stack

- **Backend** — FastAPI + SQLAlchemy + SQLite, LightGBM per-position regressors,
  PuLP ILP optimizer, quantile regression for p10/p90 bands.
- **Frontend** — React 18 + TypeScript + Vite + Tailwind + Recharts + React Query.
- **Data** —
  - Historical: [`vaastav/Fantasy-Premier-League`](https://github.com/vaastav/Fantasy-Premier-League) (3 seasons).
  - Live: official FPL API (`fantasy.premierleague.com/api`).
  - Social: `youtube-transcript-api` for transcripts; pluggable X ingestion.
  - Offline: deterministic seed for zero-network demos (`seed_offline.py`).

---

## Quick start

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Seed offline data (3 seasons synthesized, deterministic) — or see below for
# real data ingest.
PYTHONPATH=. python -m app.ingest.seed_offline

# Train per-position LightGBM models with walk-forward CV
PYTHONPATH=. python -m app.ml.train

# Generate recommendations for an upcoming gameweek and log them
PYTHONPATH=. python -c "
from app.db.session import SessionLocal
from app.services.recommendations import generate_recommendations
with SessionLocal() as db:
    print(generate_recommendations(db, gw=35, season='live'))
"

# Start the API
PYTHONPATH=. uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173 (proxies /api to :8000)
```

Open <http://localhost:5173>.

---

## Loading real FPL data

### Historical (3 seasons from vaastav repo)

```bash
PYTHONPATH=. python -m app.ingest.ingest_historical
```

Pulls these files per configured season:

- `{season}/teams.csv`, `players_raw.csv`, `fixtures.csv`
- `{season}/gws/merged_gw.csv` (per-player per-gameweek stats)

Configured seasons live in `app/core/config.py::Settings.historical_seasons`.

### Live (official FPL API)

```bash
PYTHONPATH=. python -m app.ingest.ingest_live
```

Pulls `/bootstrap-static/` (players, teams, events) and `/fixtures/`. For
end-of-gameweek actuals, call `sync_live_points(event_id)` from
`app/ingest/ingest_live.py`.

---

## Social-media ingest (top-10 FPL gurus)

Covered channels (`app/core/config.py`):

> Let's Talk FPL · FPL Harry · FPL Family · FPL Mate · FPL Focal · Planet FPL ·
> FPL Raptor · FPL BlackBox · The FPL Wire · FPL Andy

### YouTube transcripts (no API key required)

```python
from app.db.session import SessionLocal
from app.ingest.social import ingest_youtube_video

with SessionLocal() as db:
    ingest_youtube_video(db, handle="LetsTalkFPL", video_id="<video-id>", gw=35)
```

Transcripts are tokenised and scored against the player web-name index.
Sentiment lexicons detect captain / differential / avoid intents. Mentions
land in the `guru_mentions` table and are fed into the prediction model as
weighted features (`social_weighted_sentiment`, `social_captain_mentions`,
etc.).

### X (Twitter)

`record_tweet_mentions()` accepts pre-parsed tweets (plug in snscrape, the
paid API, or a manual admin tool).

---

## How the prediction works (and how precise it is)

For **each (player, gameweek)** we build a feature vector with:

- **Rolling windows** (last 3 / 5 / 10 GWs) over 15+ stats: minutes, xG, xA,
  xGI, bonus, bps, ICT, threat, creativity, influence, total points.
- **Season-to-date cumulatives** for points, minutes, xG, xA.
- **Fixture context**: was_home, opponent attack/defence strength (home/away
  adjusted), team strength.
- **Social**: mention count, weighted sentiment, captain / avoid / differential
  mention counts.

**Training**

- One LightGBM regressor per position (GK / DEF / MID / FWD).
- Plus p10 and p90 **quantile regressors** for uncertainty bands.
- **Walk-forward cross-validation** across seasons — train on GW 1..N,
  validate on GW N+1, roll forward. Reports MAE, RMSE, rank Spearman ρ per
  position.

**Evaluation**

- Per-GW MAE and RMSE vs actual points.
- Spearman rank correlation of predicted vs actual within each GW (what
  matters for team selection).
- Top-pick hit rate per position.
- Captain success rate and XI realised points vs average.

All metrics land in `/api/accuracy/history` and the **Accuracy** page in the UI.

**Realistic bounds.** FPL points are high-variance (bonus, red cards, own
goals). Even the best public models land at MAE ≈ 2.0–2.5 pts/GW and rank ρ ≈
0.35–0.55. The portal reports these honestly and attaches p10–p90 bands to
every recommendation rather than pretending to be deterministic.

---

## API surface

```
GET  /api/health
GET  /api/gameweeks             list all
GET  /api/gameweeks/current     current / next
GET  /api/players               ?position= &search=
GET  /api/players/{id}
GET  /api/players/{id}/history
GET  /api/recommendations/top-picks/{gw}
GET  /api/recommendations/best-xi/{gw}
GET  /api/recommendations/{gw}  ?position= &limit=
GET  /api/accuracy/{gw}
GET  /api/accuracy/history
GET  /api/gurus/mentions/{gw}
GET  /api/gurus/summary/{gw}
POST /api/admin/seed
POST /api/admin/train
POST /api/admin/generate/{gw}
```

## Schema highlights

```
players                    — master player list, season-scoped ids
player_gw_stats            — per-player per-gameweek history (3 seasons)
gameweeks, fixtures        — schedule + difficulty
guru_sources, guru_mentions— sentiment feed from top-10 gurus
recommendations            — every prediction logged (predicted_points, p10, p90,
                             is_top_pick, is_captain, in_best_xi, social_score)
actual_results             — actual points after GW finish
model_versions             — training run metadata (mae, rmse, rank_corr)
```

## Project layout

```
backend/
  app/
    api/         FastAPI routes + Pydantic schemas
    core/        Settings
    db/          SQLAlchemy models + session
    ingest/      fpl_api, vaastav, live sync, social, seed
    ml/          features, train, predict, optimizer
    services/    recommendation orchestration + accuracy metrics
    main.py      FastAPI app factory
frontend/
  src/
    pages/       Dashboard · BestXI · Players · PlayerDetail · Gurus · History
    components/  Card, PlayerCard, Pitch, Empty
    lib/         api client, utils
    types/       shared API types
```

## What's not included

- Live X scraping — kept pluggable since it's brittle / paywalled.
- Auth — admin endpoints are unguarded; add a token before deploying.
- Production DB — SQLite is fine for local use; swap `DATABASE_URL` for
  Postgres in `core/config.py`.

---

## Deploying to Cloudflare (Pages + Workers + D1)

Because LightGBM / PuLP / scipy don't run on Workers, the Cloudflare deploy
follows the **compute-offline / serve-from-edge** pattern:

```
GitHub Actions (weekly) → train LightGBM → export to edge/data.sql
                                           → wrangler d1 execute
                                                         │
                                                         ▼
                                         Cloudflare D1 ─► Worker (/api/*)
                                                              │
                                                     Cloudflare Pages (React)
```

The intelligence (LightGBM, ILP) still runs — just offline in CI. The edge
only reads D1 and ships JSON.

### One-time setup

```bash
# 1. Log in to Cloudflare with wrangler
npm install -g wrangler@3
wrangler login

# 2. Create the D1 database
wrangler d1 create fpl-oracle
# → copy the printed `database_id` into edge/wrangler.toml

# 3. Create the schema on D1
wrangler d1 execute fpl-oracle --remote --file=edge/schema.sql

# 4. Create the Pages project (once)
cd frontend && npm run build
npx wrangler pages project create fpl-oracle --production-branch=main
```

### Populate D1 with a first batch

Run the full Python pipeline locally, then export to D1:

```bash
cd backend && source .venv/bin/activate
PYTHONPATH=. python -m app.ingest.seed_offline        # or ingest_historical + ingest_live
PYTHONPATH=. python -m app.ml.train
PYTHONPATH=. python -c "
from app.db.session import SessionLocal
from app.services.recommendations import generate_recommendations
with SessionLocal() as db:
    print(generate_recommendations(db, gw=35, season='live'))
"
PYTHONPATH=. python -m app.export.to_d1   # writes edge/data.sql

cd ../edge
wrangler d1 execute fpl-oracle --remote --file=data.sql
```

### Deploy the Worker (API)

```bash
cd edge/worker
npm install
npx wrangler deploy --config ../wrangler.toml
# → https://fpl-oracle-api.<your-subdomain>.workers.dev
```

### Deploy Pages (UI)

```bash
cd frontend
VITE_API_BASE=https://fpl-oracle-api.<your-subdomain>.workers.dev/api npm run build
npx wrangler pages deploy dist --project-name=fpl-oracle --branch=main
# → https://fpl-oracle.pages.dev
```

For a cleaner same-origin setup, put both behind a custom domain:

- `yourdomain.com` → Pages (catch-all)
- `yourdomain.com/api/*` → Worker route (configure in `edge/wrangler.toml`)
- Leave `VITE_API_BASE` unset — the frontend will use same-origin `/api`.

### Automate with GitHub Actions

`.github/workflows/weekly.yml` retrains + redeploys every Thursday 09:00 UTC
(or on manual dispatch). Add these repository secrets:

- `CLOUDFLARE_API_TOKEN` — token with *D1:Edit*, *Workers:Edit*, *Pages:Edit*
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_API_BASE` — the Worker URL, e.g. `https://fpl-oracle-api.<subdomain>.workers.dev/api`

### What lives where

| Concern | Where |
|---|---|
| LightGBM training, ILP optimisation | GitHub Actions (Python) |
| Recommendations, actuals, accuracy, guru mentions | Cloudflare D1 |
| REST API (`/api/*`) | Cloudflare Worker (`edge/worker/`) |
| React SPA | Cloudflare Pages |
| Weekly refresh | GH Actions cron, manual dispatch too |

### Tradeoffs

- No live retraining from the browser — model updates only when the GH Action
  runs (weekly, or manually). Fine for FPL: one deadline a week.
- `POST /admin/*` endpoints stay in the Python CLI; the edge is read-only.
- D1 size is well within limits (~250 KB for a full season of data).
