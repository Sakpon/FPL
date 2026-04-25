import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Crown,
  Info,
  Radio,
  User,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardHeader, Metric } from "@/components/Card";
import { ErrorState, Loading } from "@/components/Empty";
import { AvailabilityChip, FixtureChip } from "@/components/Chips";
import type {
  MyTeam,
  MyTeamLive,
  MyTeamLiveSquadEntry,
  MyTeamSquadEntry,
} from "@/types/api";

const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

export default function MyTeamPage() {
  const [teamId, setTeamId] = useState("");
  const [submitted, setSubmitted] = useState<number | null>(null);

  const mut = useMutation({
    mutationFn: (id: number) => api.myTeam(id),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(teamId.trim());
    if (!Number.isInteger(n) || n <= 0) return;
    setSubmitted(n);
    mut.mutate(n);
  };

  return (
    <div className="py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Team</h1>
        <p className="text-ink-500 text-sm mt-1">
          Enter your FPL team ID to see model-scored picks for your 15, a
          suggested captain and starting XI, and swap ideas for the weakest
          players in your squad.
        </p>
      </div>

      <Card>
        <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex-1">
            <label className="metric-label mb-1 block">FPL team ID</label>
            <input
              type="text"
              inputMode="numeric"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              placeholder="e.g. 1234567"
              className="w-full rounded-xl border border-ink-200 px-3 py-2 outline-none focus:border-pitch-500 focus:ring-2 focus:ring-pitch-500/20"
            />
            <p className="text-xs text-ink-500 mt-1.5 flex items-center gap-1">
              <Info className="h-3 w-3" />
              Find it in your FPL profile URL:
              <code className="bg-ink-100 px-1 rounded">fantasy.premierleague.com/entry/<b>ID</b>/…</code>
            </p>
          </div>
          <button type="submit" className="btn" disabled={mut.isPending}>
            {mut.isPending ? "Analysing…" : "Analyse"}
          </button>
        </form>
      </Card>

      {mut.isPending && submitted && <Loading />}
      {mut.isError && (
        <ErrorState message={(mut.error as Error).message || "Could not analyse team"} />
      )}
      {mut.data && (
        <>
          <LiveSection teamId={mut.data.team_id} />
          <TeamView team={mut.data} />
        </>
      )}
    </div>
  );
}

function LiveSection({ teamId }: { teamId: number }) {
  // Poll the live endpoint every 60s. The Worker edge-caches the upstream
  // FPL `/event/{id}/live/` for 30s so this is cheap. The query is enabled
  // unconditionally; if there's no current GW the API returns 404 and we
  // hide the section.
  const liveQ = useQuery({
    queryKey: ["myTeamLive", teamId],
    queryFn: () => api.myTeamLive(teamId),
    refetchInterval: (q) => (q.state.error || q.state.data?.finished ? false : 60_000),
    refetchOnWindowFocus: true,
    retry: false,
  });

  if (liveQ.isLoading) return null;
  if (liveQ.isError || !liveQ.data) return null;
  const data = liveQ.data;
  if (data.finished) return null;

  return <LiveCard data={data} />;
}

function LiveCard({ data }: { data: MyTeamLive }) {
  const sortedSquad = [...data.squad].sort((a, b) => {
    if (a.is_starter !== b.is_starter) return a.is_starter ? -1 : 1;
    if (a.is_starter) return a.pick_position - b.pick_position;
    return a.pick_position - b.pick_position;
  });

  return (
    <Card>
      <CardHeader
        title={
          <div className="flex items-center gap-2">
            <span className="relative inline-flex">
              <Radio className="h-4 w-4 text-rose-600" />
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            </span>
            Live · GW{data.gw}
          </div>
        }
        subtitle={`${data.starters_played}/${data.starters_total} starters in play · refreshes every 60s`}
        right={
          <div className="text-right">
            <div className="text-3xl font-semibold tabular-nums">
              {data.live_points}
            </div>
            <div className="metric-label">live pts</div>
          </div>
        }
      />
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm">
          <thead className="text-ink-500 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Pos</th>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-right">Min</th>
              <th className="px-3 py-2 text-right">G/A</th>
              <th className="px-3 py-2 text-right">Bonus</th>
              <th className="px-3 py-2 text-right">Pts</th>
            </tr>
          </thead>
          <tbody>
            {sortedSquad.map((p) => (
              <LiveRow key={p.player_id} p={p} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LiveRow({ p }: { p: MyTeamLiveSquadEntry }) {
  const ko = p.minutes === 0 && p.is_starter;
  return (
    <tr
      className={`border-t border-ink-100 ${
        p.is_starter ? "" : "bg-ink-50/40 text-ink-500"
      }`}
    >
      <td className="px-3 py-2">
        <span className="chip-ink">{p.position}</span>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink-900">{p.web_name}</span>
          {p.is_captain && (
            <span className="chip-accent">
              <Crown className="h-3 w-3" /> C
            </span>
          )}
          {p.is_vice_captain && !p.is_captain && (
            <span className="chip-ink">VC</span>
          )}
          {!p.is_starter && <span className="text-xs">bench</span>}
        </div>
        <div className="text-xs text-ink-500">{p.team_short ?? "—"}</div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {ko ? "—" : p.minutes}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {p.goals_scored}/{p.assists}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{p.bonus}</td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums">
        {p.is_starter ? p.points : p.raw_points}
        {p.is_captain && p.multiplier > 1 && (
          <span className="ml-1 text-[10px] text-accent-600">
            ×{p.multiplier}
          </span>
        )}
      </td>
    </tr>
  );
}

function TeamView({ team }: { team: MyTeam }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-pitch-600" />
              {team.team_name ?? `Team #${team.team_id}`}
            </div>
          }
          subtitle={team.player_name ?? undefined}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="Overall rank" value={fmtRank(team.overall_rank)} />
          <Metric label="Total points" value={team.total_points ?? "—"} />
          <Metric
            label="Team value"
            value={team.team_value != null ? `£${team.team_value.toFixed(1)}m` : "—"}
            trend={
              team.bank != null ? (
                <span className="chip-ink">£{team.bank.toFixed(1)}m bank</span>
              ) : null
            }
          />
          <Metric
            label={`Projected GW${team.target_gw}`}
            value={team.expected_points.toFixed(1)}
            trend={<span className="chip-pitch">× captain</span>}
          />
        </div>
        {team.notes && (
          <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {team.notes}
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title={
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-accent-600" />
                Suggested captain
              </div>
            }
            subtitle={
              team.captain_suggestion
                ? `Highest predicted points in your starting XI.`
                : undefined
            }
          />
          {team.captain_suggestion ? (
            <SquadRow s={team.captain_suggestion} highlight />
          ) : (
            <p className="text-sm text-ink-500">No captain candidate found.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="Starting XI (formation-legal)" />
          <SquadTable entries={sortForDisplay(team.starting_xi)} />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Bench"
          subtitle="Four players not in the suggested XI — ordered by predicted points."
        />
        <SquadTable
          entries={[...team.bench].sort(
            (a, b) => (b.predicted_points ?? -Infinity) - (a.predicted_points ?? -Infinity)
          )}
        />
      </Card>

      {team.swap_suggestions.length > 0 && (
        <Card>
          <CardHeader
            title={
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-pitch-600" />
                Swap ideas
              </div>
            }
            subtitle="Top-ranked replacements for the three weakest starters in your XI."
          />
          <div className="space-y-4">
            {team.swap_suggestions.map((sw) => (
              <SwapBlock key={sw.out.player_id} swap={sw} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function SquadTable({ entries }: { entries: MyTeamSquadEntry[] }) {
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead className="text-ink-500 text-xs uppercase">
          <tr>
            <th className="px-3 py-2 text-left">Pos</th>
            <th className="px-3 py-2 text-left">Player</th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2 text-right">xPts</th>
            <th className="px-3 py-2 text-right">p10 · p90</th>
            <th className="px-3 py-2 text-right">Rank</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((s) => (
            <SquadRowTr key={s.player_id} s={s} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SquadRowTr({ s }: { s: MyTeamSquadEntry }) {
  return (
    <tr className="border-t border-ink-100">
      <td className="px-3 py-2 font-medium">
        <span className={`chip-ink`}>{s.position}</span>
      </td>
      <td className="px-3 py-2">
        <div className="font-medium text-ink-900">{s.web_name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap text-xs text-ink-500">
          <span>{s.team_short ?? "—"}</span>
          <FixtureChip
            opp={s.next_opp_short}
            isHome={s.next_was_home}
            diff={s.next_difficulty}
          />
          <AvailabilityChip
            status={s.status}
            chance={s.chance_of_playing}
            news={s.news}
          />
        </div>
      </td>
      <td className="px-3 py-2 text-right">{s.price != null ? `£${s.price.toFixed(1)}` : "—"}</td>
      <td className="px-3 py-2 text-right font-medium">
        {s.predicted_points != null ? s.predicted_points.toFixed(1) : "—"}
      </td>
      <td className="px-3 py-2 text-right text-xs text-ink-500">
        {s.p10 != null && s.p90 != null
          ? `${s.p10.toFixed(1)} · ${s.p90.toFixed(1)}`
          : "—"}
      </td>
      <td className="px-3 py-2 text-right text-xs">
        {s.rank_in_position != null ? `#${s.rank_in_position}` : "—"}
      </td>
    </tr>
  );
}

function SquadRow({ s, highlight }: { s: MyTeamSquadEntry; highlight?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border p-3 ${
        highlight ? "border-accent-500 bg-accent-50" : "border-ink-200"
      }`}
    >
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="chip-ink">{s.position}</span>
          <span className="font-semibold text-ink-900">{s.web_name}</span>
          <span className="text-xs text-ink-500">{s.team_short ?? ""}</span>
          <FixtureChip
            opp={s.next_opp_short}
            isHome={s.next_was_home}
            diff={s.next_difficulty}
          />
          <AvailabilityChip
            status={s.status}
            chance={s.chance_of_playing}
            news={s.news}
          />
        </div>
        <div className="text-xs text-ink-500 mt-1">
          Rank #{s.rank_in_position ?? "—"} in position
          {s.price != null && <> · £{s.price.toFixed(1)}m</>}
          {s.news ? <span className="block mt-0.5 italic">{s.news}</span> : null}
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-semibold">
          {s.predicted_points != null ? s.predicted_points.toFixed(1) : "—"}
        </div>
        <div className="text-xs text-ink-500">xPts</div>
      </div>
    </div>
  );
}

function SwapBlock({ swap }: { swap: MyTeam["swap_suggestions"][number] }) {
  return (
    <div className="rounded-xl border border-ink-200 p-4">
      <div className="flex items-center gap-2 text-sm text-ink-500">
        Consider transferring out
      </div>
      <div className="mt-2">
        <SquadRow s={swap.out} />
      </div>
      <div className="mt-3 text-xs uppercase text-ink-500 tracking-wide">
        Replacements
      </div>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
        {swap.candidates.map((c) => (
          <div
            key={c.player_id}
            className="flex items-center justify-between rounded-lg border border-ink-200 p-2.5"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="chip-ink">{c.position}</span>
                <span className="font-medium">{c.web_name}</span>
                <span className="text-xs text-ink-500">{c.team_short ?? ""}</span>
              </div>
              <div className="text-xs text-ink-500 mt-0.5">
                £{c.price.toFixed(1)}m · #{c.rank_in_position} in position
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold">{c.predicted_points.toFixed(1)}</div>
              <div className="text-xs text-ink-500">xPts</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function sortForDisplay(entries: MyTeamSquadEntry[]): MyTeamSquadEntry[] {
  return [...entries].sort((a, b) => {
    const pa = POS_ORDER[a.position] ?? 99;
    const pb = POS_ORDER[b.position] ?? 99;
    if (pa !== pb) return pa - pb;
    return (b.predicted_points ?? -Infinity) - (a.predicted_points ?? -Infinity);
  });
}

function fmtRank(rank: number | null): string {
  if (rank == null) return "—";
  if (rank >= 1_000_000) return `${(rank / 1_000_000).toFixed(2)}M`;
  if (rank >= 1_000) return `${(rank / 1_000).toFixed(0)}K`;
  return String(rank);
}
