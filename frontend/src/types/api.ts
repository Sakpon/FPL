export type Position = "GK" | "DEF" | "MID" | "FWD";

export interface Player {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  position: Position;
  team_id: number;
  team_short?: string | null;
  team_name?: string | null;
  price: number;
  form: number;
  total_points: number;
  selected_by_percent: number;
  news?: string | null;
}

export interface Recommendation {
  player_id: number;
  web_name: string;
  position: Position;
  team_short: string | null;
  price: number;
  predicted_points: number;
  p10: number;
  p90: number;
  rank_in_position: number;
  is_top_pick: boolean;
  is_captain: boolean;
  in_best_xi: boolean;
  social_score: number;
}

export interface Gameweek {
  id: number;
  name: string;
  deadline_time: string | null;
  is_current: boolean;
  is_next: boolean;
  finished: boolean;
  average_entry_score: number;
  highest_score: number;
}

export interface TopPicks {
  gw: number;
  picks: Record<Position, Recommendation>;
}

export interface BestXi {
  gw: number;
  captain: Recommendation | null;
  starters: Recommendation[];
  bench: Recommendation[];
  expected_points: number;
  squad_cost: number;
}

export interface Accuracy {
  gw: number;
  mae?: number;
  rmse?: number;
  rank_corr?: number;
  n?: number;
  captain_actual?: number | null;
  xi_realised?: number | null;
  top_picks_hit?: number | null;
  top_picks_total?: number | null;
  status?: string | null;
}

export interface GuruMention {
  source_name: string;
  platform: "youtube" | "x";
  player_id: number;
  web_name: string;
  position: Position;
  sentiment: number;
  is_captain_pick: boolean;
  is_avoid: boolean;
  is_differential: boolean;
  snippet: string;
  captured_at: string;
}

export interface GuruSummaryRow {
  player_id: number;
  web_name: string;
  position: Position;
  team_short: string | null;
  mentions: number;
  sentiment_sum: number;
}

export interface PlayerHistoryRow {
  season: string;
  gw: number;
  points: number;
  minutes: number;
  goals: number;
  assists: number;
  bonus: number;
  bps: number;
  xg: number;
  xa: number;
}

export interface MyTeamSquadEntry {
  player_id: number;
  element: number;
  web_name: string;
  position: Position | "—";
  team_short: string | null;
  price: number | null;
  predicted_points: number | null;
  p10: number | null;
  p90: number | null;
  rank_in_position: number | null;
  social_score: number | null;
  fpl_multiplier: number;
  fpl_is_captain: boolean;
  fpl_is_vice_captain: boolean;
}

export interface MyTeamSwap {
  out: MyTeamSquadEntry;
  candidates: Recommendation[];
}

export interface MyTeam {
  team_id: number;
  team_name: string | null;
  player_name: string | null;
  total_points: number | null;
  overall_rank: number | null;
  bank: number | null;
  team_value: number | null;
  picks_gw: number;
  target_gw: number;
  squad: MyTeamSquadEntry[];
  starting_xi: MyTeamSquadEntry[];
  bench: MyTeamSquadEntry[];
  captain_suggestion: MyTeamSquadEntry | null;
  expected_points: number;
  swap_suggestions: MyTeamSwap[];
  notes: string | null;
}
