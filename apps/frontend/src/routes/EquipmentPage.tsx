import { Wrench } from "lucide-react";

import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

export function EquipmentPage() {
  usePageTitle("Equipment");

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-blue-600 uppercase">
              Equipment workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Equipment
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Reserve and track technical equipment here.
            </p>
          </header>

          <EmptyState />
        </div>
      </div>
    </RoleGate>
  );
}

function EmptyState() {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <Wrench aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">
          No equipment yet
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Equipment will show up here once it&apos;s added to the system.
        </p>
      </div>
    </section>
  );
}
