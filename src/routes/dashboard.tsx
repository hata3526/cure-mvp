import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { PeriodPicker, getPresetRange } from "../components/PeriodPicker";
import { Input } from "../components/ui/input";
import { Heatmap } from "../components/Heatmap";
import { ExportCsv } from "../components/ExportCsv";
import { useHeatmap, useEventsRange } from "../lib/queries";
import type { DateRange } from "../types";

import {
  EmptyState,
  ErrorState,
  LoadingList,
} from "../components/states/AsyncStates";

export default function DashboardRoute() {
  const [range, setRange] = useState<DateRange>(() => getPresetRange("7d"));
  const heatmap = useHeatmap(range);
  const events = useEventsRange(range);

  // 入居者一覧（最新日）
  const { residentsLatest, latestDate } = useMemo(() => {
    const rows = Array.isArray(events.data) ? (events.data as any[]) : [];
    if (!rows.length) return { residentsLatest: [] as Array<{ name: string; urination: number; defecation: number; fluid: number }>, latestDate: "" };
    // 最新日付（文字列比較でOK: YYYY-MM-DD）
    const latest = rows.reduce((acc: string, r: any) => (r.event_date > acc ? r.event_date : acc), rows[0].event_date as string);
    const map = new Map<string, { urination: number; defecation: number; fluid: number }>();
    for (const r of rows) {
      if (r.event_date !== latest) continue;
      const cur = map.get(r.resident_name) ?? { urination: 0, defecation: 0, fluid: 0 };
      if (r.category === "urination") cur.urination += r.count ?? 0;
      else if (r.category === "defecation") cur.defecation += r.count ?? 0;
      else if (r.category === "fluid") cur.fluid += r.count ?? 0;
      map.set(r.resident_name, cur);
    }
    const arr = Array.from(map.entries()).map(([name, v]) => ({ name, ...v }));
    return { residentsLatest: arr, latestDate: latest };
  }, [events.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">ダッシュボード</h2>
        <div className="flex items-center gap-2">
          {/* 単日フィルター */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">日付</label>
            <Input
              type="date"
              value={range.from === range.to ? range.from : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setRange({ from: v, to: v });
              }}
            />
          </div>
          {/* 期間プリセット */}
          <PeriodPicker value={range} onChange={setRange} />
          <ExportCsv range={range} />
        </div>
      </div>

      {/* KPI cards */}
      {/* KPIカードは非表示（不要） */}

      {/* カテゴリ内訳・日次トレンドは非表示（不要） */}

      {/* 入居者一覧（最新） */}
      <Card>
        <CardHeader>
          <CardTitle>入居者一覧（最新日）{latestDate ? `: ${latestDate}` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {residentsLatest.length === 0 ? (
            <EmptyState title="データがありません" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium py-1 pr-2">入居者</th>
                    <th className="text-right font-medium py-1">尿</th>
                    <th className="text-right font-medium py-1">便</th>
                    <th className="text-right font-medium py-1">水分</th>
                  </tr>
                </thead>
                <tbody>
                  {residentsLatest.map((r) => (
                    <tr key={r.name} className="border-t">
                      <td className="py-1 pr-2">
                        <Link to={`/resident?name=${encodeURIComponent(r.name)}`} className="underline text-primary">
                          {r.name}
                        </Link>
                      </td>
                      <td className="text-right py-1">{r.urination || 0}</td>
                      <td className="text-right py-1">{r.defecation || 0}</td>
                      <td className="text-right py-1">{r.fluid || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>時間帯ヒートマップ（0時〜23時）</CardTitle>
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

// (平均表示を廃止したため、補助関数は削除)
