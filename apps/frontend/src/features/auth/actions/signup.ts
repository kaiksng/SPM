import { getRoleDestination, mapAuthError, signupSchema } from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

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
      redirectTo?: string;
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

  return { redirectTo: getRoleDestination(role) };
}
