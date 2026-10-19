import { asRoomLayoutType, type RoomLayoutType } from "@spm/shared";

import auditorium from "@/assets/venue-layouts/auditorium.jpg";
import banquet from "@/assets/venue-layouts/banquet.jpg";
import boardroom from "@/assets/venue-layouts/boardroom.webp";
import classroom from "@/assets/venue-layouts/classroom.avif";
import exhibition from "@/assets/venue-layouts/exhibition.webp";
import openFloor from "@/assets/venue-layouts/open-floor.webp";
import theatre from "@/assets/venue-layouts/theatre.jpg";

const LAYOUT_IMAGES: Record<RoomLayoutType, string> = {
  Theatre: theatre,
  Classroom: classroom,
  Boardroom: boardroom,
  Banquet: banquet,
  "Open Floor": openFloor,
  Auditorium: auditorium,
  Exhibition: exhibition,
};

/**
 * The venue's photo, from its one supported layout. Undefined when the
 * venue has no layout, or it doesn't match a known RoomLayoutType (e.g. a
 * legacy free-text value).
 */
export function getVenueLayoutImage(layouts: string[]): string | undefined {
  for (const layout of layouts) {
    const type = asRoomLayoutType(layout);
    if (type) return LAYOUT_IMAGES[type];
  }
  return undefined;
}
