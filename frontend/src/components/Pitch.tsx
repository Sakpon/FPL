import { Crown } from "lucide-react";
import { Link } from "react-router-dom";
import type { Recommendation } from "@/types/api";
import { cn, posColor } from "@/lib/utils";

interface Props {
  starters: Recommendation[];
  captainId: number | null;
}

const ROWS = ["GK", "DEF", "MID", "FWD"] as const;

export default function Pitch({ starters, captainId }: Props) {
  const byPos: Record<string, Recommendation[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const s of starters) byPos[s.position]?.push(s);
  for (const k of Object.keys(byPos)) {
    byPos[k].sort((a, b) => b.predicted_points - a.predicted_points);
  }

  return (
    <div className="relative rounded-2xl border border-emerald-700/30 bg-gradient-to-b from-emerald-600 to-emerald-800 p-6 overflow-hidden">
      {/* pitch stripes */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className={cn("absolute inset-x-0", i % 2 === 0 ? "bg-emerald-400/20" : "bg-transparent")}
            style={{ top: `${(i / 8) * 100}%`, height: `${100 / 8}%` }}
          />
        ))}
      </div>
      {/* centre circle */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30 w-28 h-28 pointer-events-none" />
      <div className="absolute left-1/2 top-0 -translate-x-1/2 h-full w-px bg-white/30 pointer-events-none" />

      <div className="relative flex flex-col gap-6">
        {ROWS.map((pos) => {
          const row = byPos[pos];
          if (!row.length) return null;
          return (
            <div
              key={pos}
              className={cn(
                "grid gap-4",
                row.length === 1 && "grid-cols-1",
                row.length === 2 && "grid-cols-2",
                row.length === 3 && "grid-cols-3",
                row.length === 4 && "grid-cols-4",
                row.length === 5 && "grid-cols-5",
              )}
            >
              {row.map((p) => (
                <Link
                  key={p.player_id}
                  to={`/player/${p.player_id}`}
                  className="group text-center"
                >
                  <div className="relative mx-auto w-16 h-16 rounded-full bg-white shadow-pop grid place-items-center ring-2 ring-white/80">
                    <div
                      className={cn(
                        "h-12 w-12 rounded-full grid place-items-center text-[10px] font-bold border",
                        posColor(p.position),
                      )}
                    >
                      {p.position}
                    </div>
                    {p.player_id === captainId && (
                      <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-accent-600 text-white grid place-items-center shadow-pop">
                        <Crown className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 text-xs font-semibold text-white drop-shadow truncate">
                    {p.web_name}
                  </div>
                  <div className="text-[10px] text-emerald-50/90">
                    {p.predicted_points.toFixed(1)} pts · £{p.price.toFixed(1)}
                  </div>
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
