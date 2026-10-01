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
 * A representative photo for the card, picked from the venue's first listed
 * layout — venues can support several layouts, but the card only has room
 * for one image. Undefined when the venue has no layouts, or none of them
 * match a known RoomLayoutType (e.g. legacy free-text values).
 */
export function getVenueLayoutImage(layouts: string[]): string | undefined {
  for (const layout of layouts) {
    const type = asRoomLayoutType(layout);
    if (type) return LAYOUT_IMAGES[type];
  }
  return undefined;
}
