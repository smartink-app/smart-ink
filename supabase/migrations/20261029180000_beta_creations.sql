begin;
create table public.beta_shared_creations (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('project','render')),
 source_id text not null,
 title text not null,
 preview text not null check(length(preview)<=800000 and preview ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'),
 shared_at timestamptz not null default now(),
 consent_version text not null default 'beta-review-v1',
 unique(owner_id,kind,source_id)
);
alter table public.beta_shared_creations enable row level security;
create policy "shared creations read" on public.beta_shared_creations for select to authenticated using(owner_id=auth.uid() or (public.is_admin() and exists(select 1 from public.waitlist w where w.user_id=owner_id and w.status='active')));
create policy "creator can withdraw" on public.beta_shared_creations for delete to authenticated using(owner_id=auth.uid());
revoke all on public.beta_shared_creations from anon,authenticated;
grant select,delete on public.beta_shared_creations to authenticated;
create function public.share_beta_creation(p_owner uuid,p_kind text,p_source text,p_preview text) returns void
language plpgsql security definer set search_path=public as $$
declare v_title text;
begin
 if auth.uid() is null or p_owner is distinct from auth.uid() or not public.has_active_beta_access() then raise exception 'Active beta account required'; end if;
 if p_kind='project' then select name into v_title from public.scenes where id=p_source and owner=auth.uid();
 elsif p_kind='render' then select coalesce(scene_name,'Image export') into v_title from public.render_history where id=p_source and owner=auth.uid();
 else raise exception 'Unsupported creation'; end if;
 if v_title is null then raise exception 'Creation not found in your account'; end if;
 insert into public.beta_shared_creations(owner_id,kind,source_id,title,preview) values(auth.uid(),p_kind,p_source,left(v_title,200),p_preview)
 on conflict(owner_id,kind,source_id) do update set title=excluded.title,preview=excluded.preview,shared_at=now(),consent_version='beta-review-v1';
end $$;
revoke all on function public.share_beta_creation(uuid,text,text,text) from public,anon;
grant execute on function public.share_beta_creation(uuid,text,text,text) to authenticated;
commit;
