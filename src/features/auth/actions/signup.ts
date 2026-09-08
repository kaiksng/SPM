"use server";

import { redirect } from "next/navigation";

import { mapAuthError } from "@/features/auth/actions/errors";
import { getRoleDestination } from "@/features/auth/domain/role-destination";
import { signupSchema } from "@/features/auth/schemas/signup";
import { createClient } from "@/lib/supabase/server";

export type SignupFormState =
  | {
      errors?: {
        fullName?: string[];
        email?: string[];
        password?: string[];
        confirmPassword?: string[];
        role?: string[];
      };
      message?: string;
    }
  | undefined;

export async function signup(
  _state: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  const validatedFields = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    role: formData.get("role"),
  });

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  const { fullName, email, password, role } = validatedFields.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role,
      },
    },
  });

  if (error || !data.user) {
    return { message: mapAuthError(error) };
  }

  if (!data.session) {
    // Supabase returns a user object with no session (and no error) when the
    // email is already registered, to avoid confirming that fact. Surface a
    // real message instead of silently redirecting to a page the guard will
    // just bounce back from.
    return { message: mapAuthError({ code: "user_already_exists" }) };
  }

  redirect(getRoleDestination(role));
}
