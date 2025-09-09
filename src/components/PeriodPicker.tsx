import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import type { DateRange } from "../types";

export type Preset = "today" | "7d" | "30d" | "custom";

export function getPresetRange(preset: Exclude<Preset, "custom">): DateRange {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const d = new Date(now);
  if (preset === "today") {
    return { from: to, to };
  }
  if (preset === "7d") {
    d.setDate(d.getDate() - 6);
  } else if (preset === "30d") {
    d.setDate(d.getDate() - 29);
  }
  const from = d.toISOString().slice(0, 10);
  return { from, to };
}

export function PeriodPicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
}) {
  const preset = useMemo<Preset>(() => {
    const today = getPresetRange("today");
    const seven = getPresetRange("7d");
    const thirty = getPresetRange("30d");
    if (value.from === today.from && value.to === today.to) return "today";
    if (value.from === seven.from && value.to === seven.to) return "7d";
    if (value.from === thirty.from && value.to === thirty.to) return "30d";
    return "custom";
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={preset}
        onValueChange={(v) => {
          if (v === "custom") return;
          onChange(getPresetRange(v as Exclude<Preset, "custom">));
        }}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="期間" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">今日</SelectItem>
          <SelectItem value="7d">過去7日</SelectItem>
          <SelectItem value="30d">過去30日</SelectItem>
          <SelectItem value="custom" disabled>
            カスタム
          </SelectItem>
        </SelectContent>
      </Select>
      {/* MVPではカスタム日付は未対応 */}
      <span className="text-sm text-muted-foreground">
        現在: {value.from} → {value.to}
      </span>
    </div>
  );
}
