/**
 * FPL Oracle — Cloudflare Worker
 *
 * Mirrors the REST surface of the Python FastAPI backend by reading from a
 * Cloudflare D1 database populated by the GitHub Action
 * (`.github/workflows/weekly.yml`), which runs LightGBM training + the ILP
 * optimizer offline and pushes the denormalised output to D1.
 *
 * Route table (matches the React frontend):
 *   GET /api/health
 *   GET /api/gameweeks
 *   GET /api/gameweeks/current
 *   GET /api/players?position=&search=&limit=
 *   GET /api/players/:id
 *   GET /api/players/:id/history
 *   GET /api/recommendations/:gw?position=&limit=
 *   GET /api/recommendations/top-picks/:gw
 *   GET /api/recommendations/best-xi/:gw
 *   GET /api/accuracy/:gw
 *   GET /api/accuracy/history
 *   GET /api/gurus/mentions/:gw?limit=
 *   GET /api/gurus/summary/:gw
 *   GET /api/team/:fplTeamId        (fetches from FPL public API, joins with D1)
 *   GET /api/team/:fplTeamId/live   (live points for current GW, edge-cached 30s)
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

type Env = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*" }));

// ---------- helpers ----------

function boolish(v: unknown): boolean {
  return v === 1 || v === true || v === "1";
}

type PlayerRow = {
  id: number; web_name: string; first_name: string; second_name: string;
  position: string; team_id: number; team_short: string | null;
  team_name: string | null; price: number; form: number;
  total_points: number; selected_by_percent: number; news: string | null;
  status: string | null; chance_of_playing: number | null;
  next_opp_short: string | null; next_was_home: number | null;
  next_difficulty: number | null;
};

type RecRow = {
  gw: number; season: string; player_id: number; position: string;
  predicted_points: number; p10: number; p90: number;
  rank_in_position: number; is_top_pick: number; is_captain: number;
  in_best_xi: number; social_score: number;
  web_name: string; team_short: string | null; price: number;
  news: string | null; status: string | null;
  chance_of_playing: number | null;
  next_opp_short: string | null; next_was_home: number | null;
  next_difficulty: number | null;
};

function shapeRec(row: RecRow) {
  return {
    player_id: row.player_id,
    web_name: row.web_name,
    position: row.position,
    team_short: row.team_short,
    price: row.price,
    predicted_points: Number(row.predicted_points.toFixed(2)),
    p10: Number(row.p10.toFixed(2)),
    p90: Number(row.p90.toFixed(2)),
    rank_in_position: row.rank_in_position,
    is_top_pick: boolish(row.is_top_pick),
    is_captain: boolish(row.is_captain),
    in_best_xi: boolish(row.in_best_xi),
    social_score: Number(row.social_score.toFixed(2)),
    status: row.status ?? "a",
    chance_of_playing: row.chance_of_playing,
    news: row.news ?? "",
    next_opp_short: row.next_opp_short,
    next_was_home:
      row.next_was_home == null ? null : boolish(row.next_was_home),
    next_difficulty: row.next_difficulty,
  };
}

function shapePlayer(p: PlayerRow) {
  return {
    id: p.id,
    web_name: p.web_name,
    first_name: p.first_name,
    second_name: p.second_name,
    position: p.position,
    team_id: p.team_id,
    team_short: p.team_short,
    team_name: p.team_name,
    price: p.price,
    form: p.form,
    total_points: p.total_points,
    selected_by_percent: p.selected_by_percent,
    news: p.news,
    status: p.status ?? "a",
    chance_of_playing: p.chance_of_playing,
    next_opp_short: p.next_opp_short,
    next_was_home:
      p.next_was_home == null ? null : boolish(p.next_was_home),
    next_difficulty: p.next_difficulty,
  };
}

// ---------- routes ----------

app.get("/api/health", (c) =>
  c.json({ status: "ok", time: new Date().toISOString(), edge: "cloudflare" })
);

app.get("/api/gameweeks", async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT * FROM gameweeks ORDER BY id")
    .all();
  return c.json(
    (results ?? []).map((r: any) => ({
      id: r.id, name: r.name, deadline_time: r.deadline_time,
      is_current: boolish(r.is_current), is_next: boolish(r.is_next),
      finished: boolish(r.finished),
      average_entry_score: r.average_entry_score,
      highest_score: r.highest_score,
    }))
  );
});

app.get("/api/gameweeks/current", async (c) => {
  const next = await c.env.DB
    .prepare("SELECT * FROM gameweeks WHERE is_next = 1 LIMIT 1")
    .first<any>();
  const row =
    next ??
    (await c.env.DB
      .prepare("SELECT * FROM gameweeks WHERE is_current = 1 LIMIT 1")
      .first<any>()) ??
    (await c.env.DB
      .prepare("SELECT * FROM gameweeks ORDER BY id DESC LIMIT 1")
      .first<any>());
  if (!row) return c.json({ error: "No gameweeks loaded" }, 404);
  return c.json({
    id: row.id, name: row.name, deadline_time: row.deadline_time,
    is_current: boolish(row.is_current), is_next: boolish(row.is_next),
    finished: boolish(row.finished),
    average_entry_score: row.average_entry_score,
    highest_score: row.highest_score,
  });
});

app.get("/api/players", async (c) => {
  const position = c.req.query("position");
  const search = c.req.query("search");
  const limit = Math.min(Number(c.req.query("limit") ?? 500), 1000);

  const where: string[] = [];
  const args: unknown[] = [];
  if (position) { where.push("position = ?"); args.push(position); }
  if (search) {
    where.push("(web_name LIKE ?1 OR first_name LIKE ?1 OR second_name LIKE ?1)");
    args.push(`%${search}%`);
  }
  const sql =
    `SELECT * FROM players${where.length ? " WHERE " + where.join(" AND ") : ""}` +
    " ORDER BY total_points DESC LIMIT ?";
  const { results } = await c.env.DB.prepare(sql).bind(...args, limit).all();
  return c.json((results ?? []).map((r) => shapePlayer(r as PlayerRow)));
});

app.get("/api/players/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB
    .prepare("SELECT * FROM players WHERE id = ?")
    .bind(id)
    .first<PlayerRow>();
  if (!row) return c.json({ error: "Player not found" }, 404);
  return c.json(shapePlayer(row));
});

app.get("/api/players/:id/history", async (c) => {
  const id = Number(c.req.param("id"));
  const { results } = await c.env.DB
    .prepare(
      "SELECT season, gw, total_points AS points, minutes, goals_scored AS goals," +
      " assists, bonus, bps, expected_goals AS xg, expected_assists AS xa" +
      " FROM player_gw_stats WHERE player_id = ? ORDER BY season, gw LIMIT 250"
    )
    .bind(id)
    .all();
  return c.json(results ?? []);
});

const RECS_SELECT =
  "SELECT r.*, p.web_name, p.team_short, p.price," +
  "       p.news, p.status, p.chance_of_playing," +
  "       p.next_opp_short, p.next_was_home, p.next_difficulty" +
  " FROM recommendations r JOIN players p ON r.player_id = p.id";

app.get("/api/recommendations/top-picks/:gw", async (c) => {
  const gw = Number(c.req.param("gw"));
  const { results } = await c.env.DB
    .prepare(`${RECS_SELECT} WHERE r.gw = ? AND r.is_top_pick = 1`)
    .bind(gw)
    .all();
  const rows = (results as any[]) ?? [];
  if (!rows.length) return c.json({ error: "No recommendations for gw" }, 404);
  const picks: Record<string, ReturnType<typeof shapeRec>> = {};
  for (const r of rows) picks[r.position] = shapeRec(r as RecRow);
  return c.json({ gw, picks });
});

app.get("/api/recommendations/best-xi/:gw", async (c) => {
  const gw = Number(c.req.param("gw"));
  const { results } = await c.env.DB
    .prepare(
      `${RECS_SELECT} WHERE r.gw = ? AND (r.in_best_xi = 1 OR r.is_captain = 1)`
    )
    .bind(gw)
    .all();
  const all = (results as any[]) ?? [];
  if (!all.length) return c.json({ error: "No best XI for gw" }, 404);
  const starters = all.filter((r) => boolish(r.in_best_xi)).map((r) => shapeRec(r as RecRow));
  const captainRow = all.find((r) => boolish(r.is_captain));
  const captain = captainRow ? shapeRec(captainRow as RecRow) : null;

  // Bench: next 4 non-XI predictions ordered by predicted_points desc
  const starterIds = new Set(starters.map((s) => s.player_id));
  const { results: benchRes } = await c.env.DB
    .prepare(
      `${RECS_SELECT} WHERE r.gw = ? AND r.in_best_xi = 0` +
      " ORDER BY r.predicted_points DESC LIMIT 40"
    )
    .bind(gw)
    .all();
  const bench = ((benchRes as any[]) ?? [])
    .filter((r) => !starterIds.has(r.player_id))
    .slice(0, 4)
    .map((r) => shapeRec(r as RecRow));

  const xp =
    starters.reduce((s, p) => s + p.predicted_points, 0) +
    (captain ? captain.predicted_points : 0);
  const cost =
    starters.reduce((s, p) => s + p.price, 0) +
    bench.reduce((s, p) => s + p.price, 0);

  return c.json({
    gw, captain, starters, bench,
    expected_points: Number(xp.toFixed(2)),
    squad_cost: Number(cost.toFixed(1)),
  });
});

app.get("/api/recommendations/:gw", async (c) => {
  const gw = Number(c.req.param("gw"));
  const position = c.req.query("position");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const args: unknown[] = [gw];
  let sql = `${RECS_SELECT} WHERE r.gw = ?`;
  if (position) { sql += " AND r.position = ?"; args.push(position); }
  sql += " ORDER BY r.predicted_points DESC LIMIT ?";
  args.push(limit);
  const { results } = await c.env.DB.prepare(sql).bind(...args).all();
  return c.json(((results as any[]) ?? []).map((r) => shapeRec(r as RecRow)));
});

app.get("/api/accuracy/history", async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT * FROM accuracy_log WHERE season = 'live' ORDER BY gw")
    .all();
  return c.json(results ?? []);
});

app.get("/api/accuracy/:gw", async (c) => {
  const gw = Number(c.req.param("gw"));
  const row = await c.env.DB
    .prepare("SELECT * FROM accuracy_log WHERE gw = ? AND season = 'live'")
    .bind(gw)
    .first<any>();
  if (!row) return c.json({ gw, status: "no_data" });
  return c.json(row);
});

app.get("/api/gurus/mentions/:gw", async (c) => {
  const gw = Number(c.req.param("gw"));
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const { results } = await c.env.DB
    .prepare(
      "SELECT * FROM guru_mentions WHERE gw = ? ORDER BY captured_at DESC LIMIT ?"
    )
    .bind(gw, limit)
    .all();
  return c.json(
    ((results as any[]) ?? []).map((m) => ({
      source_name: m.source_name,
      platform: m.platform,
      player_id: m.player_id,
      web_name: m.web_name,
      position: m.position,
      sentiment: m.sentiment,
      is_captain_pick: boolish(m.is_captain_pick),
      is_avoid: boolish(m.is_avoid),
      is_differential: boolish(m.is_differential),
      snippet: m.snippet,
      captured_at: m.captured_at,
    }))
  );
});

app.get("/api/gurus/summary/:gw", async (c) => {
  const gw = Number(c.req.param("gw"));
  const { results } = await c.env.DB
    .prepare(
      "SELECT m.player_id, m.web_name, m.position, p.team_short," +
      "       COUNT(*) AS mentions, SUM(m.sentiment) AS sentiment_sum" +
      " FROM guru_mentions m LEFT JOIN players p ON p.id = m.player_id" +
      " WHERE m.gw = ?" +
      " GROUP BY m.player_id ORDER BY COUNT(*) DESC LIMIT 20"
    )
    .bind(gw)
    .all();
  return c.json(
    ((results as any[]) ?? []).map((r) => ({
      player_id: r.player_id,
      web_name: r.web_name,
      position: r.position,
      team_short: r.team_short,
      mentions: r.mentions,
      sentiment_sum: Number((r.sentiment_sum ?? 0).toFixed(2)),
    }))
  );
});

// ---------- My Team: fetch user squad from FPL API + analyse ----------

const LIVE_PID_OFFSET = 9999 * 10000; // mirrors backend/app/ingest/ingest_live._pid
const FPL_API = "https://fantasy.premierleague.com/api";
const FPL_UA = { "User-Agent": "fpl-oracle-edge/1.0 (+https://fpl-oracle.pages.dev)" };
const XI_MIN: Record<string, number> = { GK: 1, DEF: 3, MID: 2, FWD: 1 };
const XI_MAX: Record<string, number> = { GK: 1, DEF: 5, MID: 5, FWD: 3 };

type SquadEntry = {
  player_id: number;
  element: number;
  web_name: string;
  position: string;
  team_short: string | null;
  price: number | null;
  predicted_points: number | null;
  p10: number | null;
  p90: number | null;
  rank_in_position: number | null;
  social_score: number | null;
  status: string;
  chance_of_playing: number | null;
  news: string;
  next_opp_short: string | null;
  next_was_home: boolean | null;
  next_difficulty: number | null;
  fpl_multiplier: number;
  fpl_is_captain: boolean;
  fpl_is_vice_captain: boolean;
};

app.get("/api/team/:fplTeamId", async (c) => {
  const teamId = Number(c.req.param("fplTeamId"));
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return c.json({ error: "Invalid team id" }, 400);
  }

  // Target GW = the upcoming GW we generate recommendations for.
  // Single round-trip; partition is_next vs is_current in JS.
  const { results: gwRows } = await c.env.DB
    .prepare(
      "SELECT id, is_next, is_current FROM gameweeks WHERE is_next = 1 OR is_current = 1"
    )
    .all<{ id: number; is_next: number; is_current: number }>();
  const nextRow = (gwRows ?? []).find((r) => boolish(r.is_next)) ?? null;
  const currentRow = (gwRows ?? []).find((r) => boolish(r.is_current)) ?? null;
  const targetGw: number | undefined = nextRow?.id ?? currentRow?.id;
  if (!targetGw) return c.json({ error: "No upcoming gameweek loaded" }, 500);

  // Pull the entry (team name, rank, bank) + picks in parallel. Both are
  // edge-cached so concurrent viewers and repeat visits within TTL collapse
  // to a single upstream call per colo.
  let entry: any;
  let picks: any = null;
  let picksGw = targetGw;
  try {
    const [entryResult, picksResult] = await Promise.allSettled([
      fetchEdgeCached(`${FPL_API}/entry/${teamId}/`, 120),
      fetchEdgeCached(`${FPL_API}/entry/${teamId}/event/${targetGw}/picks/`, 60),
    ]);
    if (entryResult.status === "rejected") {
      const msg = String(entryResult.reason);
      if (msg.includes("404")) return c.json({ error: "Team not found" }, 404);
      return c.json({ error: "Could not reach FPL API", detail: msg }, 502);
    }
    entry = entryResult.value;
    if (picksResult.status === "fulfilled") {
      picks = picksResult.value;
    }
  } catch (e: any) {
    return c.json({ error: "Could not reach FPL API", detail: String(e) }, 502);
  }

  // Picks may not exist yet for the upcoming GW — fall back to the current
  // (finished) GW so we still have a squad to analyse.
  if (!picks && currentRow && currentRow.id !== targetGw) {
    try {
      picks = await fetchEdgeCached(
        `${FPL_API}/entry/${teamId}/event/${currentRow.id}/picks/`,
        60
      );
      picksGw = currentRow.id;
    } catch {
      /* fall through to 404 below */
    }
  }
  if (!picks || !Array.isArray(picks.picks)) {
    return c.json({ error: "No saved picks for this team yet" }, 404);
  }

  const fplPicks: Array<{
    element: number; multiplier: number; is_captain: boolean; is_vice_captain: boolean;
  }> = picks.picks;
  const playerIds = fplPicks.map((p) => LIVE_PID_OFFSET + p.element);
  const placeholders = playerIds.map(() => "?").join(",");

  // Join with recommendations for the TARGET GW (their picks may be from a
  // previous GW but we want to analyse the upcoming one).
  const { results: recRes } = await c.env.DB
    .prepare(
      `${RECS_SELECT} WHERE r.gw = ? AND r.player_id IN (${placeholders})`
    )
    .bind(targetGw, ...playerIds)
    .all();
  const recById = new Map<number, ReturnType<typeof shapeRec>>();
  for (const r of (recRes as any[]) ?? []) recById.set(r.player_id, shapeRec(r as RecRow));

  // Fallback metadata for players not in recommendations (e.g. filtered out).
  const { results: pRes } = await c.env.DB
    .prepare(`SELECT * FROM players WHERE id IN (${placeholders})`)
    .bind(...playerIds)
    .all();
  const playerById = new Map<number, ReturnType<typeof shapePlayer>>();
  for (const p of (pRes as any[]) ?? []) playerById.set(p.id, shapePlayer(p as PlayerRow));

  const squad: SquadEntry[] = fplPicks.map((fp) => {
    const pid = LIVE_PID_OFFSET + fp.element;
    const rec = recById.get(pid);
    const player = playerById.get(pid);
    return {
      player_id: pid,
      element: fp.element,
      web_name: rec?.web_name ?? player?.web_name ?? `#${fp.element}`,
      position: rec?.position ?? player?.position ?? "—",
      team_short: rec?.team_short ?? player?.team_short ?? null,
      price: rec?.price ?? player?.price ?? null,
      predicted_points: rec?.predicted_points ?? null,
      p10: rec?.p10 ?? null,
      p90: rec?.p90 ?? null,
      rank_in_position: rec?.rank_in_position ?? null,
      social_score: rec?.social_score ?? null,
      status: rec?.status ?? player?.status ?? "a",
      chance_of_playing:
        rec?.chance_of_playing ?? player?.chance_of_playing ?? null,
      news: (rec?.news ?? player?.news ?? "") as string,
      next_opp_short: rec?.next_opp_short ?? player?.next_opp_short ?? null,
      next_was_home: rec?.next_was_home ?? player?.next_was_home ?? null,
      next_difficulty: rec?.next_difficulty ?? player?.next_difficulty ?? null,
      fpl_multiplier: fp.multiplier,
      fpl_is_captain: fp.is_captain,
      fpl_is_vice_captain: fp.is_vice_captain,
    };
  });

  // ---- Formation-legal starting XI from the 15 ----
  const key = (s: SquadEntry) => (s.predicted_points ?? -Infinity);
  const sortedDesc = [...squad].sort((a, b) => key(b) - key(a));

  const starting: SquadEntry[] = [];
  const count: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

  // Fill minimums per position first, then the best remaining respecting maxes.
  for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
    for (const s of sortedDesc) {
      if (starting.length >= 11) break;
      if (count[pos] >= XI_MIN[pos]) break;
      if (s.position !== pos) continue;
      if (starting.includes(s)) continue;
      starting.push(s);
      count[pos]++;
    }
  }
  for (const s of sortedDesc) {
    if (starting.length >= 11) break;
    if (starting.includes(s)) continue;
    const pos = s.position;
    if (count[pos] == null) continue; // unknown position — skip
    if (count[pos] >= XI_MAX[pos]) continue;
    starting.push(s);
    count[pos]++;
  }
  const startingSet = new Set(starting.map((s) => s.player_id));
  const bench = squad.filter((s) => !startingSet.has(s.player_id));

  // Captain = highest predicted in starting XI
  const captainSuggestion =
    starting.length > 0
      ? [...starting].sort((a, b) => key(b) - key(a))[0]
      : null;

  const startingXp = starting.reduce((s, p) => s + (p.predicted_points ?? 0), 0);
  const captainXp = captainSuggestion?.predicted_points ?? 0;
  const expectedPoints = Number((startingXp + captainXp).toFixed(2));

  // ---- Swap candidates for the 3 weakest in starting XI ----
  const weakest = [...starting]
    .filter((s) => s.predicted_points != null)
    .sort((a, b) => key(a) - key(b))
    .slice(0, 3);
  const squadIdList = squad.map((s) => s.player_id);
  const squadIdPlaceholders = squadIdList.map(() => "?").join(",");

  const swap_suggestions: Array<{ out: SquadEntry; candidates: ReturnType<typeof shapeRec>[] }> = [];
  if (weakest.length > 0) {
    // Single D1 query for all three weakest positions; partition + cap to 5
    // per position in JS. Replaces the previous 3-round-trip loop.
    const positions = Array.from(new Set(weakest.map((w) => w.position)));
    const posPlaceholders = positions.map(() => "?").join(",");
    const { results } = await c.env.DB
      .prepare(
        `${RECS_SELECT} WHERE r.gw = ? AND r.position IN (${posPlaceholders})` +
        ` AND r.player_id NOT IN (${squadIdPlaceholders})` +
        ` ORDER BY r.position, r.predicted_points DESC`
      )
      .bind(targetGw, ...positions, ...squadIdList)
      .all();

    const byPos = new Map<string, RecRow[]>();
    for (const r of (results as RecRow[]) ?? []) {
      const arr = byPos.get(r.position) ?? [];
      if (arr.length < 5) {
        arr.push(r);
        byPos.set(r.position, arr);
      }
    }
    for (const w of weakest) {
      swap_suggestions.push({
        out: w,
        candidates: (byPos.get(w.position) ?? []).map((r) => shapeRec(r)),
      });
    }
  }

  return c.json({
    team_id: teamId,
    team_name: entry.name ?? null,
    player_name:
      `${entry.player_first_name ?? ""} ${entry.player_last_name ?? ""}`.trim() || null,
    total_points: entry.summary_overall_points ?? null,
    overall_rank: entry.summary_overall_rank ?? null,
    bank: entry.last_deadline_bank != null ? entry.last_deadline_bank / 10 : null,
    team_value:
      entry.last_deadline_value != null ? entry.last_deadline_value / 10 : null,
    picks_gw: picksGw,
    target_gw: targetGw,
    squad,
    starting_xi: starting,
    bench,
    captain_suggestion: captainSuggestion,
    expected_points: expectedPoints,
    swap_suggestions,
    notes:
      picksGw !== targetGw
        ? `Showing your GW${picksGw} squad — you have not saved a team for GW${targetGw} yet.`
        : null,
  });
});

