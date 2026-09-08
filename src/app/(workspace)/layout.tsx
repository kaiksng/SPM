import type { ReactNode } from "react";

import { requireUserForPage } from "@/server/auth/require-user-for-page";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUserForPage();

  return <>{children}</>;
}
