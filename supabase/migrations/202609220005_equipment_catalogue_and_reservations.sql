-- Equipment Request Management (fulfilment side) + Equipment Availability
-- Checking + Equipment Reservation. event_equipment_requirements already
-- records what an event needs; this is what's actually been reserved for it.
create table public.equipment_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  category text,
  total_quantity integer not null check (total_quantity >= 0),
  notes text
);

create table public.equipment_reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  equipment_item_id uuid not null references public.equipment_items (id),
  quantity integer not null check (quantity > 0),
  requested_by uuid not null references public.profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.request_status not null default 'pending',
  decided_by uuid references public.profiles (id),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint equipment_reservations_time_order check (ends_at > starts_at)
);

create index equipment_reservations_event_idx on public.equipment_reservations (event_id);
create index equipment_reservations_item_idx on public.equipment_reservations (equipment_item_id, status);

alter table public.equipment_items enable row level security;
alter table public.equipment_reservations enable row level security;

create policy "equipment items readable by authenticated users" on public.equipment_items
for select to authenticated using (true);
create policy "equipment items managed by technical support staff" on public.equipment_items
for all to authenticated
using (public.current_user_role() in ('technical_support_staff', 'administrator'))
with check (public.current_user_role() in ('technical_support_staff', 'administrator'));

create policy "equipment reservations visible to participants" on public.equipment_reservations
for select to authenticated
using (public.can_view_event(event_id) or public.current_user_role() in ('technical_support_staff', 'administrator'));

create policy "coordinators request equipment reservations" on public.equipment_reservations
for insert to authenticated
with check (
  requested_by = auth.uid()
  and public.current_user_role() in ('event_coordinator', 'administrator')
  and public.can_view_event(event_id)
);

create policy "technical support staff decide equipment reservations" on public.equipment_reservations
for update to authenticated
using (public.current_user_role() in ('technical_support_staff', 'administrator'))
with check (public.current_user_role() in ('technical_support_staff', 'administrator'));
