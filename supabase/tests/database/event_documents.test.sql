begin;

select plan(31);

-- SPM-37: supporting documents. Organiser attaches and removes their own;
-- only people who may see the event's documents can list them; attendees and
-- unrelated organisers cannot.

insert into auth.users (id, email, raw_user_meta_data) values
  ('fe700000-0000-0000-0000-000000000001', 'doc-organiser@example.test', '{"full_name":"Doc Organiser","role":"event_organiser"}'::jsonb),
  ('fe700000-0000-0000-0000-000000000002', 'doc-coordinator@example.test', '{"full_name":"Doc Coordinator","role":"event_coordinator"}'::jsonb),
  ('fe700000-0000-0000-0000-000000000003', 'doc-safety@example.test', '{"full_name":"Doc Safety","role":"safety_officer"}'::jsonb),
  ('fe700000-0000-0000-0000-000000000004', 'doc-other-organiser@example.test', '{"full_name":"Doc Other","role":"event_organiser"}'::jsonb),
  ('fe700000-0000-0000-0000-000000000005', 'doc-attendee@example.test', '{"full_name":"Doc Attendee","role":"attendee"}'::jsonb),
  ('fe700000-0000-0000-0000-000000000006', 'doc-unassigned@example.test', '{"full_name":"Doc Unassigned Coordinator","role":"event_coordinator"}'::jsonb);

-- E1 open (planning); E2 Confirmed (an attendee may see it); E3 Completed.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, requirements_acknowledged) values
  ('fe700000-0000-0000-0000-0000000000e1', 'fe700000-0000-0000-0000-000000000001', 'fe700000-0000-0000-0000-000000000002', 'Doc Event 1', 'planning', '2099-12-10T10:00:00+08:00', '2099-12-10T12:00:00+08:00', true),
  ('fe700000-0000-0000-0000-0000000000e2', 'fe700000-0000-0000-0000-000000000001', 'fe700000-0000-0000-0000-000000000002', 'Doc Event 2', 'confirmed', '2099-12-11T10:00:00+08:00', '2099-12-11T12:00:00+08:00', true),
  ('fe700000-0000-0000-0000-0000000000e3', 'fe700000-0000-0000-0000-000000000001', 'fe700000-0000-0000-0000-000000000002', 'Doc Event 3', 'completed', '2099-12-12T10:00:00+08:00', '2099-12-12T12:00:00+08:00', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000001","role":"authenticated"}', true);

create temporary table doc_result (label text primary key, id uuid, path text);
grant all on doc_result to authenticated;

-- AC01/AC03: the organiser attaches a PDF; the file name, uploader and date are recorded.
select lives_ok(
  $$insert into doc_result select 'pdf', public.add_event_document('fe700000-0000-0000-0000-0000000000e1', 'fe700000-0000-0000-0000-0000000000e1/a1.pdf', '  Programme.pdf  ', 'application/pdf', 2048), null$$,
  'AC01: the organiser can attach a PDF'
);
select is(
  (select row(file_name, uploaded_by_name, removed_at is null) from public.event_documents where id = (select id from doc_result where label = 'pdf')),
  row('Programme.pdf'::text, 'Doc Organiser'::text, true),
  'AC03: the list shows the file name (trimmed) and the uploader, and the document is not removed'
);
select ok(
  (select uploaded_at is not null from public.event_documents where event_id = 'fe700000-0000-0000-0000-0000000000e1'),
  'AC03: the upload date is recorded'
);
select lives_ok(
  $$select public.add_event_document('fe700000-0000-0000-0000-0000000000e1', 'fe700000-0000-0000-0000-0000000000e1/b1.png', 'Floor plan.png', 'image/png', 1000)$$,
  'AC01: a PNG is accepted'
);
select lives_ok(
  $$select public.add_event_document('fe700000-0000-0000-0000-0000000000e1', 'fe700000-0000-0000-0000-0000000000e1/c1.docx', 'Run sheet.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 5000)$$,
  'AC01: a DOCX is accepted'
);

-- AC02: unsupported or oversized files are rejected with a reason.
select throws_ok(
  $$select public.add_event_document('fe700000-0000-0000-0000-0000000000e1', 'fe700000-0000-0000-0000-0000000000e1/d1.exe', 'virus.exe', 'application/x-msdownload', 100)$$,
  '23514', 'Only PDF, PNG or DOCX files are allowed', 'AC02: an unsupported type is rejected with a reason'
);
select throws_ok(
  $$select public.add_event_document('fe700000-0000-0000-0000-0000000000e1', 'fe700000-0000-0000-0000-0000000000e1/e1.pdf', 'big.pdf', 'application/pdf', 10485761)$$,
  '23514', 'The file must be 10 MB or smaller', 'AC02: a file one byte over 10 MB is rejected with a reason'
);
select lives_ok(
  $$select public.add_event_document('fe700000-0000-0000-0000-0000000000e1', 'fe700000-0000-0000-0000-0000000000e1/f1.pdf', 'exactly10mb.pdf', 'application/pdf', 10485760)$$,
  'AC02: a file of exactly 10 MB is accepted'
);
select throws_ok(
  $$select public.add_event_document('fe700000-0000-0000-0000-0000000000e1', 'fe700000-0000-0000-0000-0000000000e1/g1.pdf', 'empty.pdf', 'application/pdf', 0)$$,
  '23514', 'The file is empty', 'AC02: an empty file is rejected with a reason'
);
select throws_ok(
  $$select public.add_event_document('fe700000-0000-0000-0000-0000000000e1', 'fe700000-0000-0000-0000-0000000000e2/h1.pdf', 'misfiled.pdf', 'application/pdf', 100)$$,
  '23514', 'The file was not stored under this event', 'a file stored under another event''s folder is refused'
);

-- Finished events cannot take or lose documents.
select throws_ok(
  $$select public.add_event_document('fe700000-0000-0000-0000-0000000000e3', 'fe700000-0000-0000-0000-0000000000e3/i1.pdf', 'late.pdf', 'application/pdf', 100)$$,
  '23514', 'Documents can no longer be changed on a completed, cancelled or rejected event', 'a Completed event cannot take a new document'
);

-- AC05: only the organiser can attach.
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.add_event_document('fe700000-0000-0000-0000-0000000000e1', 'fe700000-0000-0000-0000-0000000000e1/j1.pdf', 'x.pdf', 'application/pdf', 100)$$,
  '42501', 'Only the event''s organiser can attach documents', 'AC05: a coordinator cannot attach a document'
);
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.add_event_document('fe700000-0000-0000-0000-0000000000e1', 'fe700000-0000-0000-0000-0000000000e1/k1.pdf', 'x.pdf', 'application/pdf', 100)$$,
  '42501', 'Only the event''s organiser can attach documents', 'AC05: another organiser cannot attach a document to this event'
);

