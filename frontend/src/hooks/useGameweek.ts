import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Gameweeks shift once per week and the Worker serves them from D1 with no
// cache — give React Query a 10-minute window to dedupe refetches across
// pages and a 30-minute GC so back/forward navigation re-uses cached data.
const GW_FRESH = {
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: false,
};

export function useCurrentGameweek() {
  return useQuery({ queryKey: ["currentGw"], queryFn: api.currentGw, ...GW_FRESH });
}

export function useGameweeks() {
  return useQuery({ queryKey: ["gws"], queryFn: api.gameweeks, ...GW_FRESH });
}
