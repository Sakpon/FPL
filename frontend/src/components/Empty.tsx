import { Loader2, AlertTriangle } from "lucide-react";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="card p-10 flex items-center justify-center gap-3 text-ink-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="card p-6 flex items-start gap-3 border-amber-200 bg-amber-50/70">
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
      <div>
        <div className="font-semibold text-amber-900">Something went wrong</div>
        <div className="text-sm text-amber-800 mt-0.5">{message}</div>
      </div>
    </div>
  );
}
