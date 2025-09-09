import type { DateRange } from "../types";
import { Button } from "./ui/button";
import { supabase } from "../lib/supabase";

/**
 * ExportCsv downloads the current filtered dataset as CSV via simple client aggregation.
 */
export function ExportCsv({ range }: { range: DateRange }) {
  const onExport = async () => {
    const rows = await fetchCsv(range);
    const csv = toCsv(rows);
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `care-events_${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button size="sm" onClick={onExport}>
      CSV書き出し
    </Button>
  );
}

type Raw = {
  resident_name: string;
  category: string;
  hour: number;
  count: number;
  event_date: string;
};

async function fetchCsv(range: DateRange): Promise<Raw[]> {
  const { data, error } = await supabase
    .from("care_events")
    .select("resident_name,category,hour,count,event_date")
    .gte("event_date", range.from)
    .lte("event_date", range.to);
  if (error) throw error;
  return (data ?? []) as Raw[];
}

function toCsv(rows: Raw[]): string {
  const header = ["resident_name", "category", "hour", "count", "event_date"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.resident_name,
        r.category,
        String(r.hour),
        String(r.count),
        r.event_date,
      ].join(",")
    );
  }
  return lines.join("\n");
}
