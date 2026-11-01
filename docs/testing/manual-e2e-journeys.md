# ConnectSphere: follow-along testing guide

This guide walks you through **five critical end-to-end journeys** on the ConnectSphere website. You do not need to have used the site before. Each part tells you which person to sign in as, what to click, and what you should see.

## What end-to-end testing means here

An end-to-end (E2E) test uses the real website, backend and database, the way real people do. Several people with different roles hand work to each other, and you check that every handoff gives the result the requirements promise. It is different from a unit test, which checks one piece of code, and from an integration test, which checks the backend and database without a browser.

The expected results in this guide come from the **requirements** (the Jira stories and the Week 7 customer changes), not from what the code happens to do. Each check names the story it proves, such as `(SPM-87 AC02)`. If the website behaves differently from the expected result, that is a failure to report even if it looks reasonable.

| Journey | Business flow | Main requirements it proves |
| --- | --- | --- |
| [1. Plan an event and register an attendee](#flow-1-plan-an-event-and-register-an-attendee) | Request → assignment → venue and equipment → safety approval → registration | SPM-2, 3, 7, 24, 25, 27, 32, 33, 40, 41, 80, 81, 90 |
| [2. Buffer conflict](#flow-2-buffer-conflict--setup-and-turnaround-time-block-a-second-booking) | Setup and turnaround time block a second booking; cancelling frees it | SPM-20, 26, 45, 86, 87 |
| [3. Change a confirmed event](#flow-3-change-a-confirmed-event) | Request a change → review → apply → safety approval again | SPM-38, 39, 33, 90 |
| [4. Replace an unavailable venue](#flow-4-replace-an-unavailable-venue) | Record a venue problem → arrange a replacement → safety approval again | SPM-19, 82, 83 |
| [5. Cancel an event](#flow-5-cancel-an-event) | Cancel → release resources → inform the affected people | SPM-45, 76, 11 |

All five are high priority. They test whether a complete business process works across different people, rather than every field or button.

**These journeys have not been executed.** Ask Kai Kin for the shared password, then follow the journeys in order. You do not need to set up the database or create accounts yourself.

## Rules for the shared staging site

These journeys run on the team's **shared staging site**, which uses the shared database. Other teammates' work lives there, so be careful.

- **Use the exact event names in the table below.** Type them exactly as written, with the same capital letters and spacing. They are fixed so everyone follows the same script and your records are easy to recognise.
- **Check the name is free first.** Before creating an event, open **Events** and look for that name. If a previous run left one behind, add ` 2` to the end (for example `Year-End Team Planning Meeting 2`) and use that longer name everywhere in the journey, including searches.
- **Only touch the events you created in this run.** Never edit, cancel or remove anything else, even if its name looks similar.
- **Never create accounts** in the website or the database. Use the supplied accounts only.
- **Use only the venues and equipment named in the Fixed test data table.** Never change a venue's setup/turnaround time, capacity or equipment stock.
- **Clean up at the end of every journey** with the steps in its Finish section. Cancelling frees the venue and equipment, but history stays. Record anything you could not clean up.
- **Do not run database commands** (`supabase db push`, migration repair, SQL). If the website looks out of date or a page errors in a way that suggests a missing update, mark the step **Blocked** and tell the team.
- **Do not run two testers on the same venue and date.** Agree separate dates first. Each journey has its own date so they do not clash.

### Event names to type

| Journey | Type this in **Event name** | Notes |
| --- | --- | --- |
| 1 | `Year-End Team Planning Meeting` | Registration required, 20 people |
| 2, first event | `Product Launch Briefing` | 10:00–12:00 |
| 2, second event | `Sales Kickoff Workshop` | 12:30–14:00, later moved to 13:15–15:00 |
| 3 | `Quarterly Strategy Review` | Attendance 20, later changed to 30 |
| 4 | `Department Planning Retreat` | Also used in the maintenance block reason |
| 5 | `Customer Feedback Roundtable` | One attendee registers |

In every journey, use the same **Description** unless the step says otherwise: `Meeting arranged for end-to-end testing of ConnectSphere.`

### Fixed test data

These were checked against the staging database on 1 November 2026 (see `e2e-preflight-check.sql`). Use them exactly. Every journey uses the same venue on a **different date**, so journeys never clash with each other.

| Item | Use this |
| --- | --- |
| Main venue (all journeys) | **Grand Auditorium** (City Hall, capacity 500, Theatre layout, step-free, setup 30 min, turnaround 45 min, open 08:00–22:00 every day) |
| Replacement venue (Journey 4) | **Central Civic Hall** (Central Area, capacity 300, Theatre layout, step-free, open 08:00–22:00 every day) |
| Equipment (Journeys 1, 3, 4, 5) | **Projector** (category Visual, 100 units in service) |
| Event form: Preferred location | `City Hall` |
| Event form: Room layout | `Theatre` |
| Event form: Accessibility needs | `Step-free access` |
| Journey 1 date | Monday 16 November 2026 |
| Journey 2 date | Tuesday 17 November 2026 |
| Journey 3 date | Wednesday 18 November 2026 |
| Journey 4 date | Thursday 19 November 2026 |
| Journey 5 date | Friday 20 November 2026 |
| Registration **Opens** (Journeys 1 and 5) | One hour before the moment you click **Save**, today's date, Singapore time (at 14:30 type 13:30) |
| Registration **Closes** (Journeys 1 and 5) | 09:00 on that journey's event date |

**If you run a journey a second time,** add 7 days to its date (for example Journey 1 moves to Monday 23 November) so it cannot clash with the first run's leftover bookings. If someone else has already booked Grand Auditorium on your date, the venue page will say it is already occupied; move to the same weekday one week later.

## Before you start

### Get the website and accounts

Website to use: ____________________

Use exactly these accounts. **The password is the same for every account and is not written in this file: ask Kai Kin for it.** Do not paste it into screenshots, tickets or chat channels.

| Role | Responsibility in these journeys | Account email | Name shown in the system |
| --- | --- | --- | --- |
| Event Organiser | Requests the event and any changes | jasmine@gmail.com | Jasmine |
| Event Coordinator Lead | Assigns the event to a coordinator | tom@gmail.com | Tom |
| Event Coordinator | Plans and manages the event | joyce@gmail.com | Joyce |
| Venue Staff | Approves bookings and records venue problems | daryl@gmail.com | Daryl |
| Technical Support Staff | Reserves equipment | andy@gmail.com | Andy |
| Safety Officer | Reviews and approves the event's arrangements | sally@gmail.com | Sally |
| Attendee | Registers for the event | joseph@gmail.com | Joseph |

Use these in every journey, including the Lead's **Coordinator** choice (pick **Joyce**). The name in the last column is how you should see the person's name in the initials-button menu and in dropdowns; if it is written differently (for example with a surname), it is still the same person as long as the email matches.

Spare accounts, only if the guide tells you to use a second person or an account is in use by another teammate: organiser kenneth@gmail.com, coordinator jonathan@gmail.com, venue staff keith@gmail.com, technical support benny@gmail.com, attendees daniel@gmail.com and bernard@gmail.com. Two teammates must never be signed in to the same account at the same time in different journeys, so agree who uses which journey first (one tester per journey date).

### Keep each person's login separate

Use a separate browser profile or separate browser for each account. Label them with the role names above. **Two tabs in the same browser profile share a login**, so do not use them for different roles.

To sign in:

1. Open the supplied website in that person's browser profile.
2. Open the sign-in page. If necessary, add `/login` to the website address.
3. Enter the supplied email and password.
4. Click **Sign in**.
5. Open the round initials button. Check that the displayed name, email and role match the person you intend to use.

Whenever this guide says **Switch to...**, move to that person's browser profile and check their identity. You can leave the other profiles signed in.

To sign out, open the initials button and click **Sign out**. To refresh a page, use the browser's reload button.

### Get a starting sheet for each journey

Copy and fill in this sheet **separately for each journey**. Blank values mean the journey is not ready to start. Use the event name for that journey from the **Event names to type** table.

| Information | Value for this journey |
| --- | --- |
| Journey number | |
| Exact test event name (copy from the table; add ` 2` if the name was already taken) | |
| Event date (from the Fixed test data table; add 7 days if re-running) | |
| Registration opens and closes (Journeys 1 and 5; from the Fixed test data table) | |
| Grand Auditorium availability page link: **Venues → Grand Auditorium → View availability** | |
| Grand Auditorium Manage blocks page link (Journey 4 only): **Venues → Grand Auditorium → Manage blocks** | |

As you open the event's pages, copy their addresses here. These links make it easy to return to the right event in each person's browser.

| Link to save during preparation/execution | Page address |
| --- | --- |
| Event details | |
| Event's Venue page | |
| Event's Equipment page | |
| Event's Safety Check page | |
| Attendee's event page | |

**Before the first journey, one person confirms:**

- [ ] The staging website is running the latest code, and the database updates it needs are installed. Nobody has run `db push` or repaired migration history to make this true.
- [ ] The accounts in the table above sign in and show the stated role.
- [ ] **Grand Auditorium** still shows setup **30** and turnaround **45** minutes, and has no bookings, holds or blocks on the journey's date. **Central Civic Hall** is free on Journey 4's date.
- [ ] The **Projector** still has at least 4 units in service and none reserved by other events on the journey's date.
- [ ] Nobody has started creating events with the six names in the table. If someone has, the " 2" rule applies.
- [ ] Re-run `e2e-preflight-check.sql` if more than a few days have passed since 1 November 2026.
- [ ] Each journey has its own new event(s) and a non-conflicting venue and date allocation.
- [ ] The team knows who will remove or archive the leftover test records afterwards.

If setup is missing, mark **Blocked — setup needed** and return the sheet to the preparer. Do not choose a random replacement account or venue.

### If something goes wrong

Stop at the first unexpected result. Take a screenshot and record the **journey, part, step number, account role and visible message**. Do not try to force the event into the next stage.

Use **Fail** when the prepared system behaves incorrectly, or **Blocked** when missing setup/access prevents execution. A step you did not perform has not passed. Keep passwords and unrelated people's information out of screenshots.

## Flow 1: Plan an event and register an attendee

**Purpose:** Take one event from a draft request to a Confirmed event with a Registered attendee.

**Before starting:** complete the starting sheet. Use the name `Year-End Team Planning Meeting`. There must not already be an event with that name. You will use all seven roles.

### Part A — Organiser: create and submit the request

1. Switch to **Event Organiser**.
2. Click **Events** in the navigation.
3. Click **New event**.
4. Type `Year-End Team Planning Meeting` in **Event name**.
5. Click **Save draft**.\
   **You should see:** your event in Events with a **Draft** label.
6. Refresh the page, then click **Continue editing** on that event.\
   **You should see:** the saved event name is still there.
7. Complete the form:

   | Field | What to enter |
   | --- | --- |
   | Purpose | Meeting |
   | Description | Meeting arranged for end-to-end testing of ConnectSphere. |
   | Expected attendance | 20 |
   | Starts | Journey 1 date (Monday 16 November 2026), 10:00 |
   | Ends | The same date, 12:00 |
   | Preferred location | City Hall |
   | Room layout | Theatre |
   | Required facilities | Leave empty |
   | Accessibility needs | Step-free access |
   | Equipment requirements | Leave empty for now |
   | Attendee registration is required | Tick this box |

8. Click **Submit request**.\
   **You should see:** **Requested**, a submission date/time, and a message that the event is awaiting coordinator assignment. A coordinator should not already be assigned automatically.
9. Click **View details** on your event. Save this page address on the starting sheet.\
   **You should see:** the name, attendance, date and times you entered.

**Capture:** a screenshot of the Requested event awaiting assignment.

### Part B — Lead: assign a coordinator

1. Switch to **Event Coordinator Lead**.
2. Click **Events**.
3. Click **Unassigned queue**. The tab may also show a count.
4. Find `Year-End Team Planning Meeting` and click **Assign coordinator** on it.
5. In **Coordinator**, choose the coordinator's display name from the account table.
6. Click **Assign coordinator** in the dialog.\
   **You should see:** the event leaves the unassigned queue.
7. Click **Oversight** and find the event.\
   **You should see:** the event under the coordinator you selected.

### Part C — Coordinator: approve the request for planning

1. Switch to **Event Coordinator**.
2. Click **Events**, find your event and click **View details**.\
   **You should see:** the Requested event, assigned to you, with the organiser's details.
3. Click **Approve** in the request review area.
4. Click **Approve event** in the dialog. Optional notes can be left empty.\
   **You should see:** **Planning**. The event is not yet Confirmed.
5. Switch to **Event Organiser** and refresh the saved event page.\
   **You should see:** Planning and the correct coordinator.
6. Open the **Notifications** bell.\
   **You should see:** an approval notification for your event.

### Part D — Organiser: set registration rules

1. Stay in the **Event Organiser** profile and open the saved event page.
2. Scroll to **Registration** and click **Edit** in that section.
3. Enter these settings:

   | Setting | What to enter |
   | --- | --- |
   | Attendee registration is required | Ticked |
   | Opens (Singapore time) | One hour before you click **Save**, today's date (for example 13:30 if it is 14:30) |
   | Closes (Singapore time) | 16 November 2026, 09:00 |
   | Capacity | 20 |
   | Waiting list | Yes |
   | Attendees may withdraw | Yes |

4. Click **Save** in the Registration section.
5. Refresh the page.\
   **You should see:** the saved settings. The event remains Planning.

### Part E — Coordinator and Venue Staff: arrange the venue

1. Switch to **Event Coordinator** and open the saved event page.
2. Click **Venue** in the event's planning navigation. Save this page address on the starting sheet.
3. Under **Suggested venues**, find **Grand Auditorium** and click its **View details**.

   If it is not shown, click **Search venues**. Keep the event's date, 10:00–12:00, minimum capacity 20, Location City Hall and Room layout Theatre. Click **Search venues**, then open **Grand Auditorium**'s **View details**. If it is still unavailable, stop and report it.

4. Check the venue name and requested event period, then click **Request venue**.\
   **You should see:** a **Pending** request for your event and Grand Auditorium.
5. Switch to **Venue Staff**.
6. Click **Requests** in the navigation.
7. Find and select the request for `Year-End Team Planning Meeting` and Grand Auditorium.
8. Click **Approve**.
9. Click **Approve request** in the dialog.\
   **You should see:** the venue request is approved.
10. Switch back to **Event Coordinator** and refresh the saved Venue page.\
    **You should see:** the approved booking, marked as the main venue. The event itself remains Planning.

**Capture:** the approved main venue booking. Venue approval and event confirmation are different stages.

### Part F — Coordinator and Technical Support: arrange equipment

1. In the **Event Coordinator** profile, click **Equipment** in the event navigation. Save this page address.
2. Click **Add equipment**.
3. Select **Projector**.
4. Set **Quantity** to `2`.
5. Enter **Technical requirements** as `Place beside the presentation area without blocking access`.
6. Check that **Required period** is Journey 1's date (Monday 16 November 2026), 10:00–12:00.
7. Click **Add equipment** in the dialog.\
   **You should see:** the item on the event, but it has not yet been requested from Technical Support.
8. Click **Request equipment**.
9. Select the checkbox for your equipment item.
10. Click **Request 1 item**.\
    **You should see:** the item is now requested. Adding it alone did not send it to Technical Support.
11. Switch to **Technical Support Staff**.
12. Click **Event requests** and search for `Year-End Team Planning Meeting`.
13. On that equipment row, click **Reserve**.
14. Set **Quantity to reserve** to `2`.
15. Click **Reserve** in the dialog.\
    **You should see:** 2 units reserved and the arrangement marked **Arranged**.
16. Switch back to **Event Coordinator** and refresh the saved Equipment page.\
    **You should see:** the same item and 2 reserved units.

**Capture:** the equipment and reserved quantity as seen by the coordinator.

### Part G — Coordinator and Safety Officer: confirm the event

1. In the **Event Coordinator** profile, click **Safety Check**. Save this page address.
2. Read the readiness list.\
   **You should see:** the main venue and equipment are complete, registration settings are complete, and the event is **Ready**. Stop if an outstanding problem is listed.
3. Click **Submit for Safety Check**.\
   **You should see:** **Pending Safety Check**.
4. Switch to **Safety Officer**.
5. Click **Safety Checks**, then **Awaiting review**.
6. Find your event and click **Review event**.
7. Read the arrangements.\
   **You should see:** attendance 20, venue capacity 500, layout/accessibility information, and the requested equipment/placement note. These event facts are read-only for the Safety Officer.
8. Click **Approve**.
9. Enter `Reviewed for the manual event journey` in **Note (optional)**.
10. Click **Confirm approval**.\
    **You should see:** the decision succeeds and the event leaves the awaiting-review queue.
11. Switch to **Event Coordinator** and refresh the saved event page.\
    **You should see:** **Confirmed**.
12. Switch to **Event Organiser** and refresh the saved event page.\
    **You should see:** the same Confirmed event, schedule and arrangements.
13. In each of those two accounts, open **Notifications**.\
    **You should see:** the safety approval/confirmation notification for this event.

**Capture:** the Confirmed event and its arrangements.

### Part H — Attendee: register and check the saved result

1. Switch to **Attendee**.
2. Click **Browse Event** in the navigation.
3. Find `Year-End Team Planning Meeting` and open its event page. Save this page address.
4. Read the details.\
   **You should see:** the confirmed date, times and venue. Registration is open with 20 remaining places.
5. Click **Register**.\
   **You should see:** **You're registered**, with 19 remaining places.
6. Click **My Registrations**.\
   **You should see:** your event listed as Registered, once.
7. Refresh the page.\
   **You should see:** the same registration, without a duplicate.
8. Sign out, sign back in as the same attendee, and open **My Registrations** again.\
   **You should see:** the saved registration.
9. Switch to **Event Organiser**.
10. Click **Events** and find this event.
11. Click its **View registrations**.\
    **You should see:** the attendee listed once as Registered.
12. Switch to **Event Coordinator** and open this event's **View registrations**.\
    **You should see:** the same attendee and count.

**Capture:** the attendee's saved registration and the organiser's registration list.

### Finish Flow 1

The final business result is **one Confirmed event**, its approved main venue, 2 reserved equipment units, and one Registered attendee.

Record the result below before cleanup. Then:

1. As the attendee, open the saved attendee event page and click **Withdraw registration**.
2. Click **Withdraw** in the dialog.
3. As the coordinator, open the saved event page and click **Cancel event**.
4. Enter `Manual flow 1 finished` in **Reason for cancelling**.
5. Click **Confirm cancellation**.
6. Give this flow's event link to the preparer for removal of only its test records. Cancellation releases commitments but keeps history.

| Record your result | Fill in after execution |
| --- | --- |
| Actual result | |
| Status — Pass / Fail / Blocked / Not Executed | |
| First failing part/step | |
| Screenshots / evidence links | |
| Defect reference | |
| Cleanup completed / still needed | |

## Flow 2: Buffer conflict — setup and turnaround time block a second booking

**Purpose:** Prove a venue is treated as occupied from event start **minus setup time** to event end **plus turnaround time**, not just for the advertised event hours. This is a customer change from Week 7. It also proves that two bookings which only touch at the edge of those windows are allowed, and that cancelling releases the time.

**What you will prove:** the main venue has **30 minutes setup** and **45 minutes turnaround**. Event A at **10:00–12:00** therefore occupies the venue from **09:30 to 12:45**.

| Event | Advertised time | Occupies the venue (with setup/turnaround) | Expected result |
| --- | --- | --- | --- |
| A | 10:00–12:00 | 09:30–12:45 | Booked and approved |
| B, first attempt | 12:30–14:00 | 12:00–14:45 | **Refused**: overlaps A's 09:30–12:45 even though 12:30 is after A's advertised end |
| B, second attempt | 13:15–15:00 | 12:45–15:45 | **Allowed**: starts exactly when A's turnaround ends, so the windows only touch |

**Starting point:** two **new events in Planning**, both on Tuesday 17 November 2026, both attendance 20, **no registration required**, no venue booked yet.

- **Event A**: type `Product Launch Briefing` in **Event name**, **Starts** 10:00, **Ends** 12:00.
- **Event B**: type `Sales Kickoff Workshop` in **Event name**, **Starts** 12:30, **Ends** 14:00.

**Preparation:** for each of the two events, follow Flow 1 Parts A–C, typing the event name above and the Description from the names table instead of Flow 1's name (create, submit, assign, approve), using the times above, **Attendance 20**, Preferred location City Hall, Room layout Theatre, and leaving **Attendee registration is required unticked**. Both events must use the same coordinator. Skip Flow 1 Part D onward. The date is **Tuesday 17 November 2026** and the venue is **Grand Auditorium** (30/45 minute buffers). Do not edit the venue's buffer values on the shared site.

### Part A — Venue Staff: check the buffers are recorded

1. Switch to **Venue Staff**.
2. Click **Venues** and open **Grand Auditorium**.\
   **You should see:** **Setup time** 30 min and **Turnaround time** 45 min on the venue details. (SPM-86 AC03)
3. Do not edit them. Staff can change these values, but this shared venue must stay as set up.

### Part B — Coordinator and Venue Staff: book Event A

1. Switch to **Event Coordinator** and open **Event A**'s Venue page (**Events → View details → Venue**).
2. Under **Suggested venues**, find **Grand Auditorium** and click **View details**. If it is not listed, click **Search venues**, keep the event's date and 10:00–12:00, then search and open it.
3. Click **Request venue**.\
   **You should see:** a **Pending** request for Event A.
4. Switch to **Venue Staff**, click **Requests**, select Event A's request, click **Approve**, then **Approve request**.\
   **You should see:** the request is approved. (SPM-25)

### Part C — Check how the calendar shows the buffers

1. As **Event Coordinator**, click **Venues**, open **Grand Auditorium**, then click **View availability**.
2. Select Tuesday 17 November 2026.\
   **You should see:** Event A's booked period 10:00–12:00, with a visibly different **Setup / turnaround** band from 09:30 to 10:00 and from 12:00 to 12:45. (SPM-87 AC04, SPM-20)
3. Look at the legend above the calendar.\
   **You should see:** separate labels for Available, Booked, Blocked and Setup / turnaround. (SPM-20)

**Capture:** the calendar day with Event A and its setup/turnaround bands.

### Part D — Coordinator: Event B is refused because of the buffer

1. Open **Event B**'s Venue page.
2. Find **Grand Auditorium**, using **Search venues** with Event B's date and 12:30–14:00 if it is not suggested, and click **View details**.
3. Read the **Request this venue** box at the bottom of the page.\
   **You should see:** the **Request venue** button is greyed out, and the message reads *This venue is already occupied from 9:30 AM … to 12:45 PM … (including setup and turnaround), which overlaps your requested period.* The message must show the setup/turnaround times, not just 10:00–12:00. (SPM-87 AC01/AC02, SPM-26 AC01)
4. Switch to **Venue Staff** and open **Requests**, then select **All**.\
   **You should see:** only Event A's request. **No request exists for Event B**, even a rejected one. (SPM-26 AC04)

**Capture:** the disabled button and the occupied-period message for Event B.

### Part E — Coordinator: touching windows are allowed

1. Switch to **Event Coordinator** and open **Event B**.
2. Click **Edit event**.
3. Change **Starts** to 13:15 and **Ends** to 15:00 on the same date.
4. Click **Save changes**.\
   **You should see:** the event now shows 13:15–15:00 and is still in Planning.
5. Open **Event B**'s Venue page, open **Grand Auditorium**'s **View details**.\
   **You should see:** the **Request venue** button is now enabled. Event B's setup starts at 12:45, exactly when Event A's turnaround ends. (SPM-87 AC02, SPM-26 AC03)
6. Click **Request venue**.\
   **You should see:** a **Pending** request for Event B.
7. Switch to **Venue Staff**, open **Requests**, and select **All**.\
   **You should see:** Event A approved and Event B pending, with no conflict flag on either. Leave Event B pending.

### Part F — Cancelling Event A frees its time

1. Switch to **Event Coordinator** and open **Event A**.
2. Click **Cancel event**, enter `Flow 2 finished` in **Reason for cancelling**, and click **Confirm cancellation**.
3. Open **Grand Auditorium**'s **View availability** and select Tuesday 17 November 2026.\
   **You should see:** Event A's booking and its 09:30–12:45 bands are gone from the calendar; Event B's pending request still shows. (SPM-45)

### Finish Flow 2

Record the result. As the coordinator, open **Event B**, click **Cancel event**, enter `Flow 2 finished` and click **Confirm cancellation**. Event B's pending venue request should then show as cancelled in Venue Staff's **Requests → All**. Give only these two event links to the preparer.

| Record your result | Fill in after execution |
| --- | --- |
| Actual result | |
| Status — Pass / Fail / Blocked / Not Executed | |
| First failing part/step | |
| Screenshots / evidence links | |
| Defect reference | |
| Cleanup completed / still needed | |

## Flow 3: Change a confirmed event

**Purpose:** Increase attendance through a reviewed change, then obtain safety approval again.

**Starting point:** a **separate new Confirmed event**, attendance 20, the approved main venue, Grand Auditorium, and 2 reserved equipment units. No registration is required and there are no attendees.

**Preparation:** use a new starting sheet and follow Flow 1 Parts A–G for this new event, typing `Quarterly Strategy Review` in **Event name** at Part A step 4. Use **Wednesday 18 November 2026** instead of Flow 1's date everywhere, venue **Grand Auditorium** and equipment **Projector**. Leave **Attendee registration is required unticked** and skip Part D. Do not do Part H or Flow 1 cleanup. The preparer can complete this in advance. Do not reuse a cancelled event.

### Part A — Organiser: request the change

1. Switch to **Event Organiser** and open this flow's saved event page.\
   **Check:** Confirmed, attendance 20.
2. Click **Request a change**.
3. In **What change are you requesting?**, enter `Increase expected attendance from 20 to 30. Keep the same date, venue and equipment.`
4. In **Reason**, enter `Ten more participants would like to attend`.
5. Click **Send request**.\
   **Check:** the request is Pending Review.
6. Refresh the event.\
   **Check:** attendance is still 20 and the event is still Confirmed. Requesting a change has not applied it.

### Part B — Coordinator: review and apply the change

1. Switch to **Event Coordinator** and open this flow's event.
2. Open **Notifications**.\
   **Check:** the change-request notification identifies this event.
3. Click **View change history** to read the request.
4. Return to the saved event page.
5. In **Change requests**, click **Approve**.
6. Enter `Increase attendance to 30 and recheck the venue arrangements` in **Implementation notes**.
7. Click **Approve request**.\
   **Check:** it is approved and waiting to be applied; attendance is still 20.
8. Click **Apply change**.
9. Change **Expected attendance** to `30`. Leave everything else unchanged.
10. Click **Apply change** at the bottom of the form.\
    **Check:** attendance is 30, the request is Implemented, and the event returns to Planning. The venue/equipment have not been cancelled or replaced.
11. Open **Safety Check**.\
    **Check:** the venue needs review and the event cannot yet be submitted. The unchanged equipment remains reserved.

**Capture:** attendance 30, Planning status and the venue's review flag.

### Part C — Review and approve the event again

1. Switch to **Venue Staff** and find the main venue booking in **Requests**. Select **Decided** or **All** to include approved bookings.\
   **Check:** the same venue remains approved and its capacity of 500 accommodates 30 people.
2. Switch to **Event Coordinator** and open the saved Safety Check page.
3. After reviewing the venue arrangement, click **Mark resolved** beside the venue.\
   **Check:** the review flag clears and the event becomes Ready. Stop if another problem remains.
4. Click **Submit for Safety Check**.\
   **Check:** Pending Safety Check again.
5. Switch to **Safety Officer**.
6. Open **Safety Checks**, then **Awaiting review**, and this event's **Review event**.
7. Read the details.\
   **Check:** attendance is now 30, with the same venue/equipment.
8. Click **Approve**.
9. Click **Confirm approval** in the dialog.
10. Switch to **Event Organiser** and refresh the saved event page.\
    **Check:** Confirmed again, with attendance 30.
11. Sign out and back in as the organiser, then reopen the event.\
    **Check:** attendance 30 and Confirmed status remain saved.
12. Switch to **Event Coordinator** and open **View change history**.\
    **Check:** the request, decision and applied attendance change are retained.

**Capture:** the final Confirmed event and its recorded change. The final result is the changed event approved again, with its original resource commitments preserved.

### Finish Flow 3

Record the result. As the coordinator, open this flow's event, click **Cancel event**, enter `Manual flow 3 finished`, and click **Confirm cancellation**. Give only this flow's event link to the preparer for test-data removal.

| Record your result | Fill in after execution |
| --- | --- |
| Actual result | |
| Status — Pass / Fail / Blocked / Not Executed | |
| First failing part/step | |
| Screenshots / evidence links | |
| Defect reference | |
| Cleanup completed / still needed | |

## Flow 4: Replace an unavailable venue

**Purpose:** Continue an event after a venue problem, preserving its original details until a replacement is approved.

**Starting point:** another **new Confirmed event**, 20 people, 10:00–12:00, with its approved main venue and 2 reserved equipment units. No registration is required. **Central Civic Hall** (replacement) is available for the same period. Use the full-event main venue, not a breakout room.

**Preparation:** use a new starting sheet and follow Flow 1 Parts A–G, typing `Department Planning Retreat` in **Event name** at Part A step 4, leaving registration unticked and skipping Part D. Do not do Part H or cleanup. The event date is **Thursday 19 November 2026**; the main venue is **Grand Auditorium** (45-minute turnaround) and the replacement is **Central Civic Hall**. Choose **Projector** for the equipment.

### Part A — Venue Staff: record the problem

1. Switch to **Venue Staff**.
2. Click **Venues**, open **Grand Auditorium**, then click **Manage blocks**.
3. Complete **New operational block**:

   | Field | What to enter |
   | --- | --- |
   | Venue | Check this is Grand Auditorium |
   | Reason category | Maintenance |
   | Reason | `Air-conditioning maintenance for Department Planning Retreat` |
   | Start date and time | 19 November 2026, 12:15 |
   | End date and time | 19 November 2026, 13:00 |

4. Click **Save block**.\
   **Check:** **This block affects existing bookings** lists your event and coordinator. The event ends at 12:00 but needs turnaround until 12:45, so the maintenance overlaps its occupied time.
5. Take a screenshot of the affected-bookings dialog.
6. Click **Save block anyway**.\
   **Check:** the block is saved and the booking is flagged **Disrupted - Alternative Required**. The event has not been cancelled.

### Part B — Coordinator: request a replacement

1. Switch to **Event Coordinator**.
2. Open **Notifications**.\
   **Check:** your event's notification identifies the venue problem and says alternative arrangements are needed.
3. Open this flow's saved Venue page.\
   **Check:** the original booking and disruption reason are still visible.
4. Click **Search venues** in the replacement selection area.
5. Check the search details.\
   **Check:** the date is unchanged, the period is 10:00–12:00, and attendance is 20. The disrupted venue is excluded as a replacement.
6. Click **Search venues** to run the search.
7. Find **Central Civic Hall** and click **View details**.
8. Check its name, capacity and event period.
9. Click **Request replacement**.\
   **Check:** a Pending replacement is shown. The original booking has not yet been cancelled.

### Part C — Venue Staff: approve the replacement

1. Switch to **Venue Staff**.
2. Click **Requests**.
3. Find this event's replacement request. Check the old and new venue names.
4. Click **Approve** for the replacement.
5. Click **Approve request** in the dialog.\
   **Check:** the replacement is approved; the old booking is cancelled as part of the replacement. Their link remains visible in booking activity.
6. Switch to **Event Coordinator** and refresh this flow's Venue page.\
   **Check:** the replacement is now the approved main venue. The event's date, times and attendance are unchanged. It returns to Planning because the changed venue needs a new safety review.

### Part D — Approve the new arrangements

1. As **Event Coordinator**, open **Safety Check**.\
   **Check:** the replacement main venue and existing equipment are shown. The old cancelled booking is not an outstanding active booking.
2. If Ready, click **Submit for Safety Check**. If a problem remains, stop and record it.
3. Switch to **Safety Officer**.
4. Open **Safety Checks**, then **Awaiting review**, and open this event.
5. Read the review.\
   **Check:** it shows the replacement venue with the original schedule and attendance.
6. Click **Approve**.
7. Click **Confirm approval**.
8. Switch to **Event Organiser** and refresh the event page.\
   **Check:** Confirmed with the replacement venue.
9. Sign out and back in as the organiser, then reopen the event.\
   **Check:** the replacement and Confirmed status remain saved.
10. Switch to **Event Coordinator** and open **View change history**.\
    **Check:** the original and replacement bookings remain traceable.

**Capture:** the old/new booking activity and final Confirmed event. The final result is the same event proceeding with a replacement venue and a new safety approval.

### Finish Flow 4

Record the result first.

1. As the coordinator, cancel only this event using **Cancel event**, reason `Manual flow 4 finished`, then **Confirm cancellation**.
2. Switch to **Venue Staff** and click **Venues**, open **Grand Auditorium** and click **Manage blocks**.
3. Find the block whose reason is `Air-conditioning maintenance for Department Planning Retreat`.
4. Click **Remove block** on that block.
5. Click **Remove block** in the confirmation. **Check:** it is marked removed in block history.
6. Give this event link and the specific block details to the preparer. Do not remove other blocks or either venue.

| Record your result | Fill in after execution |
| --- | --- |
| Actual result | |
| Status — Pass / Fail / Blocked / Not Executed | |
| First failing part/step | |
| Screenshots / evidence links | |
| Defect reference | |
| Cleanup completed / still needed | |

## Flow 5: Cancel an event

**Purpose:** Cancel a confirmed event, release its venue/equipment commitments, and inform affected people.

**Starting point:** a **new Confirmed event with one Registered attendee**, an approved main venue and 2 reserved equipment units. Use a separate event from the earlier flows.

**Preparation:** use a new starting sheet and complete Flow 1 Parts A–H for this event, typing `Customer Feedback Roundtable` in **Event name** at Part A step 4. Use **Friday 20 November 2026** instead of Flow 1's date everywhere (registration closes 20 November 2026, 09:00), venue **Grand Auditorium** and equipment **Projector**. Stop before its cleanup. The preparer can do this in advance.

### Part A — Check the event before cancelling

1. As **Event Organiser**, open this flow's event.\
   **Check:** it is Confirmed with the agreed schedule and arrangements.
2. As **Attendee**, open **My Registrations**.\
   **Check:** this event is Registered.
3. As **Event Coordinator**, open this flow's Venue and Equipment pages.\
   **Check:** the main venue is approved and 2 equipment units are reserved. Capture the starting state.

### Part B — Coordinator: cancel the whole event

1. Stay in the **Event Coordinator** profile and open the event page.
2. Click **Cancel event**.
3. Enter `The organiser can no longer hold this meeting` in **Reason for cancelling**.
4. Click **Confirm cancellation**.\
   **Check:** the event becomes **Cancelled**.
5. Click **View change history**.\
   **Check:** the cancellation records the reason, coordinator and time.

### Part C — Check resource release and notifications

1. Switch to **Venue Staff** and click **Venues**, open **Grand Auditorium** and click **View availability**.
2. Select Friday 20 November 2026.\
   **Check:** this event no longer occupies 09:30–12:45, including its setup/turnaround time.
3. Click **Requests**, select **All**, and find this event.\
   **Check:** its booking remains in the history as cancelled.
4. Switch to **Event Coordinator**, open this flow's saved Equipment page, and scroll to **Released reservations**.\
   **Check:** the item and quantity 2 are listed as **Released**, with the old details/history still available. Disappearance alone is not proof that stock was released.
5. Switch to **Event Organiser** and refresh the event page.\
   **Check:** Cancelled.
6. In the organiser profile, open **Notifications**.\
   **Check:** a cancellation notification identifies this event.
7. Check **Notifications** in each of the **Event Coordinator**, **Venue Staff** and **Technical Support Staff** profiles.\
   **Check:** each affected role has a cancellation notification for this event.

### Part D — Attendee: check the cancellation is saved

1. Switch to **Attendee** and open **My Registrations**.
2. Open this event.\
   **Check:** the event is cancelled and no new registration can be made. The old registration need not automatically become Withdrawn; cancellation and withdrawal are different actions.
3. Open **Notifications**.\
   **Check:** a cancellation notification identifies this event.
4. Sign out, sign back in as the attendee, and reopen the saved attendee event page.\
   **Check:** cancellation remains visible and registration remains closed.
5. Switch to **Event Organiser**, sign out and back in, then reopen the event.\
   **Check:** Cancelled remains saved.
6. Switch to **Event Coordinator** and reopen this event's Venue, Equipment and Safety Check pages.\
   **Check:** retained records can be inspected, but no new planning arrangement or safety submission can be made for this cancelled event.

**Capture:** cancellation history, released resource records and the attendee cancellation message. The final result is a cancelled event with released commitments and informed users.

### Finish Flow 5

Record the result. The event is already cancelled, so do not cancel it again or withdraw registrations to tidy its history. Give this flow's event link to the preparer for removal of only its test data.

| Record your result | Fill in after execution |
| --- | --- |
| Actual result | |
| Status — Pass / Fail / Blocked / Not Executed | |
| First failing part/step | |
| Screenshots / evidence links | |
| Defect reference | |
| Cleanup completed / still needed | |

## Final checklist

- [ ] Record a result for each journey attempted; leave unperformed journeys Not Executed.
- [ ] Save screenshots with the journey number and exact event name.
- [ ] Report failures/blocked steps with the account role, part/step number and message.
- [ ] Release only your own test events' commitments and remove only Journey 4's own maintenance block.
- [ ] Every event you created uses a name from the **Event names to type** table. Give the event links to the team so the leftover test records can be removed or archived. Cancelling or removing a block keeps history; it does not delete every test record.
- [ ] Record **Cleanup still needed** if safe removal is unavailable. Do not delete accounts, venues, equipment or other people's records.
- [ ] Sign out of every browser profile.

## Background for the preparer or reviewer

The tester can stop reading here. The [technical reference](manual-e2e-reference.md) keeps the earlier source evidence, detailed acceptance-criterion mappings and unresolved requirement/code conflicts. Its broader E2E-00..09 catalogue is background material. **The five journeys in this guide are the current execution scope.**

| Journey | Main story relationships | Coverage limit |
| --- | --- | --- |
| 1 | SPM-2 draft; SPM-3 submission; SPM-80/81 assignment; SPM-7 approval; SPM-24/25 venue; SPM-27/32 equipment; SPM-33 readiness; SPM-90 safety; SPM-40/41 registration | Main successful path; no clarification, rejection or permission alternatives |
| 2 | Week 7 buffer rule; SPM-86 configure; SPM-87 availability and conflict; SPM-26 prevent conflict; SPM-20 availability calendar; SPM-45 release | One buffered venue, one refused and one touching booking; does not cover the SPM-88 flagged-bookings re-check |
| 3 | SPM-38 request; SPM-39 review/application; SPM-33/90 renewed safety review | Attendance change only; no schedule/stock conflicts or rejected change |
| 4 | Week 7 venue disruption; SPM-83 disruption; SPM-82 replacement; SPM-33/90 renewed safety review | Full-event main venue only; no breakout replacement or rejected replacement |
| 5 | SPM-45 cancellation/release/notification/audit; SPM-11 locked finalised records | Confirmed event with a Registered attendee; not cancellation during other lifecycle stages |

The requirement sources are the Jira export `SPM List - Jira (7).csv` and the Week 7 customer changes. Revised requirements explicitly call for Lead assignment and Safety Officer approval. Older contradictory automatic-assignment, coordinator-confirmation and overlapping-block wording needs backlog reconciliation; see D1-D3 in the reference. Do not silently substitute those older expectations. Journey 2 was written against `SPM-86`, `87` and `26` in export (7), and SPM-12 and SPM-24 are marked Reopen there, so treat any disagreement on lifecycle status or venue requests as a possible requirement issue, not just a test failure.

Permissions/reassignment, validation, tentative holds, multiple rooms, waiting lists, concurrency, equipment shortages, documents and completion are deliberate gaps in this smaller set. A successful run does not establish complete acceptance-criterion coverage. Equipment release is checked through the coordinator's retained records; proving the newly freed stock can be reserved for a different event is a further resource-reuse test.

Screen labels were checked against repository source, not a live execution. The preparer must verify the running version, actual account access and resource availability on the staging site. No tests were run, no accounts or events were created, and no database was accessed while writing this guide. All result boxes remain blank.
