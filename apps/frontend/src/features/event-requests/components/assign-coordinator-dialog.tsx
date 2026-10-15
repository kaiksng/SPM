import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Modal } from "@/features/event-requests/components/modal";
import type { CoordinatorOption } from "@/features/event-requests/services/all-events";

/**
 * The Event Coordinator Lead's assign/reassign dialog. A reason is only
 * required in "reassign" mode, mirroring reassign_event_coordinator: the
 * first assignment of a previously unassigned event has nothing to justify.
 */
export function AssignCoordinatorDialog({
  mode,
  coordinators,
  currentCoordinatorId,
  onCancel,
  onSubmit,
}: {
  mode: "assign" | "reassign";
  coordinators: CoordinatorOption[];
  currentCoordinatorId?: string | null;
  onCancel: () => void;
  onSubmit: (coordinatorId: string, reason: string) => Promise<unknown>;
}) {
  const [coordinatorId, setCoordinatorId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const isReassign = mode === "reassign";
  const selectableCoordinators = coordinators.filter(
    (coordinator) => coordinator.id !== currentCoordinatorId,
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!coordinatorId) {
      setError("Choose a coordinator.");
      return;
    }
    if (isReassign && !reason.trim()) {
      setError("Explain why this event is being reassigned.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(coordinatorId, reason.trim());
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "This event could not be assigned.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal
      titleId="assign-coordinator-dialog-title"
      title={isReassign ? "Reassign this event" : "Assign a coordinator"}
      onCancel={onCancel}
    >
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="assign-coordinator-select"
            className="text-sm font-medium text-slate-700"
          >
            Coordinator
          </label>
          <Select
            value={coordinatorId}
            onValueChange={(value) => setCoordinatorId(value ?? "")}
            items={Object.fromEntries(
              selectableCoordinators.map((coordinator) => [
                coordinator.id,
                describeCoordinator(coordinator),
              ]),
            )}
          >
            <SelectTrigger id="assign-coordinator-select" className="mt-1">
              <SelectValue placeholder="Choose a coordinator" />
            </SelectTrigger>
            <SelectContent>
              {selectableCoordinators.map((coordinator) => (
                <SelectItem
                  key={coordinator.id}
                  value={coordinator.id}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <span className="flex w-full flex-1 items-center justify-between gap-3">
                    <span>{coordinator.fullName ?? "Unnamed coordinator"}</span>{" "}
                    <span className="text-xs whitespace-nowrap text-slate-400">
                      {coordinator.activeEventCount} active
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label
            htmlFor="assign-coordinator-reason"
            className="text-sm font-medium text-slate-700"
          >
            Reason{isReassign ? "" : " (optional)"}
          </label>
          <textarea
            id="assign-coordinator-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : isReassign ? "Reassign event" : "Assign coordinator"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function describeCoordinator(coordinator: CoordinatorOption) {
  const name = coordinator.fullName ?? "Unnamed coordinator";
  const count = coordinator.activeEventCount;
  return `${name} — ${count} active event${count === 1 ? "" : "s"}`;
}
