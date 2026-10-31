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
 * Uploads a banner image into the organiser's own folder without attaching
 * it to an event yet — for a new event, which has no id until its first
 * save (attach it then with setEventBanner). Type and size are checked here
 * before the round trip; the bucket checks them again. Returns its path.
 */
export async function uploadBannerFile(organiserId: string, file: File): Promise<string> {
  const extension = EVENT_BANNER_MIME_EXTENSIONS[file.type];
  if (!extension) throw new Error("Upload a JPG, PNG or WebP image.");
  if (file.size > EVENT_BANNER_MAX_BYTES) throw new Error("The image must be smaller than 5MB.");

  const path = `${organiserId}/${crypto.randomUUID()}.${extension}`;
  const stored = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (stored.error) throw new Error("This image could not be uploaded. Try again.");
  return path;
}

/** Points the event at an uploaded banner (or, with null, at none). */
export async function setEventBanner(eventId: string, bannerPath: string | null) {
  const { error } = await supabase.rpc(
    "set_event_banner",
    bannerPath ? { p_event_id: eventId, p_banner_path: bannerPath } : { p_event_id: eventId },
  );
  if (error) {
    throw new Error(error.code === "42501" ? error.message : "The banner could not be saved. Try again.");
  }
}

/**
 * Uploads a banner and sets it on the event, replacing any earlier one.
 * Returns the new banner's path.
 */
export async function uploadEventBanner(
  eventId: string,
  organiserId: string,
  file: File,
  previousPath: string | null,
): Promise<string> {
  const path = await uploadBannerFile(organiserId, file);
  try {
    await setEventBanner(eventId, path);
  } catch (error) {
    // Don't leave the unused upload behind.
    await discardBannerFile(path);
    throw error;
  }

  await discardBannerFile(previousPath);
  return path;
}

/** Removes the event's banner. */
export async function removeEventBanner(eventId: string, previousPath: string | null) {
  const { error } = await supabase.rpc("set_event_banner", { p_event_id: eventId });
  if (error) {
    throw new Error(error.code === "42501" ? error.message : "The banner could not be removed. Try again.");
  }
  await discardBannerFile(previousPath);
}

/**
 * Deletes an uploaded banner file no event points at. Best effort: a
 * leftover file is only unused storage, never shown.
 */
export async function discardBannerFile(path: string | null) {
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}
