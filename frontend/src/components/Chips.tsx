import { cn } from "@/lib/utils";

export function FixtureChip({
  opp,
  isHome,
  diff,
  className,
}: {
  opp?: string | null;
  isHome?: boolean | null;
  diff?: number | null;
  className?: string;
}) {
  if (!opp) return null;
  const tone =
    diff == null
      ? "bg-ink-100 text-ink-700"
      : diff <= 2
      ? "bg-pitch-100 text-pitch-800"
      : diff === 3
      ? "bg-ink-100 text-ink-700"
      : diff === 4
      ? "bg-amber-100 text-amber-800"
      : "bg-rose-100 text-rose-800";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        tone,
        className
      )}
      title={`Opponent difficulty ${diff ?? "?"}`}
    >
      <span>
        {isHome ? "vs" : "@"} {opp}
      </span>
      {diff != null && <span className="opacity-70">· {diff}</span>}
    </span>
  );
}

export function AvailabilityChip({
  status,
  chance,
  news,
  className,
}: {
  status?: string | null;
  chance?: number | null;
  news?: string | null;
  className?: string;
}) {
  const normalisedStatus = (status ?? "a").toLowerCase();
  const fullyAvailable =
    normalisedStatus === "a" && (chance == null || chance >= 100);
  if (fullyAvailable) return null;

  const isOut =
    chance === 0 ||
    (normalisedStatus !== "a" &&
      normalisedStatus !== "d" &&
      (chance == null || chance === 0));

  const tone = isOut
    ? "bg-rose-100 text-rose-800"
    : chance != null && chance <= 50
    ? "bg-amber-100 text-amber-800"
    : "bg-yellow-100 text-yellow-800";

  const label = isOut
    ? "OUT"
    : chance != null
    ? `${chance}%`
    : "Doubt";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        tone,
        className
      )}
      title={news ?? undefined}
    >
      {label}
    </span>
  );
}
