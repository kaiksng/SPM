# Sprint 2 traceability: SPM-19 and SPM-21

Source: Jira export `SPM List - Jira.csv`, stories SPM-19 and SPM-21 (27 September 2026). These are implementation and local test references, not a claim that shared-environment UAT has passed.

| Story | Jira acceptance criteria and scenario | Implementation | Verification |
| --- | --- | --- | --- |
| SPM-19 | Venue Staff creates a block with venue, reason, start, end; invalid or missing fields identify the field; end must follow start | `VenueBlocksPage.tsx`, `venue-block.ts`, `venue-blocks.ts`, `create_venue_block` in `202609270004_spm19_venue_blocks.sql` | Shared validation tests, block page tests, database pgTAP |
| SPM-19 | Overlap with Pending or Confirmed booking rejects the block and identifies the conflict | `create_venue_block` checks active bookings after locking the venue row | Database pgTAP passed; concurrent transaction verification still required |
| SPM-19 | Saved block appears as Blocked in availability and rejects new overlapping bookings | `venue-availability.ts`, `check_booking_against_blocks` trigger, `submit_venue_booking_request` | Calendar component tests and database pgTAP passed; shared-environment journey still required |
| SPM-19 | Remove a block when it no longer applies; current and past blocks remain in history | `remove_venue_block` retains row with `removed_at` and `removed_by`; page shows active, past, and removed history; active reads exclude removed blocks | Block page tests and database pgTAP passed; shared-environment journey still required |
| SPM-21 | Date/time and capacity always required; optional location, layout, facilities, accessibility become mandatory when specified | `venue-search.ts`, `ManualVenueSearch`, `search_available_venues` in `202609270005_spm21_manual_venue_search.sql` | Shared schema tests, block page tests, database pgTAP |
| SPM-21 | Return only venues meeting all specified filters and open for the whole period; exclude overlapping Pending/Approved bookings and active blocks | `search_available_venues`; SPM-72 `find_matching_venues` remains a separate suggestion query | Database pgTAP passed; shared-environment journey still required |
| SPM-21 | Show relevant venue details and availability, plus a clear empty state | Search result cards with Available badge and “No matching venue was found” state | Frontend component tests; desktop/mobile browser review still required |

## Cross-story behavior

- The coordinator may browse search results while the event has an active request. Search never edits event requirements or schedule. A result for different dates is review-only.
- Venue detail verifies current availability before showing the request action. `submit_venue_booking_request` checks again when submitted, and the booking trigger enforces active-block conflicts even for other booking write paths.
- SPM-72 suggestions can show unavailable venues with status badges. Their capacity rule uses the stricter of attendance and saved minimum capacity. Both suggestions and the SPM-20 calendar ignore removed blocks.
- Existing test accounts cover Venue Staff and Event Coordinator. No new role is required.

## Handoff status

After merging Main, `pnpm check` passed locally on 27 September 2026: shared, frontend, and backend typechecks; 100 shared, 64 backend, and 155 frontend tests; frontend and backend builds. A clean local Supabase reset applied all migrations through `202609270007`, and `pnpm db:test` passed all 318 tests across 19 files. The local database was backed up before the reset to `/Users/kaiks/.local/share/spm-backups/local-before-main-merge-20260927-schema.sql` and `local-before-main-merge-20260927-data.sql`. Main's `202609270001`–`202609270003` migrations were already applied to the shared environment, so the four SPM-19/21 migrations were renumbered `202609270004`–`202609270007` for the merge. A shared database dry run listed exactly those four pending migrations; the database owner must apply them before shared-environment UAT. Record commit, environment, tester, date, and evidence for the save → calendar → search → rejected booking → remove → released availability journey, including a concurrent block/booking attempt and desktop/mobile views.

### Area and amenity update (1 October 2026)

Organiser preferred areas and coordinator search use the same 67 choices. Venue Staff retain a venue's address and add one or more area tags. Matching uses tags for reviewed venues and temporarily searches address text for untagged venues; tags are never guessed from addresses. The Venue Staff catalogue accepts zero amenities, and both catalogue and coordinator search use the shared 11-amenity list. Existing free-text event values and legacy venue facility tags remain visible when edited. Database migration `202610010003_event_dropdown_areas_amenities.sql` needs database-owner deployment before shared-environment journeys can verify this behavior. New local test evidence belongs to this update, not to the earlier handoff above.

The catalogue read temporarily retries without `area_tags` when the linked database reports that exact missing column. Venue saves stop with an explicit migration message until tags can be persisted. The linked project already records `202609280001`, `202610010001`, and `202610010002` migrations absent from this checkout; its migration history must be reconciled with the database owner before a shared push.

Venue Staff now select one Location from the organiser's area list. An optional Address field preserves existing building or street detail; the selected location is saved as the venue's area tag. Venue Staff may also type a new supported room layout, which is stored with the venue and appears in organiser and coordinator layout choices. This requires `202610010004_custom_room_layouts.sql` after the area migration. The Planning event's Venue & facilities box no longer asks for minimum capacity; a previously saved value remains in storage and in matching until the team explicitly migrates that legacy requirement. Manual venue search still requires a capacity filter and defaults it from expected attendance.
