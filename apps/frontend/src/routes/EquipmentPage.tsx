import { FilePlus2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { EquipmentCatalogue } from "@/features/equipment/components/equipment-catalogue";
import type { EquipmentFilterValues } from "@/features/equipment/components/equipment-filters";
import {
  TechnicalSupportEquipment,
  type EquipmentSection,
} from "@/features/equipment/components/technical-support-equipment";
import {
  listEquipmentCatalogue,
  type EquipmentCatalogueItem,
} from "@/features/equipment/services/equipment-unavailability";
import { ChooseEquipmentEventDialog } from "@/features/event-requests/components/choose-equipment-event-dialog";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

/** Only a coordinator can request equipment — an organiser can view but not book. */
function canRequestEquipment(role: string | undefined) {
  return role === "event_coordinator";
}

const sectionHeadings: Readonly<Record<EquipmentSection, { title: string; description: string }>> = {
  requests: {
    title: "Event requests",
    description: "Reserve the equipment events have requested, and track how arranging it is going.",
  },
  inventory: { title: "Inventory", description: "Every equipment item and unit in the catalogue." },
  unavailability: {
    title: "Unavailability",
    description: "Repairs, maintenance and losses that take equipment out of service.",
  },
};

/**
 * Technical Support Staff see one of three sections (Event requests,
 * Inventory, Unavailability), each its own page in the top bar. Other roles
 * see the plain Equipment page.
 */
export function EquipmentPage({ section = "requests" }: { section?: EquipmentSection }) {
  const { profile } = useAuth();
  const isSupportStaff = profile?.role === "technical_support_staff";
  const heading = isSupportStaff
    ? sectionHeadings[section]
    : { title: "Equipment", description: "Reserve and track technical equipment here." };
  usePageTitle(heading.title);

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Equipment workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              {heading.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{heading.description}</p>
          </header>

          {isSupportStaff ? (
            // Keyed so moving between sections starts each one fresh.
            <TechnicalSupportEquipment key={section} section={section} />
          ) : (
            <CoordinatorEquipmentCatalogue canRequest={canRequestEquipment(profile?.role)} />
          )}
        </div>
      </div>
    </RoleGate>
  );
}

/**
 * The read-only catalogue for event organisers/coordinators — the only roles
 * that currently land on /equipment. Rendered only inside RoleGate's
 * children, so a blocked role never triggers the fetch.
 */
function CoordinatorEquipmentCatalogue({ canRequest }: { canRequest: boolean }) {
  const { user } = useAuth();
  const [choosingEvent, setChoosingEvent] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<EquipmentFilterValues>(() => ({
    category: searchParams.get("category") ?? "",
    showRetired: searchParams.get("showRetired") === "1",
  }));
  const [items, setItems] = useState<EquipmentCatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    listEquipmentCatalogue()
      .then((result) => {
        if (active) setItems(result);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "We couldn't load the equipment catalogue.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Kept in the URL so it's still there when the user navigates away and back.
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    if (filters.category) params.set("category", filters.category);
    if (filters.showRetired) params.set("showRetired", "1");
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filters]);

  if (error) {
    return (
      <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </p>
    );
  }

  if (loading) {
    return (
      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-200/70 motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  return (
    <>
      <EquipmentCatalogue
        items={items}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filters={filters}
        onFiltersChange={setFilters}
        action={
          canRequest ? (
            <Button type="button" size="sm" onClick={() => setChoosingEvent(true)}>
              <FilePlus2 /> Add equipment
            </Button>
          ) : undefined
        }
      />
      {choosingEvent && user && (
        <ChooseEquipmentEventDialog coordinatorId={user.id} onCancel={() => setChoosingEvent(false)} />
      )}
    </>
  );
}
