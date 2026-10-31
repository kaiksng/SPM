import {
  getRoleDestination,
  loginSchema,
  mapAuthError,
  type UserRole,
} from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

export type LoginFormState =
  | {
      errors?: {
        email?: string[];
        password?: string[];
      };
      message?: string;
      redirectTo?: string;
    }
  | undefined;

/**
 * Where an attendee was heading before signing in, e.g. an event picked on
 * the public main page. Only attendee pages are accepted, so the value can't
 * send anyone off-site or into a page their role can't use.
 */
function attendeeReturnPath(next: FormDataEntryValue | null): string | undefined {
  if (typeof next !== "string") return undefined;
  return /^\/browse-events(\/[\w-]+)?$/.test(next) ? next : undefined;
}

export async function login(
  _state: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const validatedFields = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  const { email, password } = validatedFields.data;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { message: mapAuthError(error) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  const role = (profile?.role ?? "attendee") as UserRole;
  const returnPath = role === "attendee" ? attendeeReturnPath(formData.get("next")) : undefined;
  return { redirectTo: returnPath ?? getRoleDestination(role) };
}
