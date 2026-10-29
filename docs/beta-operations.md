# Beta console operations

Update: shared feedback and journey integration is now implemented locally; see
[beta-journey-release.md](beta-journey-release.md) for current behavior and release checks.
The notes below describe the earlier implementation.

Implemented locally on 29 October 2026. No hosted deployment, migration, or real
invitation send was performed by this change.

## Console

- People combines waitlist entries, addressed/redeemed invites, active accounts,
  operator notes, follow-ups and non-test local feedback by normalized email.
  Unclaimed open invitation links do not create imaginary tester records.
- Tester details: name, studio, cohort and internal notes. Search by identity,
  studio, cohort or source; filter by cohort and access status.
- Activity derives dated events from existing records: access requests/record
  creation, invitation creation/redemption, submitted feedback and completed
  follow-ups. Creation is not email delivery. Redemption is not historical proof
  of verified sign-in. Active access is not an engagement measurement.
- Feedback preserves the existing local inbox and supports opening it for a
  particular tester. Private drafts are never added to the people/activity views.
- Follow-ups have a title, due date, context, open/done state and completion date.
  The queue filters open, overdue, done and all tasks. Completed tasks can reopen.
  These tasks do not schedule or send messages.
- Access & invitations remains reachable from every operations view.

The new local store is separate from auth and feedback data. Hosted writes use
an authenticated Supabase client; failures do not silently fall back to browser
storage. The migration `20261029160000_beta_operations.sql` creates operator-only
notes and follow-ups with RLS. Hosted reads paginate both tables. Existing auth
list and feedback adapter limitations are unchanged.

## Release boundary

Apply/test this migration on staging before deploying the console. Verify an
operator can create/read/update records, while anonymous and non-admin accounts
cannot read or write them. Database policy tests have not been executed here.

Feedback is still demo-only. Its Google export is still the local development
bridge. Hosted usage events are not implemented. The console explicitly states
these boundaries rather than displaying inferred usage as measured activity.

## Next implementation order

1. Connect shared feedback storage with acknowledged submissions, retry using
   stable report IDs, and a hosted operator inbox; verify account isolation.
2. Add a shared event store keyed by authenticated user ID, event ID, session ID
   and server timestamp. Do not collect artwork, draft content or credentials.
   Record verified access after identity and access checks; record saves after
   persistence succeeds; record export completion after output is available.
   Track download initiation separately, as browsers cannot prove the file was
   saved to disk. Define a return as a new qualified session on a later date,
   not a token refresh, second tab or component remount. Use a fixed reporting
   timezone, exclude operator/test activity, and show the tracking start date.
3. Add a short first-session task: upload or choose sample artwork, place it,
   save a project, and export. Offer recovery at each failed step.
4. Show cohort conversion and where testers stop. Keep missing historical data
   distinct from observed non-completion; feedback and follow-ups can occur at
   any stage, so the journey need not be strictly linear.
5. Suggest follow-ups from inactivity/failures and resolved feedback. Operators
   review and send messages explicitly. Then run a small hosted pilot.

## Validation

TypeScript checks, targeted ESLint, production build, beta operations model/store
tests, existing admin interaction tests and feedback store tests pass. The build
retains existing bundle-size warnings. Browser checks verified a local test
invitation appears in People, details save, a task is scheduled and marked done,
and reload preserves the tester details and completion activity.
