import { Compass } from "lucide-react";

import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

export function BrowseEventsPage() {
  usePageTitle("Browse Event");

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Attendee workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Browse events
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Events open for registration will appear here once they&apos;re
              published.
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
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <Compass aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">
          No events yet
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Check back soon — events will show up here once they&apos;re open
          for registration.
        </p>
      </div>
    </section>
  );
}
