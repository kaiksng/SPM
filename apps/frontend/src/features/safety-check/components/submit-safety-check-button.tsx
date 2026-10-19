import { Button } from "@/components/ui/button";

/**
 * AC05: when Ready, the assigned coordinator can submit. Disabled otherwise
 * (not Ready, or the viewer isn't the assigned coordinator) — readiness is
 * never overridden manually (AC04).
 */
export function SubmitSafetyCheckButton({
  ready,
  canSubmit,
  submitting,
  onSubmit,
}: {
  ready: boolean;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  if (!canSubmit) return null;

  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      <Button type="button" disabled={!ready || submitting} onClick={onSubmit}>
        {submitting ? "Submitting…" : "Submit for Safety Check"}
      </Button>
      <p className="text-xs text-slate-500">
        {ready
          ? "Submitting records this event's venues, period, attendance and equipment and notifies Safety Officers. If it is returned to Planning, resubmitting starts a new review round."
          : "Resolve every item above before submitting."}
      </p>
    </div>
  );
}
