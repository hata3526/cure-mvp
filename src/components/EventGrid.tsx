import { useMemo, useState } from "react";
import type { CareEvent } from "../types";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ChevronDown, ChevronUp } from "lucide-react";

type Editable = Pick<CareEvent, "count" | "guided" | "incontinence" | "value">;

/**
 * EventGrid renders resident×category rows with 24 hour columns.
 * Each cell opens a dialog to edit values. Save calls onSave with diff rows.
 */
export function EventGrid({
  rows,
  onSave,
}: {
  rows: CareEvent[];
  onSave: (changed: CareEvent[]) => Promise<void> | void;
}) {
  const index = useMemo(() => buildIndex(rows), [rows]);
  const [editing, setEditing] = useState<{
    key: string;
    hour: number;
    values: Editable;
  } | null>(null);
  const [dirty, setDirty] = useState<Map<string, CareEvent>>(new Map());
  const [nameFilter, setNameFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | CareEvent["category"]
  >("all");
  const [sortBy, setSortBy] = useState<"name" | "total">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const allKeys = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => `${r.resident_name}｜${r.category}`))
      ),
    [rows]
  );

  const filteredKeys = useMemo(() => {
    const nameLower = nameFilter.trim().toLowerCase();
    return allKeys.filter((key) => {
      const [resident_name, cat] = key.split("｜");
      const okName = nameLower
        ? resident_name.toLowerCase().includes(nameLower)
        : true;
      const okCat =
        categoryFilter === "all" ? true : (cat as CareEvent["category"]) === categoryFilter;
      return okName && okCat;
    });
  }, [allKeys, nameFilter, categoryFilter]);

  const keys = useMemo(() => {
    const arr = [...filteredKeys];
    arr.sort((a, b) => {
      if (sortBy === "name") {
        const an = a.split("｜")[0];
        const bn = b.split("｜")[0];
        return sortDir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
      }
      const ta = getRowTotal(index, a);
      const tb = getRowTotal(index, b);
      return sortDir === "asc" ? ta - tb : tb - ta;
    });
    return arr;
  }, [filteredKeys, sortBy, sortDir, index]);

  const openEdit = (key: string, hour: number) => {
    const base = index.get(key)?.get(hour);
    setEditing({
      key,
      hour,
      values: {
        count: base?.count ?? 0,
        guided: base?.guided ?? false,
        incontinence: base?.incontinence ?? false,
        value: base?.value ?? null,
      },
    });
  };

  const commit = async () => {
    if (!editing) return;
    const [resident_name, category] = editing.key.split("｜");
    const base = index.get(editing.key)?.get(editing.hour);
    const merged: CareEvent = {
      source_doc_id: base?.source_doc_id ?? rows[0]?.source_doc_id ?? "manual",
      resident_name,
      event_date: base?.event_date ?? new Date().toISOString().slice(0, 10),
      hour: editing.hour,
      category: category as CareEvent["category"],
      count: editing.values.count,
      guided: editing.values.guided,
      incontinence: editing.values.incontinence,
      value: editing.values.value ?? null,
    };
    const id = `${merged.resident_name}:${merged.category}:${merged.event_date}:${merged.hour}`;
    const newDirty = new Map(dirty);
    newDirty.set(id, merged);
    setDirty(newDirty);
    setEditing(null);
  };

  const saveAll = async () => {
    const changed = Array.from(dirty.values());
    await onSave(changed);
    setDirty(new Map());
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground">{keys.length} 行</div>
          <div className="hidden md:block h-4 w-px bg-border" />
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">名前を検索</span>
            <Input
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="名前を検索"
              className="h-9 w-48"
            />
          </label>
          <Select
            value={categoryFilter}
            onValueChange={(v) =>
              setCategoryFilter((v as any) as "all" | CareEvent["category"]) }
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="カテゴリ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのカテゴリ</SelectItem>
              <SelectItem value="urination">排尿</SelectItem>
              <SelectItem value="defecation">排便</SelectItem>
              <SelectItem value="fluid">水分</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setNameFilter("");
              setCategoryFilter("all");
            }}
          >
            フィルターをクリア
          </Button>
          <Button onClick={saveAll} disabled={dirty.size === 0}>
            変更を保存 ({dirty.size})
          </Button>
        </div>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[160px_64px_repeat(24,minmax(0,1fr))] items-center gap-1 sticky top-0 z-10 bg-background py-1">
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground text-left pr-2 flex items-center gap-1"
          aria-label="名前でソート"
          onClick={() => {
            setSortBy("name");
            setSortDir((d) => (sortBy === "name" ? (d === "asc" ? "desc" : "asc") : d));
          }}
        >
          名前
          {sortBy === "name" && (sortDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
        </button>
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground text-left pr-2 flex items-center gap-1"
          aria-label="合計でソート"
          onClick={() => {
            setSortBy("total");
            setSortDir((d) => (sortBy === "total" ? (d === "asc" ? "desc" : "asc") : d));
          }}
        >
          合計
          {sortBy === "total" && (sortDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
        </button>
        {Array.from({ length: 24 }).map((_, h) => (
          <div key={h} className="text-xs font-medium text-muted-foreground text-center">
            {h}
          </div>
        ))}
      </div>
      {keys.map((key) => (
        <div
          key={key}
          className="grid grid-cols-[160px_64px_repeat(24,minmax(0,1fr))] items-stretch gap-1"
        >
          <div className="text-sm text-muted-foreground pr-2 flex items-center">
            {key}
          </div>
          <div className="h-8 rounded-sm bg-muted text-[11px] flex items-center justify-center">
            {getRowTotal(index, key) || ""}
          </div>
          {Array.from({ length: 24 }).map((_, h) => {
            const base = index.get(key)?.get(h);
            const total = base?.count ?? 0;
            return (
              <Dialog key={h}>
                <DialogTrigger asChild>
                  <button
                    className="h-8 rounded-sm bg-muted text-[11px] hover:opacity-80"
                    onClick={() => openEdit(key, h)}
                  >
                    {total || ""}
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      編集 {key} @{h}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <label className="space-y-1">
                      <span className="text-sm">回数</span>
                      <Input
                        type="number"
                        min={0}
                        value={editing?.values.count ?? 0}
                        onChange={(e) =>
                          editing &&
                          setEditing({
                            ...editing,
                            values: {
                              ...editing.values,
                              count: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={editing?.values.guided ?? false}
                        onCheckedChange={(v) =>
                          editing &&
                          setEditing({
                            ...editing,
                            values: { ...editing.values, guided: Boolean(v) },
                          })
                        }
                      />
                      介助あり
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={editing?.values.incontinence ?? false}
                        onCheckedChange={(v) =>
                          editing &&
                          setEditing({
                            ...editing,
                            values: {
                              ...editing.values,
                              incontinence: Boolean(v),
                            },
                          })
                        }
                      />
                      失禁
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm">メモ</span>
                      <Input
                        value={editing?.values.value ?? ""}
                        onChange={(e) =>
                          editing &&
                          setEditing({
                            ...editing,
                            values: {
                              ...editing.values,
                              value: e.target.value,
                            },
                          })
                        }
                        placeholder="Optional note"
                      />
                    </label>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setEditing(null)}>
                        キャンセル
                      </Button>
                      <Button onClick={commit}>適用</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function buildIndex(rows: CareEvent[]) {
  const index = new Map<string, Map<number, CareEvent>>();
  for (const r of rows) {
    const key = `${r.resident_name}｜${r.category}`;
    const row = index.get(key) ?? new Map<number, CareEvent>();
    row.set(r.hour, r);
    index.set(key, row);
  }
  return index;
}

function getRowTotal(index: Map<string, Map<number, CareEvent>>, key: string) {
  const row = index.get(key);
  if (!row) return 0;
  let total = 0;
  for (const v of row.values()) total += v.count ?? 0;
  return total;
}
