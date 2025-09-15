import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Input } from "../components/ui/input";
import { useResidents, useResidentEvents } from "../lib/queries";
import type { CareEvent, DateRange, HeatCell, Resident } from "../types";
import { Heatmap } from "../components/Heatmap";
import { EmptyState, ErrorState, LoadingList } from "../components/states/AsyncStates";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function singleDayRange(d: string): DateRange {
  return { from: d, to: d };
}

export default function ResidentRoute() {
  const residents = useResidents();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nameFromQuery = params.get("name") || undefined;

  const [selectedName, setSelectedName] = useState<string | undefined>(nameFromQuery);
  const [date, setDate] = useState<string>(todayISO());

  useEffect(() => {
    if (!selectedName && residents.data && residents.data.length > 0) {
      setSelectedName(residents.data[0].full_name);
    }
  }, [residents.data, selectedName]);

  useEffect(() => {
    if (nameFromQuery) setSelectedName(nameFromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameFromQuery]);

  const range = useMemo(() => singleDayRange(date), [date]);
  const ev = useResidentEvents(selectedName, range);

  const cells = useMemo<HeatCell[]>(() => buildHeatCells(selectedName, ev.data ?? []), [selectedName, ev.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">入居者詳細</h2>
        <div className="flex items-center gap-3">
          <div className="w-56">
            <Select
              value={selectedName ?? ""}
              onValueChange={(v) => setSelectedName(v)}
              disabled={residents.isLoading || !!residents.error}
            >
              <SelectTrigger>
                <SelectValue placeholder="入居者選択" />
              </SelectTrigger>
              <SelectContent>
                {(residents.data ?? []).map((r: Resident) => (
                  <SelectItem key={r.id} value={r.full_name}>
                    {r.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">日付</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>時間帯ヒートマップ（0時〜23時）</CardTitle>
        </CardHeader>
        <CardContent>
          {ev.isLoading ? (
            <LoadingList />
          ) : ev.isError ? (
            <ErrorState message={String(ev.error)} />
          ) : cells.length === 0 ? (
            <EmptyState title="データがありません" />
          ) : (
            <Heatmap cells={cells} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>詳細一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {ev.isLoading ? (
            <LoadingList />
          ) : ev.isError ? (
            <ErrorState message={String(ev.error)} />
          ) : (ev.data ?? []).length === 0 ? (
            <EmptyState title="データがありません" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium py-1">時刻</th>
                    <th className="text-left font-medium py-1">種類</th>
                    <th className="text-right font-medium py-1">値</th>
                    <th className="text-center font-medium py-1">指導</th>
                    <th className="text-center font-medium py-1">失禁</th>
                    <th className="text-left font-medium py-1">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {(ev.data ?? []).map((r, i) => (
                    <tr key={`${r.event_date}-${r.hour}-${r.category}-${i}`} className="border-t">
                      <td className="py-1">{r.hour}時</td>
                      <td className="py-1">{labelOf(r.category)}</td>
                      <td className="py-1 text-right">{r.count}</td>
                      <td className="py-1 text-center">{r.guided ? "✓" : ""}</td>
                      <td className="py-1 text-center">{r.incontinence ? "△" : ""}</td>
                      <td className="py-1">{r.value ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function buildHeatCells(name: string | undefined, events: CareEvent[]): HeatCell[] {
  if (!name) return [];
  const cats: Array<CareEvent["category"]> = ["defecation", "urination", "fluid"];
  const map = new Map<string, HeatCell>();
  for (const cat of cats) {
    for (let h = 0; h < 24; h++) {
      map.set(`${cat}:${h}`, {
        resident_name: name,
        category: cat,
        hour: h,
        total: 0,
        any_guided: false,
        any_incont: false,
      });
    }
  }
  for (const e of events) {
    const key = `${e.category}:${e.hour}`;
    const cur = map.get(key);
    if (!cur) continue;
    cur.total += e.count ?? 0;
    cur.any_guided = cur.any_guided || !!e.guided;
    cur.any_incont = cur.any_incont || !!e.incontinence;
    map.set(key, cur);
  }
  return Array.from(map.values());
}

function labelOf(cat: CareEvent["category"]) {
  switch (cat) {
    case "urination":
      return "尿";
    case "defecation":
      return "便";
    case "fluid":
      return "水分";
    default:
      return cat;
  }
}

