import type { AuthError } from "@supabase/supabase-js";

// Allow-list only. Supabase's raw error message is never returned to the
// client — anything not explicitly recognized falls back to a generic
// message so we never leak whether an email or a password was wrong, or
// any other implementation detail.
export function mapAuthError(error: Pick<AuthError, "code"> | null | undefined) {
  switch (error?.code) {
    case "invalid_credentials":
      return "Invalid email or password.";
    case "email_not_confirmed":
      return "Please confirm your email before signing in.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Please try again later.";
    case "user_already_exists":
    case "email_exists":
      // Deliberately vague: never confirm or deny that the email is
      // already registered.
      return "We couldn't create your account with those details. Try signing in instead.";
    case "weak_password":
      return "That password doesn't meet the minimum requirements.";
    default:
      return "Something went wrong. Please try again.";
  }
}
