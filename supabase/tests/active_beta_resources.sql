-- Run against a LOCAL disposable Supabase database after all migrations:
-- psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/active_beta_resources.sql
-- No remote execution is needed. Fixture rows and writes are rolled back.
begin;

insert into auth.users (id, email) values
  ('08100000-0000-0000-0000-000000000001', 'active-a@example.invalid'),
  ('08100000-0000-0000-0000-000000000002', 'active-b@example.invalid'),
  ('08100000-0000-0000-0000-000000000003', 'pending@example.invalid');
insert into public.waitlist (email, user_id, status) values
  ('active-a@example.invalid', '08100000-0000-0000-0000-000000000001', 'active'),
  ('active-b@example.invalid', '08100000-0000-0000-0000-000000000002', 'active'),
  ('pending@example.invalid', '08100000-0000-0000-0000-000000000003', 'waitlisted');
insert into public.scenes (id, owner, name) values
  ('phase-one-a', '08100000-0000-0000-0000-000000000001', 'A'),
  ('phase-one-b', '08100000-0000-0000-0000-000000000002', 'B');
insert into storage.objects (bucket_id, name) values
  ('scene-assets', '08100000-0000-0000-0000-000000000001/phase-one/tattoo.png'),
  ('scene-assets', '08100000-0000-0000-0000-000000000002/phase-one/tattoo.png');

set local role authenticated;
select set_config('request.jwt.claim.sub', '08100000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"08100000-0000-0000-0000-000000000001","email":"active-a@example.invalid"}', true);
do $$ begin
  assert public.has_active_beta_access(), 'Active owner must pass membership gate';
  assert (select count(*) = 1 from public.scenes where id like 'phase-one-%'), 'Active artists may only read their own scenes';
  assert (select count(*) = 1 from storage.objects where name like '%/phase-one/%'), 'Active artists may only read their own assets';
  update public.scenes set name = 'Saved by active owner' where id = 'phase-one-a';
  assert found, 'Active owners can save their scenes';
  begin
    insert into public.scenes (id, owner) values ('phase-one-cross-owner', '08100000-0000-0000-0000-000000000002');
    raise exception 'Cross-owner insertion unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '08100000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"08100000-0000-0000-0000-000000000003","email":"pending@example.invalid"}', true);
do $$ begin
  assert not public.has_active_beta_access(), 'Pending authenticated user must not have beta access';
  assert (select count(*) = 0 from public.scenes where id like 'phase-one-%'), 'Pending account cannot read scenes';
  begin
    insert into public.scenes (id, owner) values ('phase-one-pending', '08100000-0000-0000-0000-000000000003');
    raise exception 'Pending account created a scene';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('scene-assets', '08100000-0000-0000-0000-000000000003/phase-one/tattoo.png');
    raise exception 'Pending account uploaded an asset';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Approval/activation RPC is unchanged and can still activate the invited user.
reset role;
update public.waitlist set status = 'invited' where email = 'pending@example.invalid';
set local role authenticated;
do $$ begin
  assert public.my_access() = 'active', 'An invitation still activates through the existing verified-session RPC';
  assert public.has_active_beta_access(), 'Activated invitee passes membership checks';
  insert into public.scenes (id, owner) values ('phase-one-approved', '08100000-0000-0000-0000-000000000003');
end $$;

-- A still-valid JWT must lose resource access immediately after revocation.
reset role;
update public.waitlist set status = 'revoked' where email = 'active-a@example.invalid';
set local role authenticated;
select set_config('request.jwt.claim.sub', '08100000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"08100000-0000-0000-0000-000000000001","email":"active-a@example.invalid"}', true);
do $$ begin
  assert not public.has_active_beta_access(), 'Revoked user must fail membership gate';
  assert (select count(*) = 0 from public.scenes where id like 'phase-one-%'), 'Revoked user cannot read previous scenes';
  assert (select count(*) = 0 from storage.objects where name like '%/phase-one/%'), 'Revoked user cannot mint new asset downloads';
  update public.scenes set name = 'Must not save' where id = 'phase-one-a';
  assert not found, 'Revoked user cannot update a previously owned scene';
  begin
    insert into storage.objects (bucket_id, name) values ('renders', '08100000-0000-0000-0000-000000000001/phase-one/new.png');
    raise exception 'Revoked account wrote a render';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
