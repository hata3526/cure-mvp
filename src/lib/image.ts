/**
 * Normalize an image Blob/File to PNG with optional max dimension.
 * - Resizes so that max(width, height) <= maxSize while keeping aspect ratio
 * - Draws onto a canvas and exports as PNG
 */
export async function normalizeToPng(
  file: Blob,
  opts?: { maxSize?: number; background?: 'transparent' | 'white' }
): Promise<Blob> {
  const maxSize = opts?.maxSize ?? 2000;
  const background = opts?.background ?? 'white';
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const { width, height } = scaleToFit(img.naturalWidth, img.naturalHeight, maxSize);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    if (background === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), 'image/png')
    );
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function scaleToFit(w: number, h: number, maxSize: number): { width: number; height: number } {
  const maxEdge = Math.max(w, h);
  if (maxEdge <= maxSize) return { width: w, height: h };
  const ratio = maxSize / maxEdge;
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

