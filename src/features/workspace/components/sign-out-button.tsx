import { LogOut } from "lucide-react";

import { logout } from "@/features/auth/actions/logout";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="outline" size="sm" className="w-full">
        <LogOut data-icon="inline-start" aria-hidden="true" />
        Sign out
      </Button>
    </form>
  );
}
