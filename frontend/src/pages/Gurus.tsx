import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Youtube, Twitter, ThumbsUp, ThumbsDown, Crown, Eye } from "lucide-react";
import { api } from "@/lib/api";
import { useCurrentGameweek } from "@/hooks/useGameweek";
import { Card, CardHeader } from "@/components/Card";
import { Loading, ErrorState } from "@/components/Empty";
import { cn, posColor } from "@/lib/utils";

const GURUS = [
  "Let's Talk FPL", "FPL Harry", "FPL Family", "FPL Mate", "FPL Focal",
  "Planet FPL", "FPL Raptor", "FPL BlackBox", "The FPL Wire", "FPL Andy",
];

export default function Gurus() {
  const gwQ = useCurrentGameweek();
  const gw = gwQ.data?.id ?? 1;

  const mentionsQ = useQuery({
    queryKey: ["mentions", gw],
    queryFn: () => api.guruMentions(gw),
    enabled: !!gwQ.data,
  });
  const summaryQ = useQuery({
    queryKey: ["guruSummary", gw],
    queryFn: () => api.guruSummary(gw),
    enabled: !!gwQ.data,
  });

  return (
    <div className="py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">The gurus' take · GW {gw}</h1>
        <p className="text-ink-500 text-sm mt-1">
          Signal extracted from YouTube transcripts and X posts across the top-10 FPL
          voices. Every mention is logged, scored for captain / differential / avoid
          intent, and folded into the prediction model as a weighted feature.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Covered sources"
          subtitle="Weightings in `guru_sources` table — higher = more trusted."
        />
        <div className="flex flex-wrap gap-2">
          {GURUS.map((g) => (
            <span key={g} className="chip-ink">
              <Youtube className="h-3 w-3 text-rose-500" />
              {g}
            </span>
          ))}
          <span className="chip-ink">
            <Twitter className="h-3 w-3 text-sky-500" />
            +3 X handles
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Most mentioned this week"
          subtitle="Aggregate mentions from all configured gurus."
        />
        {summaryQ.isLoading ? (
          <Loading />
        ) : summaryQ.error ? (
          <ErrorState message={(summaryQ.error as Error).message} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(summaryQ.data ?? []).map((r) => (
              <Link
                key={r.player_id}
                to={`/player/${r.player_id}`}
                className="card card-hover p-4 flex items-center gap-3"
              >
                <div className={cn("h-10 w-10 rounded-xl border grid place-items-center text-xs font-semibold", posColor(r.position))}>
                  {r.position}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate">{r.web_name}</div>
                    <div className="text-xs text-ink-500">{r.team_short}</div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-ink-500 mt-0.5">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {r.mentions} mentions
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        r.sentiment_sum >= 0 ? "text-pitch-700" : "text-rose-700"
                      )}
                    >
                      {r.sentiment_sum >= 0 ? <ThumbsUp className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />}
                      {r.sentiment_sum.toFixed(1)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Recent mentions" subtitle="Newest first." />
        {mentionsQ.isLoading ? (
          <Loading />
        ) : mentionsQ.error ? (
          <ErrorState message={(mentionsQ.error as Error).message} />
        ) : (
          <ul className="space-y-3">
            {(mentionsQ.data ?? []).slice(0, 30).map((m, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <div className={cn(
                  "h-8 w-8 rounded-lg grid place-items-center shrink-0",
                  m.platform === "youtube" ? "bg-rose-50 text-rose-600" : "bg-sky-50 text-sky-600"
                )}>
                  {m.platform === "youtube" ? <Youtube className="h-4 w-4" /> : <Twitter className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{m.source_name}</span>
                    <span className="text-xs text-ink-500">→</span>
                    <Link to={`/player/${m.player_id}`} className="font-medium text-pitch-700 hover:underline">
                      {m.web_name}
                    </Link>
                    {m.is_captain_pick && <span className="chip-accent"><Crown className="h-3 w-3" /> captain</span>}
                    {m.is_differential && <span className="chip-ink">differential</span>}
                    {m.is_avoid && <span className="chip-warn">avoid</span>}
                  </div>
                  <p className="text-ink-500 mt-0.5 line-clamp-2">{m.snippet}</p>
                </div>
                <div className="text-xs text-ink-500 shrink-0">
                  {new Date(m.captured_at).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
