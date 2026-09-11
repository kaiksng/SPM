import { Link } from "react-router";

import { AuthSplitScreen } from "@/features/auth/components/auth-split-screen";
import { SignupForm } from "@/features/auth/components/signup-form";
import { usePageTitle } from "@/hooks/use-page-title";

export function SignupPage() {
  usePageTitle("Create account");

  return (
    <AuthSplitScreen
      headline="Bring your team into one workspace."
      subcopy="Give organisers, coordinators, and venue staff one shared source of truth for every event."
    >
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Create your account
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Fill in your details to get started.
          </p>
        </div>
        <SignupForm />
        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{" "}
          <Link to="/login" className="text-foreground font-medium underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthSplitScreen>
  );
}
