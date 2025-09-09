import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { PeriodPicker, getPresetRange } from "../components/PeriodPicker";
import { Heatmap } from "../components/Heatmap";
import { ExportCsv } from "../components/ExportCsv";
import { useHeatmap, useTotals } from "../lib/queries";
import type { DateRange } from "../types";

import {
  EmptyState,
  ErrorState,
  LoadingList,
} from "../components/states/AsyncStates";

export default function DashboardRoute() {
  const [range, setRange] = useState<DateRange>(() => getPresetRange("7d"));
  const totals = useTotals(range);
  const heatmap = useHeatmap(range);

  const totalCards = useMemo(() => {
    const map = new Map<string, number>();
    const rows: Array<{ resident_name: string; total: number }> = Array.isArray(
      totals.data
    )
      ? (totals.data as Array<{ resident_name: string; total: number }>)
      : [];
    for (const r of rows) {
      const key = `${r.resident_name}`;
      map.set(key, (map.get(key) ?? 0) + (r.total ?? 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [totals.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">ダッシュボード</h2>
        <div className="flex items-center gap-2">
          <PeriodPicker value={range} onChange={setRange} />
          <ExportCsv range={range} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {totals.isLoading && (
          <Card>
            <CardContent>
              <LoadingList />
            </CardContent>
          </Card>
        )}
        {totals.isError && (
          <Card>
            <CardContent>
              <ErrorState message={String(totals.error)} />
            </CardContent>
          </Card>
        )}
        {totals.isSuccess && totalCards.length === 0 && (
          <EmptyState title="データがありません" />
        )}
        {totalCards.map(([name, total]) => (
          <Card key={name}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{name}</span>
                <span className="text-primary">{total}</span>
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>時間帯ヒートマップ</CardTitle>
        </CardHeader>
        <CardContent>
          {heatmap.isLoading ? (
            <LoadingList />
          ) : heatmap.isError ? (
            <ErrorState message={String(heatmap.error)} />
          ) : (
            <Heatmap cells={heatmap.data} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
