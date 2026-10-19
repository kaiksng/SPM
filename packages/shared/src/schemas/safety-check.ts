import { z } from "zod";

/** Matches the {code, message} objects public.event_readiness returns. */
export const safetyCheckOutstandingItemSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const safetyCheckOutstandingItemsSchema = z.array(safetyCheckOutstandingItemSchema);

export type SafetyCheckOutstandingItem = z.infer<typeof safetyCheckOutstandingItemSchema>;
