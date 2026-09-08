"use client";

import { useActionState, useMemo } from "react";

import { login } from "@/features/auth/actions/login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined);

  const errors = useMemo(() => {
    const messages: string[] = [
      ...(state?.errors?.email ?? []),
      ...(state?.errors?.password ?? []),
    ];

    if (state?.message) {
      messages.push(state.message);
    }

    return messages;
  }, [state]);

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
          aria-describedby={errors.length > 0 ? "form-errors" : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state?.errors?.password)}
          aria-describedby={errors.length > 0 ? "form-errors" : undefined}
        />
      </div>

      {errors.length > 0 && (
        <div
          id="form-errors"
          role="alert"
          className="border-destructive/30 bg-destructive/5 flex flex-col gap-1 rounded-lg border p-3"
        >
          {errors.map((error) => (
            <p key={error} className="text-destructive text-sm">
              {error}
            </p>
          ))}
        </div>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
