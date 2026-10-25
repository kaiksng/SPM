import { z } from "zod";

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
  })
  .refine((fields) => fields.password === fields.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;
