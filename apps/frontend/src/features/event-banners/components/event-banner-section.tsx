import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { EventBannerImage } from "@/features/event-banners/components/event-banner-image";
import { removeEventBanner, uploadEventBanner } from "@/features/event-banners/services/event-banners";

/**
 * The organiser's optional event banner, shown to attendees. Only the
 * event's own organiser sees this section; they can add, replace or remove
 * the banner at any stage.
 */
export function EventBannerSection({
  eventId,
  organiserId,
  bannerPath,
  onChanged,
}: {
  eventId: string;
  organiserId: string;
  bannerPath: string | null;
  onChanged: (bannerPath: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(undefined);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    await run(async () => {
      onChanged(await uploadEventBanner(eventId, organiserId, file, bannerPath));
    });
  }

  async function handleRemove() {
    await run(async () => {
      await removeEventBanner(eventId, bannerPath);
      onChanged(null);
    });
  }

  return (
    <section aria-label="Event banner" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Event banner</h2>
      <p className="mt-1 text-sm text-slate-600">
        Optional. Attendees see it when browsing and registering for your event.
      </p>
      <EventBannerImage bannerPath={bannerPath} placeholderLabel="No banner yet" className="mt-4 rounded-xl" />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* The browser's own file picker is hidden; the button opens it. */}
        <input
          ref={fileInput}
          type="file"
          aria-label="Choose a banner image"
          aria-hidden="true"
          tabIndex={-1}
          accept=".jpg,.jpeg,.png,.webp"
          disabled={busy}
          onChange={handleFile}
          className="sr-only"
        />
        <Button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
          <ImagePlus /> {busy ? "Working…" : bannerPath ? "Replace banner" : "Upload banner"}
        </Button>
        {bannerPath && (
          <Button type="button" variant="outline" disabled={busy} onClick={handleRemove}>
            Remove
          </Button>
        )}
        <p className="text-xs text-slate-500">JPG, PNG or WebP, up to 5 MB. Shown as a wide banner.</p>
      </div>
      {message && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {message}
        </p>
      )}
    </section>
  );
}
