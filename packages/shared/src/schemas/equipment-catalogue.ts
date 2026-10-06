import { z } from "zod";

import { isPositiveWholeNumber } from "./equipment-unavailability";

/**
 * Catalogue item fields, mirroring public.clean_equipment_item_fields
 * (202610060002), which is authoritative.
 */
export const equipmentItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name")
    .max(120, "Name must contain at most 120 characters"),
  category: z
    .string()
    .trim()
    .min(1, "Enter a category")
    .max(60, "Category must contain at most 60 characters"),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers or single hyphens (e.g. mic)",
    )
    .max(20, "Code must contain at most 20 characters"),
});

export type EquipmentItemFormValues = z.input<typeof equipmentItemSchema>;

/** How many units to add at once; matches the database's 1-1000 limit. */
export const equipmentUnitCountSchema = z
  .string()
  .trim()
  .refine(
    (value) => isPositiveWholeNumber(value) && Number(value) <= 1000,
    "Enter between 1 and 1000",
  );

/** A new item may start with no units. */
export const equipmentInitialUnitsSchema = z
  .string()
  .trim()
  .refine(
    (value) => /^\d+$/.test(value) && Number(value) <= 1000,
    "Enter between 0 and 1000",
  );

/** "mic" + 3 -> "mic-3": the ID a physical unit is labelled with. */
export function equipmentUnitLabel(code: string, unitNumber: number) {
  return `${code}-${unitNumber}`;
}
