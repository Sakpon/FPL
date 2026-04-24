import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardHeader } from "@/components/Card";
import { Loading, ErrorState } from "@/components/Empty";
import { AvailabilityChip, FixtureChip } from "@/components/Chips";
import { cn, posColor } from "@/lib/utils";
import type { Position } from "@/types/api";

const POSITIONS: (Position | "ALL")[] = ["ALL", "GK", "DEF", "MID", "FWD"];

export default function Players() {
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [q, setQ] = useState("");
  const playersQ = useQuery({
    queryKey: ["players", pos, q],
    queryFn: () => api.players(pos === "ALL" ? undefined : pos, q || undefined),
  });

  const rows = useMemo(() => playersQ.data ?? [], [playersQ.data]);

  return (
    <div className="py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Players</h1>
          <p className="text-ink-500 text-sm mt-1">
            Every player in the current squad pool, sortable by predicted and
            actual points.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
            <input
              placeholder="Search player"
              className="pl-9 pr-3 py-2 rounded-lg border border-ink-200 bg-white text-sm w-56
                         focus:outline-none focus:ring-2 focus:ring-pitch-500/40"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex rounded-lg border border-ink-200 bg-white p-0.5">
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPos(p)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition",
                  pos === p
                    ? "bg-ink-900 text-white"
                    : "text-ink-500 hover:text-ink-900"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader title="Pool" subtitle={`${rows.length} players`} />
        {playersQ.isLoading ? (
          <Loading />
        ) : playersQ.error ? (
          <ErrorState message={(playersQ.error as Error).message} />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead className="text-ink-500 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Player</th>
                  <th className="px-3 py-2 text-left">Pos</th>
                  <th className="px-3 py-2 text-left">Team</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Form</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Owned %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-ink-100 hover:bg-ink-50/60">
                    <td className="px-3 py-2">
                      <Link to={`/player/${p.id}`} className="font-medium text-ink-900 hover:text-pitch-600">
                        {p.web_name}
                      </Link>
                      <div className="text-xs text-ink-500">
                        {p.first_name} {p.second_name}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn("chip border", posColor(p.position))}>{p.position}</span>
                    </td>
                    <td className="px-3 py-2 text-ink-700">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{p.team_short ?? "—"}</span>
                        <FixtureChip
                          opp={p.next_opp_short}
                          isHome={p.next_was_home}
                          diff={p.next_difficulty}
                        />
                        <AvailabilityChip
                          status={p.status}
                          chance={p.chance_of_playing}
                          news={p.news}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">£{p.price.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{p.form.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right font-medium">{p.total_points}</td>
                    <td className="px-3 py-2 text-right">{p.selected_by_percent.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
