/**
 * Client-side image optimizer.
 *
 * Converts any uploaded image (JPEG/PNG/HEIC-as-blob/etc.) into a downscaled
 * WebP blob. Keeps file size and decode time small without bouncing through
 * an edge function.
 *
 * Usage:
 *   const blob = await optimizeToWebP(file, { maxWidth: 1080, quality: 0.82 });
 *   await supabase.storage.from(bucket).upload(path, blob, { contentType: "image/webp" });
 */
export interface OptimizeOptions {
  /** Hard cap on output width in pixels. Height scales proportionally. */
  maxWidth?: number;
  /** WebP quality 0..1 (default 0.82 — visually identical, ~30% smaller than JPEG q90). */
  quality?: number;
}

export async function optimizeToWebP(
  file: File | Blob,
  opts: OptimizeOptions = {}
): Promise<Blob> {
  const { maxWidth = 1080, quality = 0.82 } = opts;

  const bitmap = await createImageBitmap(file).catch(async () => {
    // Safari fallback: createImageBitmap can fail on HEIC/some PNGs
    const url = URL.createObjectURL(file);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    } finally {
      // revoke after draw (caller below)
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });

  const srcW = (bitmap as ImageBitmap).width || (bitmap as HTMLImageElement).naturalWidth;
  const srcH = (bitmap as ImageBitmap).height || (bitmap as HTMLImageElement).naturalHeight;
  const scale = Math.min(1, maxWidth / srcW);
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("WebP encode failed"))),
      "image/webp",
      quality
    );
  });
}
