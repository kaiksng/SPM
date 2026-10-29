import { useEffect, useRef } from "react";

/** How many dialogs are open, so the page unlocks only when the last one closes. */
let openDialogCount = 0;

/**
 * Shared dialog shell for the event-requests feature's popups (request
 * clarification, approve/reject, change history). `size="large"` is for
 * content that needs room to scroll (the change-history dialog) — it fixes
 * the dialog to roughly half the viewport and scrolls its body while keeping
 * the title and close affordance in place; the default stays a compact
 * form-sized dialog, but never taller than the screen: a long body scrolls
 * inside it. While any dialog is open the page behind does not scroll.
 */
export function Modal({
  titleId,
  title,
  children,
  onCancel,
  size = "default",
}: {
  titleId: string;
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
  size?: "default" | "large";
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  // Scrolling over the dialog or its backdrop must not move the page behind.
  // Counted rather than saved-and-restored: a dialog opened from a menu would
  // otherwise save the menu's own lock and put it back on close, leaving the
  // page unscrollable.
  useEffect(() => {
    openDialogCount += 1;
    document.body.style.overflow = "hidden";
    return () => {
      openDialogCount -= 1;
      if (openDialogCount === 0) document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={
          size === "large"
            ? "flex h-[50vh] min-h-[420px] w-[50vw] min-w-[360px] flex-col rounded-2xl bg-white p-6 shadow-2xl"
            : "flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-2xl bg-white p-6 shadow-2xl"
        }
      >
        <h2 id={titleId} className="shrink-0 text-lg font-semibold text-slate-950">
          {title}
        </h2>
        <div className={size === "large" ? "mt-4 flex-1 overflow-y-auto" : "-mx-1 min-h-0 overflow-y-auto px-1"}>
          {children}
        </div>
        <button ref={closeButton} type="button" className="sr-only" onClick={onCancel}>
          Close
        </button>
      </div>
    </div>
  );
}
