begin;
select plan(25);
insert into auth.users(id,email,raw_user_meta_data) values
('fe110000-0000-0000-0000-000000000001','history-org@example.test','{"full_name":"History Organiser","role":"event_organiser"}'),
('fe110000-0000-0000-0000-000000000002','history-coord@example.test','{"full_name":"History Coordinator","role":"event_coordinator"}'),
('fe110000-0000-0000-0000-000000000003','history-safety@example.test','{"full_name":"History Safety","role":"safety_officer"}'),
('fe110000-0000-0000-0000-000000000004','history-safety2@example.test','{"full_name":"Other Safety","role":"safety_officer"}'),
('fe110000-0000-0000-0000-000000000005','history-lead@example.test','{"full_name":"History Lead","role":"event_coordinator_lead"}'),
('fe110000-0000-0000-0000-000000000006','history-venue@example.test','{"full_name":"History Venue","role":"venue_staff"}'),
('fe110000-0000-0000-0000-000000000007','history-tech@example.test','{"full_name":"History Tech","role":"technical_support_staff"}'),
('fe110000-0000-0000-0000-000000000008','history-attendee@example.test','{"full_name":"History Attendee","role":"attendee"}');
insert into public.venues(id,name,location,capacity) values ('fe110000-0000-0000-0000-000000000010','History Hall','Block A',100);
insert into public.events(id,organiser_id,assigned_coordinator_id,title,status,starts_at,ends_at,requirements_acknowledged) values
('fe110000-0000-0000-0000-0000000000e1','fe110000-0000-0000-0000-000000000001','fe110000-0000-0000-0000-000000000002','History Event','planning','2099-12-10T10:00:00+08:00','2099-12-10T12:00:00+08:00',true),
('fe110000-0000-0000-0000-0000000000e2','fe110000-0000-0000-0000-000000000001','fe110000-0000-0000-0000-000000000002','Never reviewed','planning','2099-12-11T10:00:00+08:00','2099-12-11T12:00:00+08:00',true);
insert into public.venue_bookings(id,event_id,venue_id,requested_by,starts_at,ends_at,status,is_main_venue) values
('fe110000-0000-0000-0000-0000000000b1','fe110000-0000-0000-0000-0000000000e1','fe110000-0000-0000-0000-000000000010','fe110000-0000-0000-0000-000000000002','2099-12-10T10:00:00+08:00','2099-12-10T12:00:00+08:00','approved',true);
-- SPM-90: the coordinator's safety plan, required before the safety check.
update public.events
set crowd_movement_plan = 'Single entrance; ushers at both exits.',
    equipment_placement_notes = 'Stage left; cables taped down.',
    emergency_access_notes = 'Two exits; assembly point at the car park.',
    restrictions_notes = 'None known.',
    emergency_access_checked = true,
    restrictions_checked = true,
    crowd_movement_checked = true
