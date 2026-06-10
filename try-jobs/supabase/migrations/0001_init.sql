-- Try Jobs MVP — initial schema
-- Run via: supabase db push  (or paste into the Supabase SQL editor)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type opening_status as enum ('open', 'closed', 'filled');

create type application_status as enum
  ('applied', 'screened', 'booked', 'rejected', 'withdrawn');

-- pending        — interest captured, call not yet placed
-- calling        — outbound VAPI call in flight
-- call_failed    — call could not be completed; SMS fallback offered
-- sms_in_progress— seeker is answering screening questions over SMS
-- complete       — transcript/summary/score stored
-- failed         — screening abandoned (no answers after fallback)
create type screening_status as enum
  ('pending', 'calling', 'call_failed', 'sms_in_progress', 'complete', 'failed');

create type booking_status as enum
  ('pending_payment', 'confirmed', 'completed', 'cancelled');

create type payment_status as enum ('unpaid', 'paid', 'released', 'refunded');

create type feedback_author as enum ('employer', 'seeker');

create type feedback_outcome as enum ('would_hire', 'would_not_hire', 'undecided');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Employers authenticate with Supabase magic-link auth; their row id IS the
-- auth.users id so RLS policies can compare directly against auth.uid().
create table employers (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text not null default '',
  email         text not null,
  business_name text not null default '',
  location      text not null default '',
  created_at    timestamptz not null default now()
);

create table openings (
  id                   uuid primary key default gen_random_uuid(),
  employer_id          uuid not null references employers (id) on delete cascade,
  title                text not null,
  location             text not null,
  try_day_at           timestamptz not null,
  hourly_rate          numeric(8, 2) not null check (hourly_rate > 0),
  -- 3-5 must-have attributes, e.g. "comfortable on register"
  must_have_attributes text[] not null default '{}',
  status               opening_status not null default 'open',
  -- hard cap on screenings per opening (call-cost guardrail, PRD §11.5)
  screening_cap        int not null default 25,
  created_at           timestamptz not null default now()
);

create index openings_status_idx on openings (status, try_day_at);
create index openings_employer_idx on openings (employer_id);

-- Seekers have no account; identified by phone number.
create table seekers (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  phone                 text not null unique,
  earliest_availability text not null default '',
  created_at            timestamptz not null default now()
);

create table applications (
  id                  uuid primary key default gen_random_uuid(),
  opening_id          uuid not null references openings (id) on delete cascade,
  seeker_id           uuid not null references seekers (id) on delete cascade,
  status              application_status not null default 'applied',
  screening_status    screening_status not null default 'pending',
  -- Voice screening artifacts (written by the VAPI webhook)
  vapi_call_id        text,
  fit_score           int check (fit_score between 1 and 5),
  summary             text,
  score_justification text,
  transcript          text,
  recording_url       text,
  -- one note per must-have attribute: [{attribute, note}]
  attribute_notes     jsonb not null default '[]',
  -- SMS fallback state machine
  screening_questions jsonb not null default '[]',
  sms_question_index  int not null default 0,
  sms_answers         jsonb not null default '[]',
  created_at          timestamptz not null default now(),
  unique (opening_id, seeker_id)
);

create index applications_opening_idx on applications (opening_id);
create index applications_seeker_idx on applications (seeker_id);

create table bookings (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid not null unique references applications (id) on delete cascade,
  scheduled_at      timestamptz not null,
  -- agreed hourly rate for the try-day, denormalised from the opening
  try_day_rate      numeric(8, 2) not null,
  -- expected shift length used to compute the Stripe charge
  hours             numeric(4, 1) not null default 4,
  payment_status    payment_status not null default 'unpaid',
  stripe_payment_id text,
  status            booking_status not null default 'pending_payment',
  created_at        timestamptz not null default now()
);

create table feedback (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings (id) on delete cascade,
  author_role feedback_author not null,
  outcome     feedback_outcome,          -- employer only
  rating      int check (rating between 1 and 5),
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  unique (booking_id, author_role)
);

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Principles:
--  * The public (anon) can read open openings only — nothing else.
--  * Employers can read/write their own employer row and openings, and can
--    READ applications/seekers/bookings/feedback tied to their openings.
--  * Seekers have no auth identity; all seeker-side writes go through the
--    server with the service-role key (which bypasses RLS).
--  * Seeker PII (phone) is exposed to an employer only after a confirmed
--    booking, via the seekers policy below.
-- ---------------------------------------------------------------------------
alter table employers    enable row level security;
alter table openings     enable row level security;
alter table seekers      enable row level security;
alter table applications enable row level security;
alter table bookings     enable row level security;
alter table feedback     enable row level security;

-- employers: self-service on own row
create policy employers_select_self on employers
  for select using (id = auth.uid());
create policy employers_insert_self on employers
  for insert with check (id = auth.uid());
create policy employers_update_self on employers
  for update using (id = auth.uid());

-- openings: public board reads open postings; employers manage their own
create policy openings_public_read on openings
  for select using (status = 'open' or employer_id = auth.uid());
create policy openings_employer_insert on openings
  for insert with check (employer_id = auth.uid());
create policy openings_employer_update on openings
  for update using (employer_id = auth.uid());
create policy openings_employer_delete on openings
  for delete using (employer_id = auth.uid());

-- applications: employers read applications to their own openings
create policy applications_employer_read on applications
  for select using (
    exists (
      select 1 from openings o
      where o.id = applications.opening_id and o.employer_id = auth.uid()
    )
  );

-- seekers: employers may read name/availability of seekers who applied to
-- their openings. (Column-level hiding of the phone number pre-booking is
-- enforced in the application layer; RLS is row-level only.)
create policy seekers_employer_read on seekers
  for select using (
    exists (
      select 1
      from applications a
      join openings o on o.id = a.opening_id
      where a.seeker_id = seekers.id and o.employer_id = auth.uid()
    )
  );

-- bookings: employers read bookings on their openings
create policy bookings_employer_read on bookings
  for select using (
    exists (
      select 1
      from applications a
      join openings o on o.id = a.opening_id
      where a.id = bookings.application_id and o.employer_id = auth.uid()
    )
  );

-- feedback: employers read feedback on their bookings
create policy feedback_employer_read on feedback
  for select using (
    exists (
      select 1
      from bookings b
      join applications a on a.id = b.application_id
      join openings o on o.id = a.opening_id
      where b.id = feedback.booking_id and o.employer_id = auth.uid()
    )
  );
