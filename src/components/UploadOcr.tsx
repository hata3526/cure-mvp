import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useIngestOcr, useParseStructure } from "../lib/queries";
import { supabase } from "../lib/supabase";

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
  const ingest = useIngestOcr();
  const parse = useParseStructure();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);

  const handleIngest = async () => {
    try {
      await ingest.mutateAsync({ storagePath });
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
    const bucket = "originals"; // 事前に作成しておく
    const dir = new Date().toISOString().slice(0, 10);
    const fileName = `${crypto.randomUUID()}_${file.name}`;
    const path = `${dir}/${fileName}`;
    setUploading(true);
    setUploadError(null);
    setPublicUrl(null);
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
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
      await parse.mutateAsync({ sourceDocId: lastSourceDocId()! });
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
        <Button
          onClick={handleIngest}
          disabled={ingest.isPending || !storagePath.includes("/")}
        >
          {ingest.isPending ? "取り込み中..." : "OCR取り込み"}
        </Button>
        <Button
          onClick={handleParse}
          disabled={parse.isPending || !lastSourceDocId()}
          variant="secondary"
        >
          {parse.isPending ? "解析中..." : "解析"}
        </Button>
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
