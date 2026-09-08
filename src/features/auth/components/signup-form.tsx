"use client";

import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { signup } from "@/features/auth/actions/signup";
import { signupRoles } from "@/features/auth/schemas/signup";

const roleLabels: Record<(typeof signupRoles)[number], string> = {
  event_organiser: "Event organiser",
  event_coordinator: "Event coordinator",
  venue_staff: "Venue staff",
  technical_support_staff: "Technical support staff",
  attendee: "Attendee",
};

const PASSWORD_MISMATCH_MESSAGE = "Passwords do not match";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, undefined);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);

  const passwordsDiffer =
    confirmPassword.length > 0 && password !== confirmPassword;
  const showPasswordMismatch = confirmPasswordTouched && passwordsDiffer;

  const markConfirmPasswordTouched = () => setConfirmPasswordTouched(true);

  const errors = useMemo(() => {
    const messages: string[] = [
      ...(state?.errors?.fullName ?? []),
      ...(state?.errors?.email ?? []),
      ...(state?.errors?.password ?? []),
    ];

    if (showPasswordMismatch) {
      messages.push(PASSWORD_MISMATCH_MESSAGE);
    } else {
      messages.push(...(state?.errors?.confirmPassword ?? []));
    }

    messages.push(...(state?.errors?.role ?? []));

    if (state?.message) {
      messages.push(state.message);
    }

    return messages;
  }, [state, showPasswordMismatch]);

  const hasConfirmPasswordError =
    showPasswordMismatch || Boolean(state?.errors?.confirmPassword);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          aria-invalid={Boolean(state?.errors?.fullName)}
          aria-describedby={errors.length > 0 ? "form-errors" : undefined}
        />
      </div>

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
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(state?.errors?.password)}
          aria-describedby={errors.length > 0 ? "form-errors" : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          onBlur={markConfirmPasswordTouched}
          aria-invalid={hasConfirmPasswordError}
          aria-describedby={errors.length > 0 ? "form-errors" : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Role</Label>
        <Select name="role" defaultValue="attendee" required>
          <SelectTrigger id="role" aria-invalid={Boolean(state?.errors?.role)}>
            <SelectValue placeholder="Choose a role" />
          </SelectTrigger>
          <SelectContent>
            {signupRoles.map((role) => (
              <SelectItem key={role} value={role}>
                {roleLabels[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      <Button
        type="submit"
        disabled={pending || passwordsDiffer}
        className="w-full"
      >
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
