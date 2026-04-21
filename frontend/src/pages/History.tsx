import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Bar,
  ComposedChart,
} from "recharts";
import { api } from "@/lib/api";
import { Card, CardHeader, Metric } from "@/components/Card";
import { Loading, ErrorState } from "@/components/Empty";

export default function History() {
  const q = useQuery({ queryKey: ["accHistory"], queryFn: api.accuracyHistory });

  if (q.isLoading) return <div className="py-8"><Loading /></div>;
  if (q.error) return <div className="py-8"><ErrorState message={(q.error as Error).message} /></div>;
  const data = (q.data ?? []).filter((r) => r.mae != null);

  const avgMae = data.length ? data.reduce((s, r) => s + (r.mae ?? 0), 0) / data.length : 0;
  const avgCorr = data.length ? data.reduce((s, r) => s + (r.rank_corr ?? 0), 0) / data.length : 0;
  const capHits = data.filter((r) => (r.captain_actual ?? 0) >= 6).length;

  return (
    <div className="py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Prediction accuracy</h1>
        <p className="text-ink-500 text-sm mt-1">
          Every recommendation is compared to the actual FPL points earned
          after each gameweek. This is where the model earns its trust.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><Metric label="Gameweeks scored" value={data.length} /></Card>
        <Card><Metric label="Avg MAE" value={avgMae.toFixed(2)} /></Card>
        <Card><Metric label="Avg rank ρ" value={avgCorr.toFixed(2)} /></Card>
        <Card><Metric label="Captain ≥6 pts" value={`${capHits}/${data.length}`} /></Card>
      </div>

      <Card>
        <CardHeader title="Error per gameweek" subtitle="Lower MAE = tighter predictions." />
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="gw" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
              />
              <Legend />
              <Line type="monotone" dataKey="mae" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="rmse" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Realised XI vs captain points"
          subtitle="XI realised is the starting XI's actual points (captain doubled)."
        />
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="gw" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
              />
              <Legend />
              <Bar dataKey="xi_realised" fill="#10b981" name="XI realised" />
              <Line type="monotone" dataKey="captain_actual" stroke="#7c3aed" strokeWidth={2} name="Captain" dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Raw per-gameweek log"
          subtitle="Every recommendation ↔ actual outcome is persisted in SQLite for audit."
        />
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead className="text-ink-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">GW</th>
                <th className="px-3 py-2 text-right">MAE</th>
                <th className="px-3 py-2 text-right">RMSE</th>
                <th className="px-3 py-2 text-right">ρ</th>
                <th className="px-3 py-2 text-right">Captain</th>
                <th className="px-3 py-2 text-right">XI realised</th>
                <th className="px-3 py-2 text-right">Top-pick hits</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.gw} className="border-t border-ink-100">
                  <td className="px-3 py-2 font-medium">{r.gw}</td>
                  <td className="px-3 py-2 text-right">{r.mae?.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{r.rmse?.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{r.rank_corr?.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{r.captain_actual ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">{r.xi_realised ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {r.top_picks_hit ?? 0}/{r.top_picks_total ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
