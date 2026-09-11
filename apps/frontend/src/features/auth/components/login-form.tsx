import { useActionState, useEffect } from "react";
import { useNavigate } from "react-router";

import { login } from "@/features/auth/actions/login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const navigate = useNavigate();

  useEffect(() => {
    if (state?.redirectTo) navigate(state.redirectTo, { replace: true });
  }, [state?.redirectTo, navigate]);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state?.errors?.email)}
          aria-describedby={state?.errors?.email ? "email-error" : undefined}
        />
        {state?.errors?.email?.map((error) => (
          <p key={error} id="email-error" className="text-destructive text-sm">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state?.errors?.password)}
          aria-describedby={
            state?.errors?.password ? "password-error" : undefined
          }
        />
        {state?.errors?.password?.map((error) => (
          <p key={error} id="password-error" className="text-destructive text-sm">
            {error}
          </p>
        ))}
      </div>

      {state?.message && (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
