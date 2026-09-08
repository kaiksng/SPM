import type { Metadata } from "next";

import { logout } from "@/features/auth/actions/logout";
import { getCurrentProfile } from "@/features/auth/queries/get-current-profile";
import { Button } from "@/components/ui/button";
import { requireUserForPage } from "@/server/auth/require-user-for-page";

export const metadata: Metadata = {
  title: "Home",
};

export default async function WorkspaceHomePage() {
  const user = await requireUserForPage();
  const profile = await getCurrentProfile(user.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
      <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
        Role: {profile.role}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        You&apos;re signed in
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Signed in as {user.email}. Role-specific workspace views will land
        here in a future story.
      </p>
      <form action={logout} className="mt-6">
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}
