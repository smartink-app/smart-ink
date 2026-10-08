-- Private beta resource access must survive direct API calls and revocation,
-- not depend on the frontend hiding the studio. Keep existing owner policies;
-- a restrictive policy ANDs approval with them rather than granting new access.
-- Auth/invite/admin tables and RPCs are unchanged so approvals still work.

create or replace function public.has_active_beta_access()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.waitlist
    where user_id = (select auth.uid()) and status = 'active'
  );
$$;
revoke all on function public.has_active_beta_access() from public, anon;
grant execute on function public.has_active_beta_access() to authenticated;

create policy "scenes: active beta required"
  on public.scenes as restrictive for all to authenticated
  using ((select public.has_active_beta_access()))
  with check ((select public.has_active_beta_access()));

create policy "render_history: active beta required"
  on public.render_history as restrictive for all to authenticated
  using ((select public.has_active_beta_access()))
  with check ((select public.has_active_beta_access()));

create policy "render_jobs: active beta required"
  on public.render_jobs as restrictive for select to authenticated
  using ((select public.has_active_beta_access()));

-- Leave unrelated storage buckets alone. For studio buckets, even a still-valid
-- authentication token cannot mint new download URLs or write after revocation.
-- URLs already signed before revocation remain valid until their expiry.
create policy "studio assets: active beta required"
  on storage.objects as restrictive for all to authenticated
  using (
    bucket_id not in ('scene-assets', 'renders')
    or (select public.has_active_beta_access())
  )
  with check (
    bucket_id not in ('scene-assets', 'renders')
    or (select public.has_active_beta_access())
  );
