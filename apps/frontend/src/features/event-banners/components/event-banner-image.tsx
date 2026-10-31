import { CalendarDays } from "lucide-react";

import { eventBannerUrl } from "@/features/event-banners/services/event-banners";
import { cn } from "@/lib/utils";

/**
 * An event's banner as attendees see it, or a plain placeholder when the
 * organiser hasn't added one, so every card keeps the same shape.
 * Decorative: the title is always shown as text next to it.
 */
export function EventBannerImage({
  bannerPath,
  placeholderLabel,
  className,
}: {
  bannerPath: string | null;
  /** Text on the placeholder, e.g. for the organiser's own preview. */
  placeholderLabel?: string;
  className?: string;
}) {
  const url = eventBannerUrl(bannerPath);
  return (
    <div className={cn("relative aspect-[3/1] w-full overflow-hidden bg-slate-100", className)}>
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <div
          data-testid="event-banner-placeholder"
          className="flex size-full items-center justify-center gap-2 bg-gradient-to-br from-blue-100 via-slate-100 to-indigo-100 px-4 text-slate-500"
        >
          <CalendarDays className="size-5 shrink-0" aria-hidden="true" />
          {placeholderLabel && <span className="truncate text-sm font-semibold">{placeholderLabel}</span>}
        </div>
      )}
    </div>
  );
}
