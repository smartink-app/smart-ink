# Invitation journey

Invite links now lead directly to Google sign-in or an email code. Sending a
code does not consume the invitation. After successful verification, the
server accepts it for the authenticated email and activates beta access.
Google redirects retain the pending invitation in the same tab's session
storage. Failed redemption returns to the invitation with a recovery message.
Used invitations offer sign-in; expired invitations offer a path to request
access. Local demo invitations use the email-code simulator.

## Release dependency

Ship the frontend together with
`supabase/migrations/20261029150000_verified_invitation_redemption.sql`.
The migration removes anonymous redemption and checks the confirmed identity
in `auth.users`; its same-recipient retry behavior handles duplicate auth
callbacks without consuming another invitation. Existing active accounts and
revoked access retain their status. Older clients using anonymous redemption
must refresh to this version.

No live deployment or email send was performed during implementation.

## Validation

Executed: `node tools/invitation-journey.test.mjs`,
`node tools/invitation-page.test.mjs`, `node tools/password-login.test.mjs`,
`node tools/login-flow.test.mjs`, TypeScript checks, and production build.

Database regression coverage is in
`supabase/tests/verified_invitation_redemption.sql`; run it against a disposable
local Supabase database after migrations. This environment had no local
Supabase/PostgreSQL executable, so these database tests have not been executed.
Before release, also exercise real Google return redirects and email delivery
on staging, including wrong-account recovery and two people opening the same
single-use link.
