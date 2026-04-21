import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card p-5", className)}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h3 className="text-base font-semibold tracking-tight text-ink-900">{title}</h3>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Metric({
  label,
  value,
  trend,
}: {
  label: string;
  value: ReactNode;
  trend?: ReactNode;
}) {
  return (
    <div>
      <div className="metric-label">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="metric">{value}</div>
        {trend}
      </div>
    </div>
  );
}
