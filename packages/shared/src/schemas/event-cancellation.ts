import { z } from "zod";

export const cancelEventBodySchema = z.object({
  reason: z.string().trim().min(1, "Give a reason for cancelling this event").max(2_000),
});

export type CancelEventBody = z.infer<typeof cancelEventBodySchema>;
