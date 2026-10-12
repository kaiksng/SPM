-- SPM-83: a venue block now carries a reason category alongside its
-- free-text reason (which remains the block's description). Rows created
-- before this story become 'other'.
create type public.venue_block_reason_category as enum (
  'maintenance',
  'equipment_failure',
  'renovation',
  'safety',
  'other'
);

alter table public.venue_unavailability
  add column reason_category public.venue_block_reason_category not null default 'other';
