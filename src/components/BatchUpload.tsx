import { useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type Provider = "vision" | "gpt";
type Model = "gpt-5-mini" | "gpt-5" | "gpt-5-nano" | "gpt-4o" | "gpt-4o-mini";

type Item = {
  id: string;
  file: File;
  name: string;
  size: number;
  status:
    | "queued"
    | "uploading"
    | "uploaded"
    | "ingesting"
    | "parsing"
    | "done"
    | "error";
  error?: string;
  storagePath?: string; // bucket/path
  publicUrl?: string;
  sourceDocId?: string;
  inserted?: number;
};

export function BatchUpload({
  onSelectSourceDoc,
}: {
  onSelectSourceDoc: (sourceDocId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [provider, setProvider] = useState<Provider>("vision");
  const [model, setModel] = useState<Model>("gpt-4o");
  const [isRunning, setIsRunning] = useState(false);

  const totals = useMemo(() => {
    const done = items.filter((i) => i.status === "done").length;
    const err = items.filter((i) => i.status === "error").length;
    return { count: items.length, done, err };
  }, [items]);

  const pickFiles = () => fileInputRef.current?.click();

  const onFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const next: Item[] = files.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      name: f.name,
      size: f.size,
      status: "queued",
    }));
    setItems((prev) => [...prev, ...next]);
    // reset input so selecting same files again re-triggers
    e.currentTarget.value = "";
  };

  const runAll = async () => {
    setIsRunning(true);
    try {
      for (const item of items) {
        if (item.status !== "queued") continue;
        await processOne(item.id);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const processOne = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    updateItem(id, { status: "uploading", error: undefined });
    // 1) upload to storage
    const bucket = "originals";
    const dir = new Date().toISOString().slice(0, 10);
    const fileName = `${crypto.randomUUID()}_${item.file.name}`;
    const path = `${dir}/${fileName}`;
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, item.file, {
        cacheControl: "3600",
        upsert: true,
        contentType: item.file.type || "application/pdf",
      });
    if (upErr) {
      updateItem(id, { status: "error", error: upErr.message });
      return;
    }
    const fullPath = `${bucket}/${path}`;
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    updateItem(id, {
      status: "uploaded",
      storagePath: fullPath,
      publicUrl: urlData?.publicUrl,
    });

    // 2) ingest (and maybe parse)
    updateItem(id, { status: "ingesting" });
    const fn = provider === "gpt" ? "ingest-gpt" : "ingest-ocr";
    const { data: ingData, error: ingErr } = await supabase.functions.invoke(
      fn,
      {
        body: {
          storagePath: fullPath,
          model,
        },
      }
    );
    if (ingErr) {
      updateItem(id, { status: "error", error: String(ingErr) });
      return;
    }
    const sourceDocId = (ingData as any)?.sourceDocId as string | undefined;
    const inserted = (ingData as any)?.inserted as number | undefined;

    if (provider === "vision") {
      // 3) parse-structure for OCR flow
      updateItem(id, { status: "parsing" });
      const { data: pData, error: pErr } = await supabase.functions.invoke(
        "parse-structure",
        {
          body: { sourceDocId, model },
        }
      );
      if (pErr) {
        updateItem(id, { status: "error", error: String(pErr) });
        return;
      }
      updateItem(id, {
        status: "done",
        sourceDocId: sourceDocId,
        inserted: (pData as any)?.inserted,
      });
    } else {
      // GPT flow already extracted
      updateItem(id, { status: "done", sourceDocId, inserted });
    }
  };

  const updateItem = (id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const clearAll = () => setItems([]);

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        onChange={onFilesChosen}
        className="hidden"
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">プロバイダ</label>
          <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vision">Google Vision OCR</SelectItem>
              <SelectItem value="gpt">GPT Vision (抽出まで)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">GTPモデル</label>
          <Select value={model} onValueChange={(v) => setModel(v as Model)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="モデル選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-5-mini">gpt-5-mini</SelectItem>
              <SelectItem value="gpt-5">gpt-5</SelectItem>
              <SelectItem value="gpt-5-nano">gpt-5-nano</SelectItem>
              <SelectItem value="gpt-4o">gpt-4o</SelectItem>
              <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={pickFiles}>PDFを選択</Button>
        <Button onClick={runAll} disabled={isRunning || items.length === 0}>
          {isRunning ? "取り込み中..." : "取り込み開始"}
        </Button>
        <Button variant="ghost" onClick={clearAll} disabled={items.length === 0}>
          クリア
        </Button>
        <div className="text-sm text-muted-foreground">
          {totals.count} 件中 {totals.done} 件完了
          {totals.err > 0 ? ` / 失敗 ${totals.err}` : ""}
        </div>
      </div>

      <div className="rounded-md border">
        <div className="grid grid-cols-[1fr_140px_160px_100px_120px_120px] gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
          <div>ファイル名</div>
          <div>サイズ</div>
          <div>状態</div>
          <div>件数</div>
          <div>プレビュー</div>
          <div>操作</div>
        </div>
        {items.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">ファイルを選択してください（PDF 複数可）</div>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              className="grid grid-cols-[1fr_140px_160px_100px_120px_120px] items-center gap-2 border-b px-3 py-2 text-sm"
            >
              <div className="truncate" title={it.name}>{it.name}</div>
              <div>{Math.ceil(it.size / 1024)} KB</div>
              <div>
                {it.status === "queued" && "待機中"}
                {it.status === "uploading" && "アップロード中"}
                {it.status === "uploaded" && "アップロード完了"}
                {it.status === "ingesting" && "取り込み中"}
                {it.status === "parsing" && "解析中"}
                {it.status === "done" && <span className="text-green-600">完了</span>}
                {it.status === "error" && (
                  <span className="text-red-600">失敗: {it.error}</span>
                )}
              </div>
              <div>{it.inserted ?? "-"}</div>
              <div>
                {it.publicUrl ? (
                  <a
                    href={it.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    開く
                  </a>
                ) : (
                  "-"
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!it.sourceDocId || it.status !== "done"}
                  onClick={() => it.sourceDocId && onSelectSourceDoc(it.sourceDocId)}
                >
                  データを見る
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isRunning || it.status !== "queued"}
                  onClick={() => processOne(it.id)}
                >
                  個別実行
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        ・アップロード先バケット: originals（自動作成はされません）
        <br />・GPTを選択すると取り込みと解析が同時に行われます
      </div>
    </div>
  );
}