where crowd_movement_plan is null;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fe110000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select public.submit_event_for_safety_check('fe110000-0000-0000-0000-0000000000e1');
select set_config('request.jwt.claims','{"sub":"fe110000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select public.decide_event_safety_check('fe110000-0000-0000-0000-0000000000e1','changes_requested','Check access',array['fe110000-0000-0000-0000-0000000000b1'::uuid]);
-- SPM-89 AC04: a round remains visible immediately after returning to Planning.
select is(jsonb_array_length(public.safety_check_review_history()),1,'history is visible after changes requested');
reset role;
update public.venue_bookings set needs_review=false, needs_review_reason=null where id='fe110000-0000-0000-0000-0000000000b1';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fe110000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select public.submit_event_for_safety_check('fe110000-0000-0000-0000-0000000000e1');
select set_config('request.jwt.claims','{"sub":"fe110000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select public.decide_event_safety_check('fe110000-0000-0000-0000-0000000000e1','approved',null);
reset role;
update public.venues set name='Current Hall Name' where id='fe110000-0000-0000-0000-000000000010';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fe110000-0000-0000-0000-000000000004","role":"authenticated"}',true);
-- SPM-90 AC04 and SPM-89 AC04: shared role history, stable round order and saved facts.
select is(jsonb_array_length(public.safety_check_review_history()),2,'another safety officer sees both decided rounds');
select is(public.safety_check_review_history()->0->>'outcome','approved','newest round first even when timestamps tie');
select is(public.safety_check_review_history()->1->>'round','1','older round retained');
select is(public.safety_check_review_history()->0->>'currentStatus','confirmed','current event status is separate from past outcome');
select is(public.safety_check_review_history()->0->>'reviewerName','History Safety','original reviewer retained');
select is(public.safety_check_review_history()->1->>'reason','Check access','reason retained');
select is(public.safety_check_review_history()->0->'venuesSnapshot'->0->>'venueName','History Hall','saved venue name is not replaced by current catalogue name');
select is(jsonb_array_length(public.safety_check_review_history()->1->'flaggedBookingIds'),1,'selected arrangement ids retained');
select is((select count(*)::int from public.events where id='fe110000-0000-0000-0000-0000000000e1'),0,'history read does not broaden general event access');
select is((select count(*)::int from public.event_safety_check_submissions where event_id='fe110000-0000-0000-0000-0000000000e1'),0,'history read does not broaden raw submission access');
select is(jsonb_array_length(public.safety_check_review_history((public.safety_check_review_history()->0->>'decisionId')::bigint)),1,'decision deep link returns one record');
select is(public.safety_check_review_history(-1),'[]'::jsonb,'unknown decision returns no record');
select is(jsonb_array_length(public.safety_check_review_history(p_offset=>1,p_limit=>1)),1,'pagination does not lose older rounds');
select is(public.safety_check_review_history(p_event_id=>'fe110000-0000-0000-0000-0000000000e2'),'[]'::jsonb,'unreviewed events are not exposed');
select throws_ok($$select public.safety_check_review_history(p_limit=>101)$$,'23514','Enter a valid history page','invalid page refused');
-- A later submission creates new work without losing either decided round.
reset role;
update public.events set status='planning' where id='fe110000-0000-0000-0000-0000000000e1';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fe110000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select public.submit_event_for_safety_check('fe110000-0000-0000-0000-0000000000e1');
select set_config('request.jwt.claims','{"sub":"fe110000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select is(jsonb_array_length(public.safety_check_review_history()),2,'undecided round does not replace decided rounds');
select is(public.safety_check_review_history()->0->>'currentRound','3','history identifies the newly submitted round');
reset role;
select is(has_function_privilege('anon','public.safety_check_review_history(bigint,uuid,integer,integer)','EXECUTE'),false,'anonymous users cannot execute history read');
set local role authenticated;
-- Each non-safety role is refused despite definer privileges.
select set_config('request.jwt.claims','{"sub":"fe110000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.safety_check_review_history()$$,'42501','Only Safety Officers can view safety review history','non-safety role 1 cannot read review history');
select set_config('request.jwt.claims','{"sub":"fe110000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.safety_check_review_history()$$,'42501','Only Safety Officers can view safety review history','non-safety role 2 cannot read review history');
select set_config('request.jwt.claims','{"sub":"fe110000-0000-0000-0000-000000000005","role":"authenticated"}',true);
select throws_ok($$select public.safety_check_review_history()$$,'42501','Only Safety Officers can view safety review history','non-safety role 5 cannot read review history');
select set_config('request.jwt.claims','{"sub":"fe110000-0000-0000-0000-000000000006","role":"authenticated"}',true);
select throws_ok($$select public.safety_check_review_history()$$,'42501','Only Safety Officers can view safety review history','non-safety role 6 cannot read review history');
select set_config('request.jwt.claims','{"sub":"fe110000-0000-0000-0000-000000000007","role":"authenticated"}',true);
select throws_ok($$select public.safety_check_review_history()$$,'42501','Only Safety Officers can view safety review history','non-safety role 7 cannot read review history');
select set_config('request.jwt.claims','{"sub":"fe110000-0000-0000-0000-000000000008","role":"authenticated"}',true);
select throws_ok($$select public.safety_check_review_history()$$,'42501','Only Safety Officers can view safety review history','non-safety role 8 cannot read review history');
select * from finish();
rollback;
