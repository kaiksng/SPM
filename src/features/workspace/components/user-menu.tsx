"use client";

import { LogOut } from "lucide-react";

import { logout } from "@/features/auth/actions/logout";
import { getRoleLabel } from "@/features/auth/domain/role-label";
import type { UserRole } from "@/features/auth/types/role";
import {
  Menu,
  MenuContent,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";

function getInitials(fullName: string | null, email: string) {
  const words = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (words.length >= 2) {
    return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }

  return email.slice(0, 2).toUpperCase();
}

export function UserMenu({
  role,
  email,
  fullName,
}: {
  role: UserRole;
  email: string;
  fullName: string | null;
}) {
  const initials = getInitials(fullName, email);

  return (
    <Menu>
      <MenuTrigger
        aria-label="Open user menu"
        className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {initials}
      </MenuTrigger>

      <MenuContent className="min-w-64">
        <div className="flex items-center gap-3 p-2">
          <span className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-sm font-medium">
              {fullName || email}
            </p>
            <p className="text-muted-foreground truncate text-xs">{email}</p>
          </div>
        </div>

        <div className="px-2 pb-2">
          <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase">
            {getRoleLabel(role)}
          </span>
        </div>

        <MenuSeparator />

        <form action={logout}>
          <button
            type="submit"
            className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none"
          >
            <LogOut aria-hidden="true" className="size-4 shrink-0" />
            Sign out
          </button>
        </form>
      </MenuContent>
    </Menu>
  );
}
