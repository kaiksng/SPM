-- Add the Safety Officer role (Week 7 customer change #6, Operational
-- Feasibility Check). This migration only adds the enum value — the real
-- Operational Safety Check workflow (new event status, decide-RPC, RLS
-- visibility grants) is a separate, later change once venue/technical
-- "confirmation" itself exists to gate.
alter type public.user_role add value 'safety_officer';
