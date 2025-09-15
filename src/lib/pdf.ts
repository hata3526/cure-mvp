// Lightweight PDF -> image renderer using pdfjs-dist over CDN worker
// Renders each page to a PNG Blob suitable for upload.

// We intentionally import the main module and set workerSrc to a CDN to avoid bundler worker setup.
// If you prefer local worker bundling, swap to pdfjs-dist/legacy build and configure Vite worker.
// Use ESM entry; we set workerSrc to CDN so bundler worker config isn't needed
// Prefer explicit ESM build path for Vite/TS resolution
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - pdfjs-dist publishes types but subpath may not be typed
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/build/pdf";

// Configure worker from CDN (version pinned for stability)
GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

export async function renderPdfToImages(
  file: Blob,
  opts?: { scale?: number; mime?: string }
): Promise<Blob[]> {
  const scale = opts?.scale ?? 2; // ~2x for decent clarity
  const mime = opts?.mime ?? "image/png";
  const ab = await file.arrayBuffer();
  const loadingTask = getDocument({ data: ab } as any);
  const pdf = await loadingTask.promise;
  const out: Blob[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), mime)
    );
    out.push(blob);
  }
  try {
    await pdf.destroy?.();
  } catch {
    // ignore
  }
  return out;
}
