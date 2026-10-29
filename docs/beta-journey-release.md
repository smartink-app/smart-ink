# Shared feedback and beta journey integration

Implemented locally, 29 October 2026. No live deployment, live database changes,
or real invitation email sends were performed in this work.

## Implemented

Hosted feedback is now available from the authenticated studio. Comments and
experience-review submissions use explicit authenticated user IDs, stable report
IDs, and a durable per-account browser outbox. Session metadata is delivered before
its report. Only acknowledged reports advance the review or show a received message.
Failed/ambiguous requests retain the same IDs for retry. Queues retry on reconnect,
on opening the studio, or via Retry delivery. Private draft text is never sent;
submitted reports contain only the fields shown to the tester. Google export remains
local-only and is not mounted in the hosted interface.

The shared operator inbox reads reports, sessions, profiles and triage with pagination.
Operators can update status and internal notes. People and Activity now include
shared feedback and journey events, with visible errors if a migration is missing.

Journey definitions:

- First verified studio access: an active, confirmed account reaches the studio.
  This includes an existing session's first observed access, not only a new login.
- First project saved: the hosted database acknowledges a scene insert or update.
  A trigger records it in the same transaction; local demo saves record after success.
- First image export ready: canvas image creation or completed photo rendering,
  independent of history persistence. It does not prove a file download completed.
  Video exports are outside this first iteration.
- Studio visit: at most one observation per account per UTC date when entering
  the studio. A reconnect can also record that day's visit. No background heartbeat.
- Returned: a visit on a later UTC date than a previously recorded visit.

The database deduplicates milestones/daily visits. Operator accounts are excluded
from hosted journey events. Historical usage is not backfilled. Missing milestones
mean not observed, not necessarily never done. Export delivery failures queue one
pending marker per account and retry on studio entry or reconnect. Hosted timestamps
are server receipt times; delayed export delivery is not an exact action timestamp.
Tracking failures never turn successful editing/exporting into a product error.
Email delivery tracking and cohort conversion charts remain separate future work.

## Verification completed

- TypeScript, targeted ESLint, production build and diff whitespace checks.
- Feedback delivery tests: offline persistence, account switching, ambiguous response,
  same-ID retry/update, stripping client identity/triage, session-before-report order,
  and failed local outbox writes.
- Journey tests: milestone and UTC-day deduplication, later-day return, independent
  accounts and nonblocking tracking failure.
- Existing login, invitation, admin, feedback store, scene save and snapshot tests.
- Real local browser: accepted the existing test invitation, created a project,
  completed a quick image export, and verified all three milestones in Activity.
- Isolated PGlite PostgreSQL runtime: applied the exact feedback, operations and
  journey migrations and tested cross-account RLS, operator-only notes/triage,
  revoked and anonymous access, verified identity, save trigger and deduplication.
  The test bootstraps Supabase auth helpers and existing gate/scene definitions;
  it omits pgcrypto invitation generation, storage infrastructure and network auth.
  Run with PGLITE_MODULE pointing to an installed PGlite module:
  `node tools/beta-hosted-db.test.mjs`.

## Hosted release remains

1. Apply the existing active-resource and verified-invitation migrations plus
   `20261029130000_beta_feedback.sql`, `20261029160000_beta_operations.sql` and
   `20261029170000_beta_journey.sql` to staging, in migration order.
2. Test the real hosted auth/database API using an operator and two separate testers,
   including revocation, reconnect/reload retries, failed render/save, and the inbox.
3. Verify real email/Google redirects and the complete invitation-to-export journey.
4. Deploy the compatible frontend after staging passes. Do not treat local demo or
   isolated PostgreSQL verification as proof that the live service is configured.

Pending outbox data is device-local and survives reload, but clearing browser data
removes unsent submissions. Closing the browser pauses delivery. The console shows
only confirmed hosted feedback. Internal console notes/follow-ups are operator-only.
