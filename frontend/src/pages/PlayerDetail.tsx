import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardHeader, Metric } from "@/components/Card";
import { Loading, ErrorState } from "@/components/Empty";
import { cn, posColor, positionFullName } from "@/lib/utils";

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const playerId = Number(id);
  const playerQ = useQuery({
    queryKey: ["player", playerId],
    queryFn: () => api.player(playerId),
    enabled: !!playerId,
  });
  const histQ = useQuery({
    queryKey: ["playerHistory", playerId],
    queryFn: () => api.playerHistory(playerId),
    enabled: !!playerId,
  });

  if (playerQ.isLoading) return <div className="py-8"><Loading /></div>;
  if (playerQ.error) return <div className="py-8"><ErrorState message={(playerQ.error as Error).message} /></div>;

  const p = playerQ.data!;
  const history = histQ.data ?? [];
  const chartData = history.map((h) => ({
    label: `${h.season.slice(2, 5)}${h.gw}`,
    points: h.points,
    goals: h.goals,
    assists: h.assists,
  }));

  return (
    <div className="py-8 space-y-6">
      <Link to="/players" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> All players
      </Link>

      <div className="card p-6 flex items-center gap-5">
        <div className={cn("h-16 w-16 rounded-2xl grid place-items-center border text-lg font-bold", posColor(p.position))}>
          {p.position}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-ink-500">{positionFullName(p.position)} · {p.team_name ?? "—"}</div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.first_name} {p.second_name}</h1>
          <div className="text-sm text-ink-500">
            £{p.price.toFixed(1)}m · {p.selected_by_percent.toFixed(1)}% owned · form {p.form.toFixed(1)}
          </div>
        </div>
        <div className="hidden md:grid grid-cols-3 gap-5">
          <Metric label="Total pts" value={p.total_points} />
          <Metric label="Form" value={p.form.toFixed(1)} />
          <Metric label="Own %" value={`${p.selected_by_percent.toFixed(1)}%`} />
        </div>
      </div>

      {p.news && (
        <div className="card border-amber-200 bg-amber-50/70 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <div className="font-medium text-amber-900">Latest news</div>
            <div className="text-sm text-amber-800 mt-0.5">{p.news}</div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader
          title="Points per gameweek"
          subtitle="3 seasons of history powering the prediction model."
        />
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="ptsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
              <Area type="monotone" dataKey="points" stroke="#10b981" fill="url(#ptsGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader title="History" subtitle={`${history.length} gameweek rows`} />
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead className="text-ink-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Season</th>
                <th className="px-3 py-2 text-left">GW</th>
                <th className="px-3 py-2 text-right">Pts</th>
                <th className="px-3 py-2 text-right">Min</th>
                <th className="px-3 py-2 text-right">G/A</th>
                <th className="px-3 py-2 text-right">Bonus</th>
                <th className="px-3 py-2 text-right">BPS</th>
                <th className="px-3 py-2 text-right">xG</th>
                <th className="px-3 py-2 text-right">xA</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(-30).map((h, i) => (
                <tr key={i} className="border-t border-ink-100">
                  <td className="px-3 py-1.5">{h.season}</td>
                  <td className="px-3 py-1.5">{h.gw}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{h.points}</td>
                  <td className="px-3 py-1.5 text-right">{h.minutes}</td>
                  <td className="px-3 py-1.5 text-right">{h.goals}/{h.assists}</td>
                  <td className="px-3 py-1.5 text-right">{h.bonus}</td>
                  <td className="px-3 py-1.5 text-right">{h.bps}</td>
                  <td className="px-3 py-1.5 text-right">{h.xg.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right">{h.xa.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
