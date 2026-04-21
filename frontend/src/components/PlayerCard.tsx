import { Link } from "react-router-dom";
import { Crown, Sparkles, TrendingUp, MessageSquareText } from "lucide-react";
import type { Recommendation } from "@/types/api";
import { cn, posColor, positionFullName } from "@/lib/utils";

interface Props {
  rec: Recommendation;
  featured?: boolean;
  showBand?: boolean;
}

export default function PlayerCard({ rec, featured, showBand = true }: Props) {
  const band = Math.max(0.0001, rec.p90 - rec.p10);
  const midRel = ((rec.predicted_points - rec.p10) / band) * 100;

  return (
    <Link
      to={`/player/${rec.player_id}`}
      className={cn(
        "relative group card card-hover p-4 block",
        featured && "ring-2 ring-pitch-500/50 shadow-pop"
      )}
    >
      {rec.is_captain && (
        <div className="absolute -top-2 -right-2 chip-accent shadow-card">
          <Crown className="h-3 w-3" /> Captain
        </div>
      )}
      {rec.is_top_pick && !rec.is_captain && (
        <div className="absolute -top-2 -right-2 chip-pitch shadow-card">
          <Sparkles className="h-3 w-3" /> Top pick
        </div>
      )}

      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-10 w-10 rounded-xl border grid place-items-center text-[11px] font-semibold",
            posColor(rec.position)
          )}
          title={positionFullName(rec.position)}
        >
          {rec.position}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate font-semibold text-ink-900">{rec.web_name}</div>
            <div className="text-sm text-ink-500">£{rec.price.toFixed(1)}</div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-500">
            <span className="chip-ink">{rec.team_short ?? "—"}</span>
            <span>Rank #{rec.rank_in_position}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="metric-label">Predicted</div>
          <div className="metric leading-none">{rec.predicted_points.toFixed(1)}</div>
        </div>
        <div className="text-right space-y-0.5 text-[11px] text-ink-500">
          <div className="flex items-center gap-1 justify-end">
            <TrendingUp className="h-3 w-3" />
            <span>p10 {rec.p10.toFixed(1)} · p90 {rec.p90.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1 justify-end">
            <MessageSquareText className="h-3 w-3" />
            <span>Social {rec.social_score.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {showBand && (
        <div className="mt-3 h-2 rounded-full bg-ink-100 relative overflow-hidden">
          <div
            className="absolute inset-y-0 bg-pitch-500/20"
            style={{ left: 0, width: "100%" }}
          />
          <div
            className="absolute -top-1 h-4 w-1 rounded-full bg-ink-900"
            style={{ left: `calc(${Math.min(95, Math.max(2, midRel))}% - 2px)` }}
          />
        </div>
      )}
    </Link>
  );
}
