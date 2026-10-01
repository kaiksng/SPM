import { Link } from "react-router";

import { AuthSplitScreen } from "@/features/auth/components/auth-split-screen";
import { LoginForm } from "@/features/auth/components/login-form";
import { usePageTitle } from "@/hooks/use-page-title";

export function LoginPage() {
  usePageTitle("Sign in");

  return (
    <AuthSplitScreen>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Enter your email and password to continue.
          </p>
        </div>
        <LoginForm />
        <p className="text-muted-foreground text-center text-sm">
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="text-foreground font-medium underline">
            Create one
          </Link>
        </p>
      </div>
    </AuthSplitScreen>
  );
}
