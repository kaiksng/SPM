begin;

select plan(14);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'events', 'events table exists');
select has_table('public', 'clarifications', 'clarifications table exists');
select has_table('public', 'event_decisions', 'event decisions table exists');
select has_table('public', 'event_status_history', 'event status history table exists');
select col_is_fk('public', 'events', 'organiser_id', 'event organiser is a foreign key');
select col_not_null('public', 'events', 'status', 'event status is required');
select has_column('public', 'events', 'purpose', 'events include the PB-02 purpose field');
select has_column('public', 'events', 'submitted_by', 'events include the PB-03 submitted_by field');
select has_column('public', 'events', 'requirements_acknowledged', 'events include the PB-03 requirements_acknowledged field');
select policies_are(
  'public',
  'events',
  array[
    'coordinators manage assigned events',
    'events visible to participants',
    'organisers create their events',
    'organisers delete their drafts',
    'organisers edit their drafts'
  ],
  'events have the expected RLS policies'
);
select ok(
  public.event_status_transition_allowed('draft', 'submitted'),
  'draft events can be submitted'
);
select isnt(
  public.event_status_transition_allowed('rejected', 'confirmed'),
  true,
  'rejected events cannot be confirmed'
);
select ok(
  public.event_status_transition_allowed('draft', 'requested'),
  'PB-03: draft events can become Requested'
);

select * from finish();
rollback;
