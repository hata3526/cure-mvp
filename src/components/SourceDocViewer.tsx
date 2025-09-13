import { useMemo } from "react";

export function SourceDocViewer({ url }: { url: string | null }) {
  const ext = useMemo(() => {
    if (!url) return null;
    const u = new URL(url);
    const name = (u.pathname.split("/").pop() || "").toLowerCase();
    if (name.endsWith(".pdf")) return "pdf";
    if (name.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/)) return "image";
    return null;
  }, [url]);

  if (!url) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        原本のファイルURLが見つかりません
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      {ext === "pdf" ? (
        <object data={url} type="application/pdf" className="h-full w-full">
          <iframe src={url} className="h-full w-full" title="source document" />
        </object>
      ) : ext === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="source document" className="max-w-full h-auto" />
      ) : (
        <iframe src={url} className="h-full w-full" title="source document" />
      )}
      <div className="mt-2 text-right">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary underline"
        >
          新しいタブで開く
        </a>
      </div>
    </div>
  );
}

