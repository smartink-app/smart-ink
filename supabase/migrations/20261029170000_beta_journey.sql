begin;
alter table public.beta_review_sessions add column updated_at timestamptz not null default now();
create function public.touch_beta_review() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at=now(); return new; end $$;
create trigger beta_review_updated before update on public.beta_review_sessions for each row execute function public.touch_beta_review();

-- Explicit ownership on inserts prevents a pending request from being attributed
-- to a different account if the browser changes sessions during delivery.
grant insert(owner_id) on public.beta_review_sessions, public.beta_feedback_reports to authenticated;
create table public.beta_journey_events (
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('verified_signin','project_saved','export_ready','visit','returned')),
 event_key text not null default '',
 created_at timestamptz not null default now(),
 primary key(owner_id,kind,event_key)
);
alter table public.beta_journey_events enable row level security;
create policy "operators read journey" on public.beta_journey_events for select to authenticated using(public.is_admin());
revoke all on public.beta_journey_events from anon, authenticated;
grant select on public.beta_journey_events to authenticated;
create function public.record_beta_journey(p_owner uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare v_day text := to_char(now() at time zone 'UTC','YYYY-MM-DD');
begin
 if auth.uid() is null or p_owner is distinct from auth.uid() or not public.has_active_beta_access()
   or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
 then raise exception 'Active verified account required'; end if;
 if public.is_admin() then return; end if;
 if p_kind not in ('verified_signin','export_ready','visit') then raise exception 'Unsupported journey event'; end if;
 insert into public.beta_journey_events(owner_id,kind,event_key)
 values(auth.uid(),p_kind,case when p_kind='visit' then v_day else '' end) on conflict do nothing;
 if p_kind='visit' and exists(select 1 from public.beta_journey_events where owner_id=auth.uid() and kind='visit' and event_key<v_day) then
   insert into public.beta_journey_events(owner_id,kind) values(auth.uid(),'returned') on conflict do nothing;
 end if;
end $$;
revoke all on function public.record_beta_journey(uuid,text) from public, anon;
grant execute on function public.record_beta_journey(uuid,text) to authenticated;
create function public.record_beta_scene_saved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
 if new.owner=auth.uid() and public.has_active_beta_access() and not public.is_admin() then
  insert into public.beta_journey_events(owner_id,kind) values(new.owner,'project_saved') on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function public.record_beta_scene_saved() from public, anon, authenticated;
create trigger beta_scene_saved after insert or update on public.scenes for each row execute function public.record_beta_scene_saved();
create index on public.beta_journey_events(created_at desc);
commit;
