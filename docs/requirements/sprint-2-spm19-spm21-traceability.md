# Sprint 2 traceability: SPM-19 and SPM-21

Source: Jira export `SPM List - Jira.csv`, stories SPM-19 and SPM-21 (27 September 2026). These are implementation and local test references, not a claim that shared-environment UAT has passed.

| Story | Jira acceptance criteria and scenario | Implementation | Verification |
| --- | --- | --- | --- |
| SPM-19 | Venue Staff creates a block with venue, reason, start, end; invalid or missing fields identify the field; end must follow start | `VenueBlocksPage.tsx`, `venue-block.ts`, `venue-blocks.ts`, `create_venue_block` in `202609270001_spm19_venue_blocks.sql` | Shared validation tests, block page tests, database pgTAP |
| SPM-19 | Overlap with Pending or Confirmed booking rejects the block and identifies the conflict | `create_venue_block` checks active bookings after locking the venue row | Database pgTAP passed; concurrent transaction verification still required |
| SPM-19 | Saved block appears as Blocked in availability and rejects new overlapping bookings | `venue-availability.ts`, `check_booking_against_blocks` trigger, `submit_venue_booking_request` | Calendar component tests and database pgTAP passed; shared-environment journey still required |
| SPM-19 | Remove a block when it no longer applies; current and past blocks remain in history | `remove_venue_block` retains row with `removed_at` and `removed_by`; page shows active, past, and removed history; active reads exclude removed blocks | Block page tests and database pgTAP passed; shared-environment journey still required |
| SPM-21 | Date/time and capacity always required; optional location, layout, facilities, accessibility become mandatory when specified | `venue-search.ts`, `ManualVenueSearch`, `search_available_venues` in `202609270002_spm21_manual_venue_search.sql` | Shared schema tests and database pgTAP passed; complete filter browser journey still required |
| SPM-21 | Return only venues meeting all specified filters and open for the whole period; exclude overlapping Pending/Approved bookings and active blocks | `search_available_venues`; SPM-72 `find_matching_venues` remains a separate suggestion query | Database pgTAP passed; shared-environment journey still required |
| SPM-21 | Show relevant venue details and availability, plus a clear empty state | Search result cards with Available badge and “No matching venue was found” state | Frontend component tests; desktop/mobile browser review still required |

## Cross-story behavior

- The coordinator may browse search results while the event has an active request. Search never edits event requirements or schedule. A result for different dates is review-only.
- Venue detail verifies current availability before showing the request action. `submit_venue_booking_request` checks again when submitted, and the booking trigger enforces active-block conflicts even for other booking write paths.
- SPM-72 suggestions can show unavailable venues with status badges. Their capacity rule uses the stricter of attendance and saved minimum capacity. Both suggestions and the SPM-20 calendar ignore removed blocks.
- Existing test accounts cover Venue Staff and Event Coordinator. No new role is required.

## Handoff status

`pnpm check` passed locally on 27 September 2026: shared, frontend, and backend typechecks; 100 shared, 56 backend, and 150 frontend tests; frontend and backend builds. A clean local Supabase reset applied migrations `202609270001` through `202609270004`, and `pnpm db:test` passed all 261 tests across 16 files. The prior local database state was backed up to `/Users/kaiks/.local/share/spm-backups/local-before-reset-20260927.dump` before the reset. The database owner must apply the four migrations to the shared environment before UAT. Record commit, environment, tester, date, and evidence for the save → calendar → search → rejected booking → remove → released availability journey, including a concurrent block/booking attempt and desktop/mobile views.
