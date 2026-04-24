import type {
  Accuracy,
  BestXi,
  Gameweek,
  GuruMention,
  GuruSummaryRow,
  MyTeam,
  Player,
  PlayerHistoryRow,
  Recommendation,
  TopPicks,
} from "@/types/api";

// Where to call the backend from. Defaults to same-origin "/api" which works
// for local dev (Vite proxy) and Pages + same-zone Worker routes.
// Set VITE_API_BASE at build time to point at a different origin, e.g.
//   VITE_API_BASE=https://fpl-oracle-api.example.workers.dev/api
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

async function jget<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

async function jpost<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: "POST" });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export const api = {
  currentGw: () => jget<Gameweek>("/gameweeks/current"),
  gameweeks: () => jget<Gameweek[]>("/gameweeks"),
  topPicks: (gw: number) => jget<TopPicks>(`/recommendations/top-picks/${gw}`),
  bestXi: (gw: number) => jget<BestXi>(`/recommendations/best-xi/${gw}`),
  recs: (gw: number, position?: string, limit = 50) =>
    jget<Recommendation[]>(
      `/recommendations/${gw}?limit=${limit}${
        position ? `&position=${position}` : ""
      }`
    ),
  accuracy: (gw: number) => jget<Accuracy>(`/accuracy/${gw}`),
  accuracyHistory: () => jget<Accuracy[]>("/accuracy/history"),
  players: (position?: string, search?: string) =>
    jget<Player[]>(
      `/players?limit=500${position ? `&position=${position}` : ""}${
        search ? `&search=${encodeURIComponent(search)}` : ""
      }`
    ),
  player: (id: number) => jget<Player>(`/players/${id}`),
  playerHistory: (id: number) => jget<PlayerHistoryRow[]>(`/players/${id}/history`),
  guruMentions: (gw: number) => jget<GuruMention[]>(`/gurus/mentions/${gw}`),
  guruSummary: (gw: number) => jget<GuruSummaryRow[]>(`/gurus/summary/${gw}`),
  myTeam: (fplTeamId: number) => jget<MyTeam>(`/team/${fplTeamId}`),
  adminSeed: () => jpost<unknown>("/admin/seed"),
  adminTrain: () => jpost<unknown>("/admin/train"),
  adminGenerate: (gw: number) => jpost<unknown>(`/admin/generate/${gw}`),
};
