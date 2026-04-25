import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  Target,
  ShieldCheck,
  Brain,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardHeader, Metric } from "@/components/Card";
import PlayerCard from "@/components/PlayerCard";
import { Loading, ErrorState } from "@/components/Empty";
import { useCurrentGameweek } from "@/hooks/useGameweek";
import { formatDeadline, positionFullName } from "@/lib/utils";
import type { Position } from "@/types/api";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

export default function Dashboard() {
  const gwQ = useCurrentGameweek();
  const gw = gwQ.data?.id ?? 1;

  const picksQ = useQuery({
    queryKey: ["topPicks", gw],
    queryFn: () => api.topPicks(gw),
    enabled: !!gwQ.data,
  });

  const bestXiQ = useQuery({
    queryKey: ["bestXi", gw],
    queryFn: () => api.bestXi(gw),
    enabled: !!gwQ.data,
  });

  const summaryQ = useQuery({
    queryKey: ["guruSummary", gw],
    queryFn: () => api.guruSummary(gw),
    enabled: !!gwQ.data,
  });

  const accQ = useQuery({
    queryKey: ["accHistory"],
    queryFn: api.accuracyHistory,
  });

  const lastAcc = accQ.data && accQ.data.length ? accQ.data[accQ.data.length - 1] : null;

  return (
    <div className="py-8 space-y-8">
      <Hero gw={gw} deadline={gwQ.data?.deadline_time ?? null} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <Metric
            label="Gameweek"
            value={gw}
            trend={<span className="chip-pitch">LIVE</span>}
          />
        </Card>
        <Card>
          <Metric
            label="Model MAE (latest GW)"
            value={lastAcc?.mae?.toFixed(2) ?? "—"}
            trend={
              lastAcc?.rank_corr != null ? (
                <span className="chip-ink">ρ {lastAcc.rank_corr.toFixed(2)}</span>
              ) : null
            }
          />
        </Card>
        <Card>
          <Metric
            label="XI realised vs avg"
            value={lastAcc?.xi_realised ?? "—"}
            trend={
              gwQ.data?.average_entry_score ? (
                <span className="chip-ink">avg {gwQ.data.average_entry_score}</span>
              ) : null
            }
          />
        </Card>
        <Card>
          <Metric
            label="Captain hit (last GW)"
            value={lastAcc?.captain_actual ?? "—"}
            trend={<span className="chip-accent">× 2</span>}
          />
        </Card>
      </div>

      <div>
        <SectionHeader
          icon={<Target className="h-4 w-4 text-pitch-600" />}
          title={`GW ${gw} · Top Pick per Position`}
          subtitle="Highest predicted points by model + social signal, with p10–p90 range."
        />
        {picksQ.isLoading ? (
          <Loading />
        ) : picksQ.error ? (
          <ErrorState message={(picksQ.error as Error).message} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {POSITIONS.map((pos) => {
              const rec = picksQ.data?.picks?.[pos];
              if (!rec) {
                return (
                  <Card key={pos}>
                    <div className="text-sm text-ink-500">
                      No {positionFullName(pos).toLowerCase()} prediction
                    </div>
                  </Card>
                );
              }
              return <PlayerCard key={pos} rec={rec} featured />;
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-5">
          <CardHeader
            title={<div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-pitch-600" />Recommended XI</div>}
            subtitle={`Best starting 11 under £100m with captain armband — GW ${gw}`}
            right={
              bestXiQ.data ? (
                <div className="text-right text-xs text-ink-500">
                  Cost £{bestXiQ.data.squad_cost.toFixed(1)}m · xPts {bestXiQ.data.expected_points.toFixed(1)}
                </div>
              ) : null
            }
          />
          {bestXiQ.isLoading ? (
            <Loading />
          ) : bestXiQ.error ? (
            <ErrorState message={(bestXiQ.error as Error).message} />
          ) : bestXiQ.data ? (
            <MiniPitch data={bestXiQ.data} />
          ) : null}
        </div>
        <div className="card p-5">
          <CardHeader
            title={<div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent-600" />Guru Buzz</div>}
            subtitle="Most mentioned players across top-10 FPL gurus this week."
          />
          {summaryQ.isLoading ? (
            <Loading />
          ) : summaryQ.error ? (
            <ErrorState message={(summaryQ.error as Error).message} />
          ) : (
            <GuruBuzzList rows={summaryQ.data ?? []} />
          )}
        </div>
      </div>

      <div className="card p-5">
        <CardHeader
          title={<div className="flex items-center gap-2"><Brain className="h-4 w-4 text-ink-700" />How this works</div>}
          subtitle="Features driving this week's recommendations"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-ink-700">
          <Explainer title="3 seasons of data" icon="📊">
            LightGBM per-position regressors trained on merged gameweek data
            (2023/24, 2024/25, current). Rolling form over last 3/5/10 GWs,
            expected stats, team strength and opponent difficulty.
          </Explainer>
          <Explainer title="Top-10 guru signal" icon="🎙️">
            YouTube transcripts and X posts from the biggest FPL voices are
            tokenised, scored for captain / differential / avoid intents, and
            folded into the feature set as weighted sentiment.
          </Explainer>
          <Explainer title="Honest uncertainty" icon="📉">
            Each prediction comes with a p10–p90 band from quantile regression.
            Captain is chosen to maximise expected points under budget and
            club-count constraints (ILP).
          </Explainer>
        </div>
      </div>
    </div>
  );
}

function Hero({ gw, deadline }: { gw: number; deadline: string | null }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-card">
      <div className="absolute inset-0 bg-pitch-hero pointer-events-none" />
      <div className="absolute inset-0 bg-grid-soft [background-size:28px_28px] opacity-40 pointer-events-none" />
      <div className="relative p-8 md:p-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div className="max-w-2xl">
          <div className="chip-pitch mb-3">
            <CalendarClock className="h-3.5 w-3.5" />
            Deadline {formatDeadline(deadline)}
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-ink-900">
            GW {gw} picks, backed by data <span className="text-pitch-600">and</span> the gurus.
          </h1>
          <p className="mt-3 text-ink-500 md:text-lg">
            Three seasons of FPL history fused with signal scraped from the
            top-10 FPL YouTubers and X voices, stress-tested by walk-forward
            validation.
          </p>
        </div>
        <div className="flex gap-3">
          <a href="#top-picks" className="btn">View picks</a>
          <a href="/best-xi" className="btn-outline">Best XI</a>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({
  icon, title, subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div id="top-picks" className="mb-3">
      <div className="flex items-center gap-2 text-sm font-medium text-ink-700">
        {icon}
        <span>{title}</span>
      </div>
      {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function MiniPitch({ data }: { data: import("@/types/api").BestXi }) {
  const captainId = data.captain?.player_id ?? null;
  return (
    <div className="space-y-4">
      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      {(() => { return null; })()}
      {/* Pitch component imported dynamically to keep bundle light */}
      <PitchView starters={data.starters} captainId={captainId} />
      <div>
        <div className="metric-label mb-2">Bench</div>
        <div className="flex flex-wrap gap-2">
          {data.bench.map((b) => (
            <span
              key={b.player_id}
              className="chip-ink"
              title={`${b.predicted_points.toFixed(1)} pts`}
            >
              {b.web_name} · £{b.price.toFixed(1)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

import Pitch from "@/components/Pitch";
function PitchView(props: { starters: import("@/types/api").Recommendation[]; captainId: number | null }) {
  return <Pitch {...props} />;
}

function GuruBuzzList({ rows }: { rows: import("@/types/api").GuruSummaryRow[] }) {
  if (!rows.length) {
    return (
      <p className="text-sm text-ink-500">
        No guru mentions captured yet. Seed data or ingest a YouTube transcript.
      </p>
    );
  }
  const max = Math.max(...rows.map((r) => r.mentions));
  return (
    <ul className="space-y-2">
      {rows.slice(0, 10).map((r) => {
        const pct = Math.round((r.mentions / max) * 100);
        return (
          <li key={r.player_id} className="flex items-center gap-3">
            <div className="w-36 min-w-0 truncate font-medium text-sm text-ink-900">
              {r.web_name}
              <span className="text-ink-500 ml-1">· {r.team_short}</span>
            </div>
            <div className="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
              <div
                className="h-full bg-accent-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="w-16 text-right text-xs text-ink-500 tabular-nums">
              {r.mentions} · {r.sentiment_sum >= 0 ? "+" : ""}
              {r.sentiment_sum.toFixed(1)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Explainer({
  title, icon, children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink-200 p-4 bg-ink-50/50">
      <div className="flex items-center gap-2 font-medium text-ink-900">
        <span aria-hidden>{icon}</span>
        <span>{title}</span>
      </div>
      <p className="text-sm text-ink-500 mt-1.5 leading-relaxed">{children}</p>
    </div>
  );
}
