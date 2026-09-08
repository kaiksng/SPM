"use server";

import { redirect } from "next/navigation";

import { mapAuthError } from "@/features/auth/actions/errors";
import { getRoleDestination } from "@/features/auth/domain/role-destination";
import { loginSchema } from "@/features/auth/schemas/login";
import type { UserRole } from "@/features/auth/types/role";
import { createClient } from "@/lib/supabase/server";

export type LoginFormState =
  | {
      errors?: {
        email?: string[];
        password?: string[];
      };
      message?: string;
    }
  | undefined;

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
  const supabase = await createClient();

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
  redirect(getRoleDestination(role));
}
