-- D1 schema for the FPL Oracle edge service.
-- This is a read-only denormalised view of what the Python pipeline produces.
-- The GitHub Action exports to data.sql, then:
--   wrangler d1 execute fpl --file=edge/schema.sql
--   wrangler d1 execute fpl --file=edge/data.sql

DROP TABLE IF EXISTS teams;
CREATE TABLE teams (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL
);

DROP TABLE IF EXISTS players;
CREATE TABLE players (
  id INTEGER PRIMARY KEY,
  web_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  second_name TEXT NOT NULL,
  position TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  team_short TEXT,
  team_name TEXT,
  price REAL NOT NULL,
  form REAL NOT NULL,
  total_points INTEGER NOT NULL,
  selected_by_percent REAL NOT NULL,
  news TEXT
);
CREATE INDEX idx_players_position ON players(position);
CREATE INDEX idx_players_team ON players(team_id);

DROP TABLE IF EXISTS gameweeks;
CREATE TABLE gameweeks (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  deadline_time TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  is_next INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0,
  average_entry_score INTEGER NOT NULL DEFAULT 0,
  highest_score INTEGER NOT NULL DEFAULT 0
);

DROP TABLE IF EXISTS player_gw_stats;
CREATE TABLE player_gw_stats (
  player_id INTEGER NOT NULL,
  season TEXT NOT NULL,
  gw INTEGER NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  goals_scored INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  bonus INTEGER NOT NULL DEFAULT 0,
  bps INTEGER NOT NULL DEFAULT 0,
  expected_goals REAL NOT NULL DEFAULT 0,
  expected_assists REAL NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, season, gw)
);

DROP TABLE IF EXISTS recommendations;
CREATE TABLE recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gw INTEGER NOT NULL,
  season TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  position TEXT NOT NULL,
  predicted_points REAL NOT NULL,
  p10 REAL NOT NULL,
  p90 REAL NOT NULL,
  rank_in_position INTEGER NOT NULL,
  is_top_pick INTEGER NOT NULL DEFAULT 0,
  is_captain INTEGER NOT NULL DEFAULT 0,
  in_best_xi INTEGER NOT NULL DEFAULT 0,
  social_score REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_recs_gw ON recommendations(gw);
CREATE INDEX idx_recs_gw_position ON recommendations(gw, position);
CREATE INDEX idx_recs_player ON recommendations(player_id);

DROP TABLE IF EXISTS actual_results;
CREATE TABLE actual_results (
  player_id INTEGER NOT NULL,
  season TEXT NOT NULL,
  gw INTEGER NOT NULL,
  actual_points INTEGER NOT NULL DEFAULT 0,
  goals_scored INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  clean_sheet INTEGER NOT NULL DEFAULT 0,
  minutes INTEGER NOT NULL DEFAULT 0,
  bonus INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, season, gw)
);

DROP TABLE IF EXISTS accuracy_log;
CREATE TABLE accuracy_log (
  gw INTEGER NOT NULL,
  season TEXT NOT NULL,
  mae REAL,
  rmse REAL,
  rank_corr REAL,
  n INTEGER,
  captain_actual INTEGER,
  xi_realised INTEGER,
  top_picks_hit INTEGER,
  top_picks_total INTEGER,
  PRIMARY KEY (gw, season)
);

DROP TABLE IF EXISTS guru_sources;
CREATE TABLE guru_sources (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0
);

DROP TABLE IF EXISTS guru_mentions;
CREATE TABLE guru_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  source_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  web_name TEXT NOT NULL,
  position TEXT NOT NULL,
  gw INTEGER NOT NULL,
  sentiment REAL NOT NULL DEFAULT 0,
  is_captain_pick INTEGER NOT NULL DEFAULT 0,
  is_avoid INTEGER NOT NULL DEFAULT 0,
  is_differential INTEGER NOT NULL DEFAULT 0,
  snippet TEXT,
  captured_at TEXT
);
CREATE INDEX idx_mentions_gw ON guru_mentions(gw);
CREATE INDEX idx_mentions_player ON guru_mentions(player_id);
