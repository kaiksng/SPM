import { Building2 } from "lucide-react";

import { getVenueLayoutImage } from "@/features/venues/utils/venue-layout-image";

/**
 * The one venue picture used wherever a venue appears on a request: a photo
 * for the venue's first recognised layout, or a building icon when it has
 * none. Decorative (the venue's name is always beside it), and hidden on the
 * narrowest screens to leave room for the text.
 */
export function VenueThumbnail({ layouts }: { layouts: string[] }) {
  const image = getVenueLayoutImage(layouts);

  return image ? (
    <img
      src={image}
      alt=""
      aria-hidden="true"
      data-testid="venue-thumbnail"
      className="hidden size-20 shrink-0 rounded-xl object-cover sm:block"
    />
  ) : (
    <div
      data-testid="venue-thumbnail"
      className="hidden size-20 shrink-0 place-items-center rounded-xl bg-accent sm:grid"
    >
      <Building2 className="size-6 text-primary" aria-hidden="true" />
    </div>
  );
}
