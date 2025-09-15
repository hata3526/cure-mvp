import type { HeatCell } from "../types";

/**
 * Heatmap renders a 24-hour grid per resident×category.
 * It is resilient to empty data.
 */
export function Heatmap({ cells }: { cells: HeatCell[] | undefined }) {
  const grouped = new Map<string, HeatCell[]>();
  for (const c of cells ?? []) {
    const key = `${c.resident_name}｜${c.category}`;
    const arr =
      grouped.get(key) ??
      Array.from({ length: 24 }, (_, hour) => ({
        resident_name: c.resident_name,
        category: c.category,
        hour,
        total: 0,
        any_guided: false,
        any_incont: false,
      }));
    arr[c.hour] = c;
    grouped.set(key, arr);
  }

  const entries = Array.from(grouped.entries());
  if (entries.length === 0)
    return <div className="text-sm text-muted-foreground">No data</div>;

  return (
    <div className="space-y-4">
      {/* Hour header 0..23 */}
      <div className="grid grid-cols-[160px_repeat(24,minmax(0,1fr))] items-stretch gap-1">
        <div className="text-xs text-muted-foreground pr-2 flex items-center justify-start">
          時刻
        </div>
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            className="h-5 text-center text-[10px] leading-5 text-muted-foreground"
          >
            {h}
          </div>
        ))}
      </div>
      {entries.map(([key, row]) => (
        <div
          key={key}
          className="grid grid-cols-[160px_repeat(24,minmax(0,1fr))] items-stretch gap-1"
        >
          <div className="text-sm text-muted-foreground pr-2 flex items-center">
            {row && row.length
              ? `${row[0].resident_name}｜${labelOf(row[0].category)}`
              : key}
          </div>
          {row.map((cell, i) => (
            <div
              key={i}
              className="h-6 rounded-sm text-center text-[10px] leading-6"
              style={{
                backgroundColor: intensity(cell.total),
                color:
                  cell.total > 4 ? "hsl(var(--primary-foreground))" : "inherit",
              }}
              title={`${cell.total} @ ${cell.hour}`}
            >
              {cell.total || ""}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function intensity(v: number) {
  const clamped = Math.max(0, Math.min(8, v));
  const alpha = clamped / 8; // 0..1
  // Use CSS variables for color to keep consistent with design tokens.
  // Base color is primary; we render as semi-transparent overlay per intensity.
  return `hsla(var(--primary) / ${alpha})`;
}

function labelOf(cat: HeatCell["category"]) {
  switch (cat) {
    case "urination":
      return "排尿";
    case "defecation":
      return "排便";
    case "fluid":
      return "水分";
    default:
      return String(cat);
  }
}
