import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useCurrentGameweek() {
  return useQuery({ queryKey: ["currentGw"], queryFn: api.currentGw });
}

export function useGameweeks() {
  return useQuery({ queryKey: ["gws"], queryFn: api.gameweeks });
}
