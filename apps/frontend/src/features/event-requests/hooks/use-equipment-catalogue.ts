import { useEffect, useState } from "react";

import {
  loadEquipmentCatalogue,
  type EquipmentCatalogueItem,
} from "@/features/event-requests/services/equipment";

/** The equipment catalogue, grouped by category in catalogue order (AC02). */
export function useEquipmentCatalogue() {
  const [items, setItems] = useState<EquipmentCatalogueItem[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    loadEquipmentCatalogue()
      .then((catalogue) => {
        if (active) setItems(catalogue);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "The equipment catalogue is unavailable. Try again.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const groups: Array<{ category: string; items: EquipmentCatalogueItem[] }> = [];
  for (const item of items) {
    const category = item.category ?? "Other";
    const group = groups.find((existing) => existing.category === category);
    if (group) group.items.push(item);
    else groups.push({ category, items: [item] });
  }

  return { groups, error };
}
