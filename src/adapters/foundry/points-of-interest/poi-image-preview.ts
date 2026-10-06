import { SYSTEM_ID } from "../../../config/system-config";

const PREVIEW_OPTIONS = { width: 480, height: 360, format: "image/webp", quality: 0.85 } as const;
const PREVIEW_CACHE_LIMIT = 16;
const PREVIEW_RETRY_DELAY_MS = 30_000;
interface PreviewCacheEntry {
  readonly promise: Promise<string>;
  retryAfter: number;
}
// Client-local presentation cache shared by POI windows and the Item directory.
const previews = new Map<string, PreviewCacheEntry>();

export function resolvePoiImagePreview(src: string): Promise<string> {
  if (!src || /\.svg(?:[?#]|$)/i.test(src)) return Promise.resolve(src);
  const key = JSON.stringify([src, PREVIEW_OPTIONS]);
  const cached = previews.get(key);
  if (cached && Date.now() < cached.retryAfter) {
    previews.delete(key); previews.set(key, cached);
    return cached.promise;
  }
  previews.delete(key);
  const entry: PreviewCacheEntry = {
    retryAfter: Infinity,
    promise: Promise.resolve().then(async () => {
      const result = await foundry.helpers.media.ImageHelper.createThumbnail(src, PREVIEW_OPTIONS);
      // Installed typings return object; the public v14 API documents thumb or null.
      if (!result || !("thumb" in result) || typeof result.thumb !== "string" || !result.thumb.trim())
        throw new Error("Foundry returned no POI thumbnail");
      return result.thumb;
    }).catch(error => {
      entry.retryAfter = Date.now() + PREVIEW_RETRY_DELAY_MS;
      console.warn(`${SYSTEM_ID} | POI thumbnail unavailable; using original image`, error);
      return src;
    }),
  };
  previews.set(key, entry);
  if (previews.size > PREVIEW_CACHE_LIMIT) {
    const oldest = previews.keys().next().value;
    if (oldest !== undefined) previews.delete(oldest);
  }
  return entry.promise;
}
