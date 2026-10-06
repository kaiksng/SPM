# Equipment units and catalogue management — contract

Requested by the product owner on 2026-10-06, as an addition to SPM-30.

## What changed

- **Every physical unit is tracked.**
  - Each catalogue item has a short code (`mic`, `proj`, `tv`…), and units are numbered under it: `mic-1` … `mic-100`.
  - `equipment_items.total_quantity` is now the number of in-service (not retired) units. A trigger keeps it in sync, so it can't be set by hand. Everything that already reads `total_quantity` keeps working.
- **Every item starts with 100 units.** This overwrote any stock figures entered before.
- **Technical Support Staff manage the catalogue.** They can:
  - add an item (name, category, code, number of units);
  - edit an item's name, category or code;
  - add units, numbered after the highest existing one;
  - retire or restore a single unit;
  - retire or restore a whole item.
- **Retired items.**
  - A retired item is no longer offered in organiser/coordinator equipment dropdowns, or in the unavailability form.
  - Events already using it keep it, shown as "(no longer offered)".
  - The database refuses a *new* choice of a retired item.
- **SPM-30 outages can name exact units.**
  - When units are named, the record's quantity is the number of units.
  - A unit can't be out for two overlapping records.
  - Recording just a quantity still works, as SPM-30 AC01 requires.

## Database (`202610061000_equipment_units_and_catalogue_management.sql`)

- **`equipment_items`** gains `code` (unique, lowercase letters/numbers/single hyphens, at most 20 characters), `retired_at` and `retired_by`. Names are unique, ignoring case.
- **`equipment_units`** holds `equipment_item_id`, `unit_number` (unique per item), and `created_*`/`retired_*`. A unit's label is `code-unit_number`, worked out when shown, so changing an item's code relabels all its units.
- **`equipment_unavailability_units`** links an unavailability record to the units it names.
- **Management functions:** `create_equipment_item`, `update_equipment_item`, `add_equipment_units` (1–1000 at a time), `set_equipment_unit_retired`, `set_equipment_item_retired`. Each checks for the Technical Support Staff role.
- **`record_equipment_unavailability`** gains an optional `p_unit_ids`.
- **`guard_event_equipment_requirement`** (from `202610050004`) now refuses a newly chosen retired item.
- **Read access:** Technical Support Staff only, for units and unit links.

## Page (`/equipment`, Technical Support Staff)

- **Summary cards:** equipment types, available now, out of service now, retired types.
- **Inventory tab:**
  - search by name, code or unit ID (e.g. `mic-12`);
  - category filter and a "Show retired" toggle;
  - items grouped by category, each showing available / out now / in service, with Edit and Retire;
  - expand an item to see every unit by ID, filter units by status, retire or restore one, or add more.
- **Unavailability tab:** the SPM-30 form, now with an optional unit picker (units already out for the period are greyed out), plus the record history, which shows any units named.

## Tests

- `supabase/tests/database/equipment_units_and_catalogue_management.test.sql` (28 checks).
- `packages/shared/src/schemas/equipment-catalogue.test.ts`.
- `apps/frontend/src/routes/EquipmentPage.test.tsx`.
