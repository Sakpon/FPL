import { useQuery } from "@tanstack/react-query";
import { DollarSign, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { useCurrentGameweek } from "@/hooks/useGameweek";
import { Card, CardHeader, Metric } from "@/components/Card";
import Pitch from "@/components/Pitch";
import PlayerCard from "@/components/PlayerCard";
import { Loading, ErrorState } from "@/components/Empty";

export default function BestXI() {
  const gwQ = useCurrentGameweek();
  const gw = gwQ.data?.id ?? 1;

  const bestXiQ = useQuery({
    queryKey: ["bestXi", gw],
    queryFn: () => api.bestXi(gw),
    enabled: !!gwQ.data,
  });

  return (
    <div className="py-8 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Best XI · GW {gw}</h1>
          <p className="text-ink-500 text-sm mt-1">
            Integer programming picks the XI that maximises expected points under
            £100m, ≤3 per club, with captain doubling applied.
          </p>
        </div>
        <div className="flex gap-3">
          <Card className="px-4 py-3 flex items-center gap-3">
            <Trophy className="h-4 w-4 text-pitch-600" />
            <Metric
              label="xPoints"
              value={bestXiQ.data ? bestXiQ.data.expected_points.toFixed(1) : "—"}
            />
          </Card>
          <Card className="px-4 py-3 flex items-center gap-3">
            <DollarSign className="h-4 w-4 text-pitch-600" />
            <Metric
              label="Squad cost"
              value={bestXiQ.data ? `£${bestXiQ.data.squad_cost.toFixed(1)}m` : "—"}
            />
          </Card>
        </div>
      </div>

      {bestXiQ.isLoading ? (
        <Loading />
      ) : bestXiQ.error ? (
        <ErrorState message={(bestXiQ.error as Error).message} />
      ) : bestXiQ.data ? (
        <>
          <div className="card p-6">
            <Pitch
              starters={bestXiQ.data.starters}
              captainId={bestXiQ.data.captain?.player_id ?? null}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {bestXiQ.data.starters.map((s) => (
              <PlayerCard key={s.player_id} rec={s} />
            ))}
          </div>

          <div className="card p-5">
            <CardHeader
              title="Bench"
              subtitle="4 lowest-risk, price-efficient alternates"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {bestXiQ.data.bench.map((b) => (
                <PlayerCard key={b.player_id} rec={b} showBand={false} />
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
