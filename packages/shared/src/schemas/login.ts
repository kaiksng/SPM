import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().pipe(z.email("Please enter a valid email address.")),
  // Supabase Auth enforces the actual password policy server-side; this is
  // intentionally just a presence check, not an invented complexity rule.
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;
