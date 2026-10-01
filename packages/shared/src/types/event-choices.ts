export const EVENT_PURPOSE_OPTIONS = [
  "Birthday Party", "Party", "Wedding", "Solemnisation", "Baby Shower",
  "Anniversary", "Graduation Party", "Meeting", "Corporate Seminar",
  "Conference", "Workshop", "Training", "Team Bonding", "Networking",
  "Product Launch", "Office Party", "Company Dinner and Dance",
  "Business Dinner", "Business Reception", "Corporate Retreat",
] as const;

export const LOCATION_AREAS = [
  "Central Area", "North", "East", "West", "South", "Alexandra", "Ang Mo Kio",
  "Balestier", "Beach Road", "Beauty World", "Bendemeer", "Boon Keng",
  "Boon Lay", "Bras Basah", "Bugis", "Bukit Timah", "Buona Vista", "Changi",
  "Chinatown", "City Hall", "Clarke Quay", "Clementi", "Dempsey",
  "Dhoby Ghaut", "Esplanade", "Farrer Park", "Fort Canning", "Geylang",
  "HarbourFront", "Havelock", "Holland Village", "Jalan Besar", "Joo Chiat",
  "Jurong West", "Kallang", "Kampong Glam", "Katong", "Keppel Bay",
  "King Albert Park", "Lavender", "Little India", "Marina Bay", "Marine Parade",
  "Mount Faber", "Mountbatten", "Newton", "Orchard", "Outram", "Paya Lebar",
  "Pioneer", "Promenade", "Queenstown", "Raffles Place", "River Valley",
  "Robertson Quay", "Sentosa", "Shenton Way", "Somerset", "Tai Seng",
  "Tampines", "Tanjong Pagar", "Telok Ayer", "Tiong Bahru", "Toa Payoh",
  "Tuas", "West Coast", "Yishun",
] as const;

export const VENUE_AMENITIES = [
  "Swimming pool", "Gym", "Parking", "Pantry", "Kitchen", "Restrooms",
  "Changing rooms", "Showers", "Outdoor space", "Storage room",
  "Air conditioning",
] as const;

export function isLocationArea(value: string): boolean {
  return LOCATION_AREAS.some((area) => area.toLowerCase() === value.toLowerCase());
}