-- AC03/AC05: who can list the documents.
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.event_documents where event_id = 'fe700000-0000-0000-0000-0000000000e1'), 4, 'AC03: the organiser sees every document of their event');
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.event_documents where event_id = 'fe700000-0000-0000-0000-0000000000e1'), 4, 'AC03: the assigned coordinator sees them too');
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from public.event_documents), 0, 'AC05: an unrelated organiser sees no documents');
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from public.event_documents), 0, 'AC05: an attendee sees no documents, even for a Confirmed event');
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.event_documents), 0, 'a Safety Officer sees nothing while the event is not pending a safety check');
-- SPM-09 AC02: a coordinator who is not assigned to this event is treated as having no access.
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is((select count(*)::int from public.event_documents), 0, 'AC05: a coordinator who is not assigned to the event sees no documents');
select throws_ok(
  $$select public.add_event_document('fe700000-0000-0000-0000-0000000000e1', 'fe700000-0000-0000-0000-0000000000e1/l1.pdf', 'x.pdf', 'application/pdf', 100)$$,
  '42501', 'Only the event''s organiser can attach documents', 'AC05: a coordinator who is not assigned cannot attach a document either'
);

-- AC04: only the uploader can remove, and the removal and actor are recorded.
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  format($$select public.remove_event_document(%L)$$, (select id from doc_result where label = 'pdf')),
  '42501', 'You can only remove a document you attached', 'AC04: a coordinator cannot remove the organiser''s document'
);
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  public.remove_event_document((select id from doc_result where label = 'pdf')),
  'fe700000-0000-0000-0000-0000000000e1/a1.pdf',
  'AC04: removing returns the stored file''s path so it can be deleted'
);
select is(
  (select row(removed_at is not null, removed_by) from public.event_documents where id = (select id from doc_result where label = 'pdf')),
  row(true, 'fe700000-0000-0000-0000-000000000001'::uuid),
  'AC04: the removal and who did it are recorded'
);
select throws_ok(
  format($$select public.remove_event_document(%L)$$, (select id from doc_result where label = 'pdf')),
  '42501', 'You can only remove a document you attached', 'a document already removed cannot be removed again'
);

-- The stored files follow the same rules as the list.
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('event-documents', 'fe700000-0000-0000-0000-0000000000e1/stored.pdf')$$,
  'the organiser can store a file under their own event'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('event-documents', 'fe700000-0000-0000-0000-0000000000e3/late.pdf')$$,
  '42501', null, 'a file cannot be stored under a Completed event'
);
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('event-documents', 'fe700000-0000-0000-0000-0000000000e1/other.pdf')$$,
  '42501', null, 'AC05: a coordinator cannot store a file'
);
select is((select count(*)::int from storage.objects where bucket_id = 'event-documents'), 1, 'AC05: the assigned coordinator can read the stored file');
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'event-documents'), 0, 'AC05: an attendee cannot read stored files');
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'event-documents'), 0, 'AC05: an unrelated organiser cannot read stored files');
select set_config('request.jwt.claims', '{"sub":"fe700000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'event-documents'), 0, 'AC05: a coordinator who is not assigned cannot read stored files');

select * from finish();
rollback;
