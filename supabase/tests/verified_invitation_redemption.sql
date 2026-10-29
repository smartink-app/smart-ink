-- Run on a disposable local Supabase database after all migrations.
-- psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/verified_invitation_redemption.sql
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('29150000-0000-0000-0000-000000000001','invite-a@example.invalid',now()),
 ('29150000-0000-0000-0000-000000000002','invite-b@example.invalid',now()),
 ('29150000-0000-0000-0000-000000000003','unverified@example.invalid',null);
insert into public.invites(code,email,expires_at) values
 ('TEST-BOUND','invite-a@example.invalid',now()+interval '1 day'),
 ('TEST-OPEN',null,now()+interval '1 day'),
 ('TEST-EXPIRED',null,now()-interval '1 day');
do $$ begin
 assert not has_function_privilege('anon','public.redeem_invite(text,text)','EXECUTE'), 'Anonymous redemption must be denied';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','29150000-0000-0000-0000-000000000002',true);
do $$ begin
 begin
  perform public.redeem_invite('TEST-BOUND','invite-b@example.invalid');
  raise exception 'Wrong recipient accepted invitation';
 exception when raise_exception then
  if sqlerrm not like 'This invitation is for a different email%' then raise; end if;
 end;
 begin
  perform public.redeem_invite('TEST-EXPIRED','invite-b@example.invalid');
  raise exception 'Expired invite accepted';
 exception when raise_exception then
  if sqlerrm not like 'This invitation has expired%' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claim.sub','29150000-0000-0000-0000-000000000003',true);
do $$ begin
 begin
  perform public.redeem_invite('TEST-OPEN','unverified@example.invalid');
  raise exception 'Unverified identity accepted';
 exception when raise_exception then
  if sqlerrm <> 'Sign in to accept your invitation.' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claim.sub','29150000-0000-0000-0000-000000000001',true);
select public.redeem_invite('TEST-BOUND','invite-a@example.invalid');
select public.redeem_invite('TEST-BOUND','invite-a@example.invalid');
select public.redeem_invite('TEST-OPEN','invite-a@example.invalid');
reset role;
do $$ begin
 assert (select status='active' and user_id='29150000-0000-0000-0000-000000000001' from public.waitlist where email='invite-a@example.invalid'), 'Verified recipient must be active';
 assert (select redeemed_at is null from public.invites where code='TEST-EXPIRED'), 'Failure must not consume invite';
end $$;
update public.waitlist set status='revoked' where email='invite-a@example.invalid';
set local role authenticated;
do $$ begin
 begin
  perform public.redeem_invite('TEST-BOUND','invite-a@example.invalid');
  raise exception 'Revoked account restored';
 exception when raise_exception then
  if sqlerrm <> 'This beta access was revoked.' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claim.sub','29150000-0000-0000-0000-000000000002',true);
do $$ begin
 begin
  perform public.redeem_invite('TEST-OPEN','invite-b@example.invalid');
  raise exception 'Second recipient accepted used invite';
 exception when raise_exception then
  if sqlerrm not like 'This invitation has already been used%' then raise; end if;
 end;
end $$;
reset role;
rollback;
