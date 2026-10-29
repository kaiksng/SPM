import type { EquipmentCatalogueItem } from "@/features/event-requests/services/equipment";

/**
 * Catalogue items grouped by category (AC02) — no free-text entry. Shared by
 * EventRequestForm and the Equipment page's request dialog.
 */
export function EquipmentSelect({
  value,
  groups,
  placeholder,
  disabled,
  invalid,
  onChange,
}: {
  value: string;
  groups: Array<{ category: string; items: EquipmentCatalogueItem[] }>;
  placeholder: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (equipmentItemId: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-invalid={invalid}
      className="border-input h-9 w-full rounded-lg border bg-white px-2.5 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-red-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">{placeholder}</option>
      {groups.map((group) => {
        // A retired item is offered only to the row that already uses it.
        const options = group.items.filter((item) => !item.retired || item.id === value);
        return options.length === 0 ? null : (
          <optgroup key={group.category} label={group.category}>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.retired ? `${item.name} (no longer offered)` : item.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
