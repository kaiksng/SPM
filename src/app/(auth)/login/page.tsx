import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRoleDestination } from "@/features/auth/domain/role-destination";
import { LoginForm } from "@/features/auth/components/login-form";
import type { UserRole } from "@/features/auth/types/role";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = (profile?.role ?? "attendee") as UserRole;
    redirect(getRoleDestination(role));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Sign in to your ConnectSphere account.
        </p>
      </div>
      <LoginForm />
      <p className="text-muted-foreground text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-foreground font-medium underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
