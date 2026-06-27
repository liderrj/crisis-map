import { MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION } from '../shared/limits';

export async function compressImage(file: Blob): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);

  for (let quality = 0.8; quality >= 0.3; quality -= 0.1) {
    const blob = await canvasToBlob(canvas, 'image/webp', quality);
    if (blob && blob.size <= MAX_IMAGE_BYTES) return blob;
  }
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.7);
  if (jpeg) return jpeg;
  const fallback = await canvasToBlob(canvas, 'image/webp', 0.5);
  if (!fallback) throw new Error('Could not encode image');
  return fallback;
}

function loadBitmap(file: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img as unknown as ImageBitmap);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
