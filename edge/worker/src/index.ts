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
};

type RecRow = {
  gw: number; season: string; player_id: number; position: string;
  predicted_points: number; p10: number; p90: number;
  rank_in_position: number; is_top_pick: number; is_captain: number;
  in_best_xi: number; social_score: number;
  web_name: string; team_short: string | null; price: number;
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
  "SELECT r.*, p.web_name, p.team_short, p.price" +
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

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
