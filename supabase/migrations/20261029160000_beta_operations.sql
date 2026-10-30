-- Operator-only beta records. Apply to staging and verify policies before release.
begin;
create table public.beta_tester_notes (
 email text primary key check(email = lower(btrim(email)) and length(email) between 3 and 320),
 name text not null default '' check(length(name) <= 150),
 studio text not null default '' check(length(studio) <= 150),
 cohort text not null default '' check(length(cohort) <= 100),
 notes text not null default '' check(length(notes) <= 4000)
);
create table public.beta_followups (
 id uuid primary key,
 email text not null check(email = lower(btrim(email)) and length(email) between 3 and 320),
 title text not null check(length(btrim(title)) between 1 and 200),
 due_date date not null,
 status text not null default 'open' check(status in ('open','done')),
 notes text not null default '' check(length(notes) <= 4000),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 check((status = 'done' and completed_at is not null) or (status = 'open' and completed_at is null))
);
alter table public.beta_tester_notes enable row level security;
alter table public.beta_followups enable row level security;
create policy "operator tester notes" on public.beta_tester_notes for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "operator followups" on public.beta_followups for all to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on public.beta_tester_notes, public.beta_followups from anon, authenticated;
grant select, insert, update on public.beta_tester_notes, public.beta_followups to authenticated;
create index on public.beta_followups(status,due_date);
create index on public.beta_followups(email);
commit;
