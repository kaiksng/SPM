# Sprint 3 traceability: SPM-83 Mark a Venue Unavailable When Bookings Exist

Source: Jira export `SPM List - Jira (2).csv` (12 October 2026) and the Week 7 customer change "Venue Becomes Unavailable After Booking". Implementation and local test references only; shared-environment UAT has not been run. Reverses the SPM-19 rule that rejected a block overlapping a booking.

Design: a disruption is a flag in `venue_booking_disruptions` (one row per booking and block) alongside the booking; booking, event and approval statuses and histories are not changed. Overlap is each booking's effective window (`venue_effective_window`, includes the venue's setup and turnaround) against the block's own period.

| Acceptance criterion | Implementation | Verification |
| --- | --- | --- |
| Record unavailability with venue, reason category, description, start, end | `reason_category` enum and column (`202610120001`), `create_venue_block`, `VenueBlocksPage`, `venue-block.ts` | `venue-block.test.ts`, `VenueBlocksPage.test.tsx`, `venue-blocks.test.ts`, pgTAP `spm83_venue_block_disruptions` |
| Saved even if it overlaps Pending or Approved bookings | `create_venue_block` (`202610120004`) | pgTAP, `spm19_spm21_venue_blocks_search` |
| Each overlapping Pending, Approved booking and active hold is flagged Disrupted - Alternative Required; nothing cancelled; event status unchanged | `venue_booking_disruptions`, `venue_block_affected_bookings` | pgTAP (statuses, history, expired/rejected excluded) |
| End required and after start; shorten or remove; cleared flag and "issue cleared" notice | `update_venue_block`, `remove_venue_block`, `clear_block_disruptions`; shorten dialog | pgTAP (shorten, extend refused, remove), `VenueBlocksPage.test.tsx` |
| Disrupted booking makes the event Not Ready for the safety check | **Out of scope: enforced in SPM-33.** The flag is queryable for it | none here |
| Venue Staff see affected bookings when saving; must confirm | `preview_venue_block_impact`, `AffectedBookingsDialog` | pgTAP, `VenueBlocksPage.test.tsx`, `venue-blocks.test.ts` |
| Notification for the assigned coordinator of each affected event, one per event, with the required content | `create_venue_block`, `venue_booking_disrupted` type (`202610120002`) | pgTAP (recipient, count, message content) |
| New booking requests for the unavailable period are refused | Existing SPM-19 rule (`check_booking_against_blocks`, availability check) | pgTAP |
| Overlap uses setup and turnaround | `venue_effective_window` in `venue_block_affected_bookings` | pgTAP (Approved booking ending exactly at block start is flagged) |
| Coordinators see their events with affected bookings: Replacement Required, Requested, Resolved | `AffectedVenueBookings`, `venue-disruptions.ts`, `deriveVenueDisruptionState`; RLS on the disruptions table | `EventsPage.test.tsx`, `venue-disruptions.test.ts`, `venue-disruption.test.ts`, pgTAP (visibility by role). Requested becomes reachable with SPM-82 |
| Disrupted while Pending Safety Check: event returns to Planning and the Safety Officer is notified | `create_venue_block` | pgTAP, by setting the event status directly (nothing moves events into that status until SPM-90) |
| Coordinator told the issue is cleared if no replacement has been approved | `clear_block_disruptions` notifies whenever the booking is still active; the "replacement approved" exception is added with SPM-82 | pgTAP |

## Known limits

- A pending or on-hold booking that overlaps an active block cannot be approved or confirmed (`check_booking_against_blocks` is a raw-time trigger); venue staff must clear the block or the coordinator must replace the booking.
- A block over a booking's setup or turnaround time only (not the event itself) still flags the booking, by design.
- The migrations `202610120001`–`202610120004` have not been applied to the shared environment; the database owner applies them.
