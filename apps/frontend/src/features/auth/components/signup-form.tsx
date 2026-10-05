import { signupRoles } from "@spm/shared";
import { useActionState, useEffect, useState } from "react";
import { useNavigate } from "react-router";

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

const roleLabels: Record<(typeof signupRoles)[number], string> = {
  event_organiser: "Event organiser",
  event_coordinator: "Event coordinator",
  event_coordinator_lead: "Event coordinator lead",
  venue_staff: "Venue staff",
  technical_support_staff: "Technical support staff",
  attendee: "Attendee",
};

const PASSWORD_MISMATCH_MESSAGE = "Passwords do not match";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, undefined);
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);

  useEffect(() => {
    if (state?.redirectTo) navigate(state.redirectTo, { replace: true });
  }, [state?.redirectTo, navigate]);

  const passwordsDiffer =
    confirmPassword.length > 0 && password !== confirmPassword;
  const showPasswordMismatch = confirmPasswordTouched && passwordsDiffer;

  const markConfirmPasswordTouched = () => setConfirmPasswordTouched(true);

  const confirmPasswordErrors = showPasswordMismatch
    ? [PASSWORD_MISMATCH_MESSAGE]
    : (state?.errors?.confirmPassword ?? []);

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
          aria-describedby={
            state?.errors?.fullName ? "fullName-error" : undefined
          }
        />
        {state?.errors?.fullName?.map((error) => (
          <p key={error} id="fullName-error" className="text-destructive text-sm">
            {error}
          </p>
        ))}
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
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
          aria-describedby={
            confirmPasswordErrors.length > 0 ? "confirmPassword-error" : undefined
          }
        />
        {confirmPasswordErrors.map((error) => (
          <p
            key={error}
            id="confirmPassword-error"
            className="text-destructive text-sm"
          >
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Role</Label>
        <Select name="role" items={roleLabels} defaultValue="attendee" required>
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
        {state?.errors?.role?.map((error) => (
          <p key={error} className="text-destructive text-sm">
            {error}
          </p>
        ))}
      </div>

      {state?.message && (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
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
