import {
  hasPermission,
  isoToSingaporeLocal,
  VENUE_BLOCK_REASON_CATEGORIES,
  VENUE_BLOCK_REASON_CATEGORY_LABELS,
  venueBlockSchema,
  type VenueBlockFormValues,
  type VenueBlockReasonCategory,
} from "@spm/shared";
import { ArrowLeft, CalendarClock, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/auth-context";
import { Modal } from "@/features/event-requests/components/modal";
import {
  createVenueBlock, listVenueBlocks, previewVenueBlockImpact, removeVenueBlock, shortenVenueBlock,
  type AffectedBooking, type VenueBlock,
} from "@/features/venues/services/venue-blocks";
import { getVenue } from "@/features/venues/services/venues";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateFormat = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore",
});

// The form holds "" until the staff member picks a category.
type BlockFormState = Omit<VenueBlockFormValues, "reasonCategory"> & {
  reasonCategory: VenueBlockReasonCategory | "";
};

const SELECT_CLASS_NAME =
  "border-input flex h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

export function VenueBlocksPage() {
  const { venueId } = useParams();
  const { profile } = useAuth();
  const allowed = hasPermission(profile?.role ?? "attendee", "manageVenue");
  const [venueName, setVenueName] = useState("");
  const [blocks, setBlocks] = useState<VenueBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Where the success/error message shows: next to the form or the history,
  // whichever the staff member just used, so it is not lost above the fold.
  const [feedbackArea, setFeedbackArea] = useState<"form" | "history">("form");
  const [flaggedBookings, setFlaggedBookings] = useState<AffectedBooking[]>([]);
  const [values, setValues] = useState<BlockFormState>({
    venueId: venueId ?? "", reasonCategory: "", reason: "", startsAt: "", endsAt: "",
  });
  const [pendingBlock, setPendingBlock] = useState<{
    values: VenueBlockFormValues;
    affected: AffectedBooking[];
  }>();
  const [blockToShorten, setBlockToShorten] = useState<VenueBlock>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [blockToRemove, setBlockToRemove] = useState<VenueBlock>();
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");

  usePageTitle(venueName ? `Manage blocks — ${venueName}` : "Manage blocks");

  async function refresh() {
    if (!venueId) return;
    setBlocks(await listVenueBlocks(venueId));
  }

  useEffect(() => {
    if (!venueId || !allowed) return;
    let active = true;
    Promise.all([getVenue(venueId), listVenueBlocks(venueId)])
      .then(([venue, rows]) => {
        if (active) { setVenueName(venue.name); setBlocks(rows); }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load blocks.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [venueId, allowed]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice(""); setFlaggedBookings([]); setFeedbackArea("form");
    const parsed = venueBlockSchema.safeParse({ ...values, venueId });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setFieldErrors(next);
      // The venue comes from the page address, so it has no field to flag.
      if (next.venueId) setError("This venue link is not valid. Open the venue from the catalogue and try again.");
      return;
    }
    setFieldErrors({}); setSaving(true);
    try {
      // SPM-83: a block may overlap bookings. Show Venue Staff who is
      // affected and make them confirm before anything is saved.
      const affected = await previewVenueBlockImpact(parsed.data);
      if (affected.length > 0) {
        setPendingBlock({ values: parsed.data, affected });
        return;
      }
      await persistBlock(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This block could not be saved.");
    } finally { setSaving(false); }
  }

  async function persistBlock(data: VenueBlockFormValues) {
    const created = await createVenueBlock(data);
    await refresh();
    setValues({ venueId: venueId!, reasonCategory: "", reason: "", startsAt: "", endsAt: "" });
    const flagged = created.affected.length;
    setFlaggedBookings(created.affected);
    setNotice(
      flagged > 0
        ? `Block saved. ${flagged} ${flagged === 1 ? "booking was" : "bookings were"} flagged Disrupted - Alternative Required and the assigned coordinators have been notified.`
        : "Block saved. Availability has been updated.",
    );
  }

  async function confirmPendingBlock() {
    if (!pendingBlock) return;
    setError(""); setFlaggedBookings([]); setFeedbackArea("form"); setSaving(true);
    try {
      await persistBlock(pendingBlock.values);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This block could not be saved.");
    } finally {
      setPendingBlock(undefined);
      setSaving(false);
    }
  }

  async function shorten(startsAt: string, endsAt: string) {
    if (!blockToShorten) return;
    setError(""); setNotice(""); setFlaggedBookings([]); setFeedbackArea("history");
    try {
      const { clearedCount } = await shortenVenueBlock(blockToShorten.id, startsAt, endsAt);
      setBlockToShorten(undefined);
      await refresh();
      setNotice(
        clearedCount > 0
          ? `Block shortened. ${clearedCount} ${clearedCount === 1 ? "booking is" : "bookings are"} no longer disrupted and the coordinators have been told.`
          : "Block shortened. Availability has been updated.",
      );
    } catch (cause) {
      throw cause instanceof Error ? cause : new Error("This block could not be shortened.");
    }
  }

  async function remove() {
    if (!blockToRemove) return;
    setError(""); setNotice(""); setFlaggedBookings([]); setFeedbackArea("history"); setRemoveError(""); setRemoving(true);
    try {
      await removeVenueBlock(blockToRemove.id);
      setBlockToRemove(undefined);
      setNotice("Block removed. Availability has been updated.");
      try {
        await refresh();
      } catch {
        setError("The block was removed, but its history could not be refreshed. Reload this page.");
      }
    } catch (cause) {
      setRemoveError(cause instanceof Error ? cause.message : "This block could not be removed.");
    } finally { setRemoving(false); }
  }

  const feedback = (error || notice) ? (
    <div role={error ? "alert" : "status"} className={`mt-5 rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
      <p>{error || notice}</p>
      {!error && flaggedBookings.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          {flaggedBookings.map((booking) => (
            <li key={booking.bookingId}>
              {booking.eventTitle} · {booking.coordinatorName ?? "Unassigned"} ·{" "}
              {dateFormat.format(new Date(booking.startsAt))} – {dateFormat.format(new Date(booking.endsAt))}
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : null;

  const now = Date.now();
  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <Link to={`/venues/${venueId}`} className={buttonVariants({ variant: "ghost", className: "-ml-2" })}>
            <ArrowLeft /> Back to venue
          </Link>
          {!allowed ? (
            <p role="alert" className="mt-8 text-red-700">Venue Staff access is required.</p>
          ) : loading ? (
            <p role="status" className="mt-8 text-slate-500">Loading block history…</p>
          ) : !venueName ? (
            <p role="alert" className="mt-8 text-red-700">{error || "Venue not found."}</p>
          ) : (
            <>
              <header className="mt-6 border-b border-slate-200 pb-7">
                <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Venue operations</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Manage blocks</h1>
                <p className="mt-2 text-sm text-slate-600">{venueName} · Maintenance, renovation and safety closures</p>
                <Link to={`/venues/${venueId}/availability`} className={buttonVariants({ variant: "outline", size: "sm", className: "mt-4" })}>
                  <CalendarClock /> View availability
                </Link>
              </header>
              <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
                <h2 className="text-lg font-semibold text-slate-950">New operational block</h2>
                <form onSubmit={save} noValidate className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2"><label htmlFor="block-venue" className="mb-1 block text-sm font-medium">Venue</label><Input id="block-venue" value={venueName} readOnly /></div>
                  <div className="sm:col-span-2"><label htmlFor="block-category" className="mb-1 block text-sm font-medium">Reason category</label><select id="block-category" className={SELECT_CLASS_NAME} value={values.reasonCategory} aria-invalid={!!fieldErrors.reasonCategory} aria-describedby={fieldErrors.reasonCategory ? "category-error" : undefined} onChange={(e) => setValues({ ...values, reasonCategory: e.target.value as BlockFormState["reasonCategory"] })}><option value="">Select a category</option>{VENUE_BLOCK_REASON_CATEGORIES.map((category) => <option key={category} value={category}>{VENUE_BLOCK_REASON_CATEGORY_LABELS[category]}</option>)}</select>{fieldErrors.reasonCategory && <p id="category-error" className="mt-1 text-sm text-red-700">{fieldErrors.reasonCategory}</p>}</div>
                  <div className="sm:col-span-2"><label htmlFor="block-reason" className="mb-1 block text-sm font-medium">Reason</label><Input id="block-reason" value={values.reason} aria-invalid={!!fieldErrors.reason} aria-describedby={fieldErrors.reason ? "reason-error" : undefined} onChange={(e) => setValues({ ...values, reason: e.target.value })} placeholder="e.g. Air-conditioning maintenance" />{fieldErrors.reason && <p id="reason-error" className="mt-1 text-sm text-red-700">{fieldErrors.reason}</p>}</div>
                  {(["startsAt", "endsAt"] as const).map((key) => <div key={key}><label htmlFor={key} className="mb-1 block text-sm font-medium">{key === "startsAt" ? "Start date and time" : "End date and time"}</label><Input id={key} type="datetime-local" value={values[key]} aria-invalid={!!fieldErrors[key]} aria-describedby={fieldErrors[key] ? `${key}-error` : undefined} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />{fieldErrors[key] && <p id={`${key}-error`} className="mt-1 text-sm text-red-700">{fieldErrors[key]}</p>}</div>)}
                  <div className="sm:col-span-2"><Button type="submit" size="lg" disabled={saving}><Plus /> {saving ? "Saving…" : "Save block"}</Button>{feedbackArea === "form" && feedback}</div>
                </form>
              </section>
              <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
                <h2 className="text-lg font-semibold text-slate-950">Block history</h2>
                {feedbackArea === "history" && feedback}
                {blocks.length === 0 ? <p className="mt-4 text-sm text-slate-500">No blocks have been recorded for this venue.</p> : <ul className="mt-4 divide-y divide-slate-100">{blocks.map((block) => {
                  const status = block.removedAt ? "Removed" : new Date(block.endsAt).getTime() <= now ? "Past" : new Date(block.startsAt).getTime() > now ? "Upcoming" : "In progress";
                  return <li key={block.id} className="flex flex-wrap items-start justify-between gap-4 py-4"><div><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-900">{block.reason || "Reason not recorded"}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{VENUE_BLOCK_REASON_CATEGORY_LABELS[block.reasonCategory]}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{status}</span></div><p className="mt-1 text-sm text-slate-600">{dateFormat.format(new Date(block.startsAt))} – {dateFormat.format(new Date(block.endsAt))}</p>{block.removedAt && <p className="mt-1 text-xs text-slate-500">Removed {dateFormat.format(new Date(block.removedAt))}</p>}</div>{!block.removedAt && new Date(block.endsAt).getTime() > now && <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setBlockToShorten(block)}>Shorten block</Button><Button type="button" variant="destructive" size="sm" onClick={() => { setRemoveError(""); setBlockToRemove(block); }}>Remove block</Button></div>}</li>;
                })}</ul>}
              </section>
            </>
          )}
        </div>
        {pendingBlock && (
          <AffectedBookingsDialog
            venueName={venueName}
            values={pendingBlock.values}
            affected={pendingBlock.affected}
            saving={saving}
            onCancel={() => setPendingBlock(undefined)}
            onConfirm={confirmPendingBlock}
          />
        )}
        {blockToShorten && (
          <ShortenBlockDialog
            block={blockToShorten}
            onCancel={() => setBlockToShorten(undefined)}
            onConfirm={shorten}
          />
        )}
        {blockToRemove && (
          <RemoveBlockDialog
            block={blockToRemove}
            venueName={venueName}
            removing={removing}
            error={removeError}
            onCancel={() => setBlockToRemove(undefined)}
            onConfirm={remove}
          />
        )}
      </div>
    </RoleGate>
  );
}

function RemoveBlockDialog({
  block, venueName, removing, error, onCancel, onConfirm,
}: {
  block: VenueBlock;
  venueName: string;
  removing: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    cancelButton.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (removing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
    if (event.key === "Tab") {
      if (event.shiftKey && document.activeElement === cancelButton.current) {
        event.preventDefault();
        confirmButton.current?.focus();
      } else if (!event.shiftKey && document.activeElement === confirmButton.current) {
        event.preventDefault();
        cancelButton.current?.focus();
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-block-title"
        aria-describedby="remove-block-description"
        aria-busy={removing}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 id="remove-block-title" className="text-lg font-semibold text-slate-950">
          Remove this block?
        </h2>
        <p id="remove-block-description" className="mt-2 text-sm leading-6 text-slate-600">
          Removing this block releases its period for new venue requests. It remains in block history.
        </p>
        <dl className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{venueName}</dt>
          <dd className="mt-1 font-semibold text-slate-900">{block.reason || "Reason not recorded"}</dd>
          <dd className="mt-1 text-slate-600">
            {dateFormat.format(new Date(block.startsAt))} – {dateFormat.format(new Date(block.endsAt))}
          </dd>
        </dl>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button ref={cancelButton} type="button" variant="outline" disabled={removing} onClick={onCancel}>
            Keep block
          </Button>
          <Button ref={confirmButton} type="button" variant="destructive" disabled={removing} onClick={onConfirm}>
            {removing ? "Removing…" : "Remove block"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AffectedBookingsDialog({
  venueName, values, affected, saving, onCancel, onConfirm,
}: {
  venueName: string;
  values: VenueBlockFormValues;
  affected: AffectedBooking[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal titleId="affected-bookings-title" title="This block affects existing bookings" onCancel={onCancel}>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {venueName} will be unavailable from {dateFormat.format(new Date(`${values.startsAt}+08:00`))} to{" "}
        {dateFormat.format(new Date(`${values.endsAt}+08:00`))}. The bookings below will be flagged Disrupted -
        Alternative Required and each coordinator notified. Nothing is cancelled.
      </p>
      <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
        {affected.map((booking) => (
          <li key={booking.bookingId} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="font-semibold text-slate-900">{booking.eventTitle}</p>
            <p className="text-slate-600">Coordinator: {booking.coordinatorName ?? "Unassigned"}</p>
            <p className="text-slate-600">
              {dateFormat.format(new Date(booking.startsAt))} – {dateFormat.format(new Date(booking.endsAt))}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Go back</Button>
        <Button type="button" variant="destructive" disabled={saving} onClick={onConfirm}>
          {saving ? "Saving…" : "Save block anyway"}
        </Button>
      </div>
    </Modal>
  );
}

function ShortenBlockDialog({
  block, onCancel, onConfirm,
}: {
  block: VenueBlock;
  onCancel: () => void;
  onConfirm: (startsAt: string, endsAt: string) => Promise<void>;
}) {
  const [startsAt, setStartsAt] = useState(isoToSingaporeLocal(block.startsAt));
  const [endsAt, setEndsAt] = useState(isoToSingaporeLocal(block.endsAt));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!startsAt || !endsAt || endsAt <= startsAt) {
      setError("End time must be after start time");
      return;
    }
    setError(""); setSaving(true);
    try {
      await onConfirm(startsAt, endsAt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This block could not be shortened.");
      setSaving(false);
    }
  }

  return (
    <Modal titleId="shorten-block-title" title="Shorten this block" onCancel={onCancel}>
      <form onSubmit={submit} noValidate className="mt-3 grid gap-4">
        <p className="text-sm text-slate-600">
          A block can only be made shorter. Bookings that no longer overlap it are cleared and their coordinators told.
        </p>
        <div>
          <label htmlFor="shorten-start" className="mb-1 block text-sm font-medium">New start date and time</label>
          <Input id="shorten-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div>
          <label htmlFor="shorten-end" className="mb-1 block text-sm font-medium">New end date and time</label>
          <Input id="shorten-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save shortened block"}</Button>
        </div>
      </form>
    </Modal>
  );
}
