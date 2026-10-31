import { supabase } from "@/lib/supabase-client";

const BUCKET = "event-banners";

/** Same limits as the bucket (202610300010_event_banners.sql). */
export const EVENT_BANNER_MAX_BYTES = 5 * 1024 * 1024;

const EVENT_BANNER_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** The public URL of a stored banner, or null when the event has none. */
export function eventBannerUrl(bannerPath: string | null): string | null {
  if (!bannerPath) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(bannerPath).data.publicUrl;
}

/**
 * Uploads a banner into the organiser's own folder and sets it on the event,
 * replacing any earlier one. Type and size are checked here before the
 * round trip; the bucket and set_event_banner check them again. Returns the
 * new banner's path.
 */
export async function uploadEventBanner(
  eventId: string,
  organiserId: string,
  file: File,
  previousPath: string | null,
): Promise<string> {
  const extension = EVENT_BANNER_MIME_EXTENSIONS[file.type];
  if (!extension) throw new Error("Upload a JPG, PNG or WebP image.");
  if (file.size > EVENT_BANNER_MAX_BYTES) throw new Error("The image must be smaller than 5MB.");

  const path = `${organiserId}/${crypto.randomUUID()}.${extension}`;
  const stored = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (stored.error) throw new Error("This image could not be uploaded. Try again.");

  const { error } = await supabase.rpc("set_event_banner", { p_event_id: eventId, p_banner_path: path });
  if (error) {
    // Don't leave the unused upload behind.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.code === "42501" ? error.message : "The banner could not be saved. Try again.");
  }

  await removeStoredBanner(previousPath);
  return path;
}

/** Removes the event's banner. */
export async function removeEventBanner(eventId: string, previousPath: string | null) {
  const { error } = await supabase.rpc("set_event_banner", { p_event_id: eventId });
  if (error) {
    throw new Error(error.code === "42501" ? error.message : "The banner could not be removed. Try again.");
  }
  await removeStoredBanner(previousPath);
}

// Best effort: the event no longer points at it, so a leftover file is only
// unused storage, never shown.
async function removeStoredBanner(path: string | null) {
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}
