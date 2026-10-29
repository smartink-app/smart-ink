-- Prepared for staging. This migration does not publish the local UI.
-- Draft text stays on the device; only submitted comments and step outcomes sync.
begin;
create function public.valid_beta_review_steps(value jsonb) returns boolean
language sql immutable set search_path = '' as $$
 select case when jsonb_typeof(value) <> 'array' then false else
 jsonb_array_length(value) <= 8 and not exists (
   select 1 from jsonb_array_elements(value) item
   where jsonb_typeof(item) <> 'object'
     or not (item ? 'id' and item ? 'outcome' and item ? 'hasDraft')
     or coalesce(item->>'id','') not in ('front-page','sign-in','projects','create-project','artwork','placement','saving','rendering')
     or coalesce(item->>'outcome','') not in ('commented','skipped','not-tried','not-reviewed')
     or jsonb_typeof(item->'hasDraft') <> 'boolean'
     or (item - 'id' - 'outcome' - 'hasDraft') <> '{}'::jsonb
 ) and (select count(*) = count(distinct item->>'id') from jsonb_array_elements(value) item) end;
$$;
create table public.beta_review_sessions (
 id uuid primary key,
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 status text not null check (status in ('in-progress','paused','completed')),
 is_test boolean not null default false,
 steps jsonb not null check (public.valid_beta_review_steps(steps)),
 unique(owner_id,id)
);
create table public.beta_feedback_reports (
 id text primary key check (length(id) between 1 and 128),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 session_id uuid,
 step_id text check (step_id in ('front-page','sign-in','projects','create-project','artwork','placement','saving','rendering')),
 created_at timestamptz not null default now(),
 kind text not null check (kind in ('comment','review','journey')),
 screen text not null check (length(screen) <= 150),
 target text not null default '' check (length(target) <= 150),
 message text not null check (length(message) <= 4000),
 expected text not null default '' check (length(expected) <= 2000),
 goal text not null default '' check (length(goal) <= 2000),
 progress text not null default '' check (length(progress) <= 2000),
 version text not null check (length(version) <= 150),
 is_test boolean not null default false,
 check (length(trim(message)) > 0 or (kind = 'review' and length(trim(goal)) > 0)),
 check ((kind = 'journey' and session_id is not null and step_id is not null) or (kind <> 'journey' and session_id is null and step_id is null)),
 foreign key(owner_id,session_id) references public.beta_review_sessions(owner_id,id),
 unique(owner_id,session_id,step_id)
);
create table public.beta_feedback_triage (
 report_id text primary key references public.beta_feedback_reports(id) on delete cascade,
 status text not null default 'new' check(status in ('new','investigating','resolved')),
 notes text not null default '' check(length(notes) <= 4000)
);
alter table public.beta_review_sessions enable row level security;
alter table public.beta_feedback_reports enable row level security;
alter table public.beta_feedback_triage enable row level security;
create policy "review sessions read" on public.beta_review_sessions for select to authenticated
 using (public.is_admin() or (owner_id = auth.uid() and public.has_active_beta_access()));
create policy "review sessions insert" on public.beta_review_sessions for insert to authenticated
 with check(owner_id = auth.uid() and public.has_active_beta_access());
create policy "review sessions update" on public.beta_review_sessions for update to authenticated
 using(owner_id = auth.uid() and public.has_active_beta_access()) with check(owner_id = auth.uid() and public.has_active_beta_access());
create policy "feedback read" on public.beta_feedback_reports for select to authenticated
 using(public.is_admin() or (owner_id = auth.uid() and public.has_active_beta_access()));
create policy "feedback insert" on public.beta_feedback_reports for insert to authenticated
 with check(owner_id = auth.uid() and public.has_active_beta_access());
create policy "feedback update" on public.beta_feedback_reports for update to authenticated
 using(owner_id = auth.uid() and public.has_active_beta_access()) with check(owner_id = auth.uid() and public.has_active_beta_access());
create policy "triage admin only" on public.beta_feedback_triage for all to authenticated
 using(public.is_admin()) with check(public.is_admin());
revoke all on public.beta_review_sessions, public.beta_feedback_reports, public.beta_feedback_triage from anon, authenticated;
grant select on public.beta_review_sessions, public.beta_feedback_reports, public.beta_feedback_triage to authenticated;
grant insert(id,status,is_test,steps), update(status,is_test,steps) on public.beta_review_sessions to authenticated;
grant insert(id,session_id,step_id,kind,screen,target,message,expected,goal,progress,version,is_test), update(message,expected,goal,progress,is_test) on public.beta_feedback_reports to authenticated;
grant insert(report_id,status,notes), update(status,notes) on public.beta_feedback_triage to authenticated;
create index on public.beta_review_sessions(owner_id,created_at desc);
create index on public.beta_feedback_reports(owner_id,created_at desc);
commit;
