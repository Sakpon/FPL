import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const posColor = (pos: string): string => {
  switch (pos) {
    case "GK":
      return "bg-amber-500/10 text-amber-700 border-amber-200";
    case "DEF":
      return "bg-sky-500/10 text-sky-700 border-sky-200";
    case "MID":
      return "bg-pitch-500/10 text-pitch-700 border-pitch-200";
    case "FWD":
      return "bg-rose-500/10 text-rose-700 border-rose-200";
    default:
      return "bg-ink-100 text-ink-700 border-ink-200";
  }
};

export const positionFullName = (pos: string): string => {
  switch (pos) {
    case "GK":
      return "Goalkeeper";
    case "DEF":
      return "Defender";
    case "MID":
      return "Midfielder";
    case "FWD":
      return "Forward";
    default:
      return pos;
  }
};

export function formatDeadline(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
