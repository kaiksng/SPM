import type { RegistrationState } from "@spm/shared";
import { Check } from "lucide-react";

export const registrationStateLabels: Record<RegistrationState, string> = {
  not_required: "Not required",
  open: "Open for registration",
  full: "Full",
  not_open: "Not open yet",
  closed: "Closed",
  registered: "Registered",
};

const BADGE_STYLES: Record<RegistrationState, string> = {
  not_required: "border-slate-200 bg-slate-50 text-slate-500",
  open: "border-sky-200 bg-sky-50 text-sky-700",
  full: "border-amber-200 bg-amber-50 text-amber-800",
  not_open: "border-slate-200 bg-slate-50 text-slate-500",
  closed: "border-slate-200 bg-slate-50 text-slate-500",
  registered: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function RegistrationStatusBadge({ state }: { state: RegistrationState }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${BADGE_STYLES[state]}`}
    >
      {state === "registered" && <Check className="size-3" aria-hidden="true" />}
      {registrationStateLabels[state]}
    </span>
  );
}
