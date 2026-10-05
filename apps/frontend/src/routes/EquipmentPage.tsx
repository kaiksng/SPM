import { FilePlus2, Wrench } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { TechnicalSupportEquipment } from "@/features/equipment/components/technical-support-equipment";
import { ListToolbar } from "@/features/workspace/components/list-toolbar";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

/** Only a coordinator can request equipment — an organiser can view but not book. */
function canRequestEquipment(role: string | undefined) {
  return role === "event_coordinator";
}

export function EquipmentPage() {
  usePageTitle("Equipment");
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Equipment workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Equipment
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Reserve and track technical equipment here.
            </p>
          </header>

          {profile?.role === "technical_support_staff" ? (
            <TechnicalSupportEquipment />
          ) : (
            <>
              <ListToolbar
                searchPlaceholder="Search equipment"
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                action={
                  canRequestEquipment(profile?.role) ? (
                    <Button type="button" size="sm">
                      <FilePlus2 /> Equipment request
                    </Button>
                  ) : undefined
                }
              />

              <EmptyState />
            </>
          )}
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
