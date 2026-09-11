import type { Database } from "./database.types";

export type Event = Database["public"]["Tables"]["events"]["Row"];
export type NewEvent = Database["public"]["Tables"]["events"]["Insert"];
export type EventUpdate = Database["public"]["Tables"]["events"]["Update"];
