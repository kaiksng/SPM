import type { ReactNode } from "react";

// The split-screen chrome (hero panel + form panel) lives in
// `AuthSplitScreen`, since login and signup each need their own hero
// headline/subcopy. This layout just establishes the shared background for
// the route group.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="bg-background min-h-screen">{children}</div>;
}
