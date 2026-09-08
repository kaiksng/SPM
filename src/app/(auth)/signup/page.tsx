import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignupForm } from "@/features/auth/components/signup-form";
import { getRoleDestination } from "@/features/auth/domain/role-destination";
import type { UserRole } from "@/features/auth/types/role";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Create account",
};

export default async function SignupPage() {
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
        <h1 className="text-xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Join ConnectSphere to start planning and coordinating events.
        </p>
      </div>
      <SignupForm />
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground font-medium underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