// ---------- Live tracking: per-player live stats during a GW ----------

async function fetchEdgeCached(url: string, ttlSeconds: number): Promise<any> {
  // Cloudflare's per-colo cache. Keyed by URL — same data shared across all
  // viewers, so 100s of requests collapse into 1 upstream hit per `ttl`.
  const cache = (caches as unknown as { default: Cache }).default;
  const req = new Request(url, { headers: FPL_UA });
  const hit = await cache.match(req);
  if (hit) return hit.json();
  const fresh = await fetch(req);
  if (!fresh.ok) throw new Error(`upstream ${fresh.status} for ${url}`);
  // Clone before reading json so we can also store the body.
  const body = await fresh.clone().text();
  const cached = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${ttlSeconds}`,
    },
  });
  await cache.put(req, cached);
  return JSON.parse(body);
}

app.get("/api/team/:fplTeamId/live", async (c) => {
  const teamId = Number(c.req.param("fplTeamId"));
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return c.json({ error: "Invalid team id" }, 400);
  }

  // Resolve the current GW from FPL's bootstrap (60s edge cache).
  let bootstrap: any;
  try {
    bootstrap = await fetchEdgeCached(`${FPL_API}/bootstrap-static/`, 60);
  } catch (e: any) {
    return c.json({ error: "FPL API unreachable", detail: String(e) }, 502);
  }
  const events: any[] = bootstrap.events ?? [];
  const currentEvent = events.find((e) => e.is_current);
  if (!currentEvent) {
    return c.json({ error: "No current gameweek — no live data" }, 404);
  }
  const gw: number = currentEvent.id;

  // All three FPL calls are edge-cached; the same cache key is shared with
  // /api/team/:id so a poll of /live within TTL of the analyse call hits the
  // cache. TTLs: bootstrap 60s, live stats 30s, entry 120s, picks 60s.
  let entry: any, picks: any, liveStats: any;
  try {
    const [entryResult, picksResult, liveResult] = await Promise.allSettled([
      fetchEdgeCached(`${FPL_API}/entry/${teamId}/`, 120),
      fetchEdgeCached(`${FPL_API}/entry/${teamId}/event/${gw}/picks/`, 60),
      fetchEdgeCached(`${FPL_API}/event/${gw}/live/`, 30),
    ]);
    if (entryResult.status === "rejected") {
      const msg = String(entryResult.reason);
      if (msg.includes("404")) return c.json({ error: "Team not found" }, 404);
      return c.json({ error: "FPL API error", detail: msg }, 502);
    }
    entry = entryResult.value;
    if (picksResult.status === "rejected") {
      return c.json({ error: "No picks for current GW yet", gw }, 404);
    }
    picks = picksResult.value;
    if (liveResult.status === "rejected") {
      return c.json(
        { error: "FPL API error", detail: String(liveResult.reason) },
        502
      );
    }
    liveStats = liveResult.value;
  } catch (e: any) {
    return c.json({ error: "FPL API error", detail: String(e) }, 502);
  }

  const elementStats = new Map<number, any>();
  for (const e of liveStats.elements ?? []) {
    elementStats.set(e.id, e.stats ?? {});
  }

  const fplPicks: Array<{
    element: number; position: number; multiplier: number;
    is_captain: boolean; is_vice_captain: boolean;
  }> = picks.picks ?? [];

  // D1 lookup for player metadata (name, team, position).
  const playerIds = fplPicks.map((p) => LIVE_PID_OFFSET + p.element);
  const placeholders = playerIds.map(() => "?").join(",");
  const { results: pRes } = playerIds.length
    ? await c.env.DB
        .prepare(`SELECT * FROM players WHERE id IN (${placeholders})`)
        .bind(...playerIds)
        .all()
    : { results: [] };
  const playerById = new Map<number, ReturnType<typeof shapePlayer>>();
  for (const p of (pRes as any[]) ?? []) {
    playerById.set(p.id, shapePlayer(p as PlayerRow));
  }

  const squad = fplPicks.map((fp) => {
    const pid = LIVE_PID_OFFSET + fp.element;
    const stats = elementStats.get(fp.element) ?? {};
    const player = playerById.get(pid);
    const rawPoints = Number(stats.total_points ?? 0);
    const multiplier = fp.multiplier ?? 1;
    const isStarter = fp.position <= 11;
    return {
      player_id: pid,
      element: fp.element,
      web_name: player?.web_name ?? `#${fp.element}`,
      position: player?.position ?? "—",
      team_short: player?.team_short ?? null,
      pick_position: fp.position,
      multiplier,
      is_captain: fp.is_captain,
      is_vice_captain: fp.is_vice_captain,
      is_starter: isStarter,
      raw_points: rawPoints,
      points: isStarter ? rawPoints * multiplier : 0,
      minutes: Number(stats.minutes ?? 0),
      goals_scored: Number(stats.goals_scored ?? 0),
      assists: Number(stats.assists ?? 0),
      clean_sheets: Number(stats.clean_sheets ?? 0),
      bonus: Number(stats.bonus ?? 0),
      bps: Number(stats.bps ?? 0),
    };
  });

  const livePoints = squad.reduce((s, p) => s + p.points, 0);
  const startersPlayed = squad.filter((p) => p.is_starter && p.minutes > 0).length;
  const startersTotal = squad.filter((p) => p.is_starter).length;

  return c.json({
    team_id: teamId,
    team_name: entry.name ?? null,
    gw,
    finished: !!currentEvent.finished,
    data_checked: !!currentEvent.data_checked,
    live_points: livePoints,
    starters_played: startersPlayed,
    starters_total: startersTotal,
    squad,
  });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
