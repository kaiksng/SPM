/**
 * SPM-83/82: shown beside a booking's own status while a venue block has
 * disrupted it. The booking keeps its real status (it is still approved or
 * pending); this flags that it needs an alternative.
 */
export function DisruptedPill() {
  return (
    <span className="inline-block rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-red-800">
      Disrupted
    </span>
  );
}
