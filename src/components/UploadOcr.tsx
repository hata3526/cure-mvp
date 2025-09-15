import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useIngest, useParseStructure } from "../lib/queries";
import { supabase } from "../lib/supabase";
import { renderPdfToImages } from "../lib/pdf";
import { normalizeToPng } from "../lib/image";

/** UploadOcr provides buttons for OCR → Parse → Review flow. */
export function UploadOcr({
  onParsed,
  currentSourceDocId,
}: {
  onParsed: (sourceDocId: string) => void;
  currentSourceDocId?: string;
}) {
  const [storagePath, setStoragePath] = useState("images/2025-01-01/sheet.jpg");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ingest = useIngest();
  const parse = useParseStructure();
  // Vision OCR is disabled; always use GPT ingest
  const provider: "gpt" = "gpt";
  // モデルは固定で gpt-4o を使用（UIでの選択は不可）
  const model: "gpt-4o" = "gpt-4o";
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);

  const handleIngest = async () => {
    try {
      await ingest.mutateAsync({ storagePath, provider, model });
    } catch {
      void 0;
    }
  };

  const handlePickAndUpload = async () => {
    const el = fileInputRef.current;
    if (!el) return;
    el.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setPublicUrl(null);
    const bucket = "originals"; // 事前に作成しておく
    const dir = new Date().toISOString().slice(0, 10);

    // If PDF: render each page to image and ingest per page (append)
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      try {
        setUploading(true);
        const blobs = await renderPdfToImages(file, { scale: 2 });
        let createdSourceId: string | undefined = undefined;
        for (let i = 0; i < blobs.length; i++) {
          const blob = blobs[i];
          const pageName = `${crypto.randomUUID()}_p${String(i + 1).padStart(2, "0")}.png`;
          const path = `${dir}/${pageName}`;
          const { error: upErr } = await supabase.storage
            .from(bucket)
            .upload(path, blob, {
              cacheControl: "3600",
              upsert: true,
              contentType: "image/png",
            });
          if (upErr) throw upErr;
          const storagePath = `${bucket}/${path}`;
          // ingest per page; first call creates source_doc_id, subsequent append to same id
          const res = await ingest.mutateAsync({
            storagePath,
            provider: "gpt",
            model,
            sourceDocId: createdSourceId,
            append: !!createdSourceId, // append after first page
          });
          if (!createdSourceId && res?.sourceDocId) {
            createdSourceId = res.sourceDocId;
          }
        }
        setUploading(false);
        if (createdSourceId) {
          onParsed(createdSourceId);
        }
      } catch (err: any) {
        console.error(err);
        setUploading(false);
        setUploadError(err?.message ?? String(err));
      }
      return;
    }

    // Else: normal image → normalize to PNG (resize + PNG export)
    setUploading(true);
    const png = await normalizeToPng(file, { maxSize: 2000, background: "white" });
    const fileName = `${crypto.randomUUID()}.png`;
    const path = `${dir}/${fileName}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, png, {
        cacheControl: "3600",
        upsert: true,
        contentType: "image/png",
      });
    setUploading(false);
    if (error) {
      setUploadError(error.message ?? String(error));
      console.error(error);
      return;
    }
    const fullPath = `${bucket}/${path}`;
    setStoragePath(fullPath);
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (data?.publicUrl) setPublicUrl(data.publicUrl);
  };

  const handleParse = async () => {
    if (!lastSourceDocId()) return;
    try {
      await parse.mutateAsync({ sourceDocId: lastSourceDocId()!, model });
    } catch {
      void 0;
    }
  };

  const lastSourceDocId = () => {
    const data = ingest.data as { sourceDocId?: string } | undefined;
    return data?.sourceDocId || "";
  };

  const handleReview = () => {
    const id = lastSourceDocId() || currentSourceDocId || "";
    if (!id) return;
    onParsed(id);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={onFileChange}
        />
        <div className="flex-1 space-y-1">
          <label className="text-sm text-muted-foreground">
            ストレージパス
          </label>
          <Input
            value={storagePath}
            onChange={(e) => setStoragePath(e.target.value)}
            placeholder="bucket/path/to/file.jpg"
          />
          <div className="text-xs text-muted-foreground">
            「ファイル選択」でローカルからアップロード可（バケット: originals）
          </div>
          {uploading && (
            <div className="text-xs text-muted-foreground">
              アップロード中...
            </div>
          )}
          {uploadError && (
            <div role="alert" className="text-xs text-destructive-foreground">
              アップロード失敗: {uploadError}
            </div>
          )}
          {publicUrl && (
            <div className="text-xs text-muted-foreground">
              アップロード完了:{" "}
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                プレビュー
              </a>
            </div>
          )}
        </div>
        <Button variant="outline" onClick={handlePickAndUpload}>
          ファイル選択
        </Button>
        {/* モデル選択は非表示（gpt-4o固定） */}
        <Button onClick={handleIngest} disabled={ingest.isPending || !storagePath.includes("/")}>
          {ingest.isPending ? "取り込み中..." : "取り込み+解析"}
        </Button>
        {/* Vision専用の解析ボタンは非表示 */}
        <Button
          onClick={handleReview}
          disabled={!(lastSourceDocId() || currentSourceDocId)}
        >
          レビュー
        </Button>
      </div>

      {ingest.isSuccess && lastSourceDocId() && (
        <div className="text-xs text-muted-foreground">
          取り込み完了: sourceDocId = {lastSourceDocId()}
        </div>
      )}
      {ingest.isError && (
        <div role="alert" className="text-xs text-destructive-foreground">
          OCR取り込み失敗: {String(ingest.error)}
        </div>
      )}
      {parse.isSuccess && (
        <div className="text-xs text-muted-foreground">
          解析完了:{" "}
          {(parse.data as { inserted?: number } | undefined)?.inserted ?? 0}
          件挿入
        </div>
      )}
      {parse.isError && (
        <div role="alert" className="text-xs text-destructive-foreground">
          解析失敗: {String(parse.error)}
        </div>
      )}
    </div>
  );
}
