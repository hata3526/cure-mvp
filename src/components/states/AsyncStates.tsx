import { Inbox, AlertCircle } from "lucide-react";

export const LoadingList = () => (
  <div className="space-y-3" aria-busy>
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="h-10 w-full animate-pulse rounded-2xl bg-muted" />
    ))}
  </div>
);

export function EmptyState({
  title = "データがありません",
  action,
}: {
  title?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border p-10 text-center text-muted-foreground">
      <Inbox className="mx-auto h-8 w-8" aria-hidden />
      <p className="mt-3 text-sm">{title}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message = "エラーが発生しました",
}: {
  message?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border p-6 text-destructive-foreground"
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5" aria-hidden />
        <p className="font-medium">{message}</p>
      </div>
    </div>
  );
}
