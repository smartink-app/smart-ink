-- Consume invitations only after identity verification. Repeated callbacks for
-- the same verified recipient are safe; competing recipients serialize on the row.
create or replace function public.redeem_invite(p_code text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_invite public.invites%rowtype;
  v_status text;
begin
  select public.normalize_email(u.email) into v_email from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'Sign in to accept your invitation.'; end if;
  if v_email <> public.normalize_email(p_email) then
    raise exception 'Use the email this invitation was sent to.';
  end if;
  select * into v_invite from public.invites where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'This invitation could not be found. Ask for a new link.'; end if;
  if v_invite.email is not null and v_invite.email <> v_email then
    raise exception 'This invitation is for a different email. Choose the Google account it was sent to, or use an email code.';
  end if;
  -- Ensure a row exists before locking, including concurrent invites for one email.
  insert into public.waitlist(email, status, source) values(v_email, 'waitlisted', 'invite:' || v_invite.code)
    on conflict (email) do nothing;
  select status into v_status from public.waitlist where email = v_email for update;
  if v_status = 'revoked' then raise exception 'This beta access was revoked.'; end if;
  if v_invite.redeemed_at is not null then
    if v_invite.redeemed_by_email = v_email then return; end if;
    raise exception 'This invitation has already been used. Sign in or ask for a new link.';
  end if;
  if now() >= v_invite.expires_at then raise exception 'This invitation has expired. Ask the sender for a new link.'; end if;
  update public.invites set redeemed_at = now(), redeemed_by_email = v_email where code = v_invite.code;
  update public.waitlist set status = 'active', user_id = auth.uid(),
    invited_at = coalesce(invited_at, now()), activated_at = coalesce(activated_at, now())
    where email = v_email;
end $$;
revoke all on function public.redeem_invite(text, text) from public, anon;
grant execute on function public.redeem_invite(text, text) to authenticated;
