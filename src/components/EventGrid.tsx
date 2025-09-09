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

  const keys = Array.from(
    new Set(rows.map((r) => `${r.resident_name}｜${r.category}`))
  ).sort();

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
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{keys.length} 行</div>
        <Button onClick={saveAll} disabled={dirty.size === 0}>
          変更を保存 ({dirty.size})
        </Button>
      </div>
      {keys.map((key) => (
        <div
          key={key}
          className="grid grid-cols-[160px_repeat(24,minmax(0,1fr))] items-stretch gap-1"
        >
          <div className="text-sm text-muted-foreground pr-2 flex items-center">
            {key}
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
