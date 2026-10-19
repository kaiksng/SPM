import type { ReadinessOutstandingItem } from "@spm/shared";

/** AC05: submission is blocked with the outstanding items listed. */
export function OutstandingItemsList({ items }: { items: ReadinessOutstandingItem[] }) {
  if (items.length === 0) return null;

  return (
    <section
      role="alert"
      aria-label="Outstanding items"
      className="mt-4 rounded-2xl border border-orange-300 bg-orange-100/60 p-6"
    >
      <h2 className="text-sm font-semibold tracking-wide text-orange-900 uppercase">
        Before you can submit
      </h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-orange-900">
        {items.map((item) => (
          <li key={`${item.code}-${item.message}`}>{item.message}</li>
        ))}
      </ul>
    </section>
  );
}
