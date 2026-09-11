import { z } from "zod";

// Self-signup must never grant the administrator role, so it is deliberately
// excluded from this list even though it's a valid value in `public.user_role`.
// This dropdown is expected to be removed in a future iteration.
export const signupRoles = [
  "event_organiser",
  "event_coordinator",
  "venue_staff",
  "technical_support_staff",
  "attendee",
] as const;

export type SignupRole = (typeof signupRoles)[number];

export const signupSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters.")
      .max(120, "Full name must be at most 120 characters."),
    email: z.string().trim().pipe(z.email("Please enter a valid email address.")),
    // Supabase Auth enforces the actual password policy server-side; this is
    // intentionally just a presence check, not an invented complexity rule.
    password: z.string().min(1, "Password is required."),
    confirmPassword: z.string().min(1, "Confirm your password."),
    role: z.enum(signupRoles, "Choose a role."),
  })
  .refine((fields) => fields.password === fields.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;
