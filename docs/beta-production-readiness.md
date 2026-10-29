# Beta production readiness — 29 October 2026

## Decision

Local implementation and automated checks pass. Ready for staging verification;
production sign-off remains pending. No live database migrations, deployments,
real invitation sends, or live tester access changes were made in this work.
A confirmed Supabase staging project and staging website URL have been requested.

## Creations sharing

The studio now offers Share a creation. Testers select a project thumbnail or a
saved image export, see the exact preview, and explicitly agree to beta-testing
use. The UI says this is optional, for evaluation/troubleshooting only, and does
not grant marketing/publication rights. Only a JPEG preview up to 640px, title,
owner and sharing date are stored. Original uploads and editable scenes remain
private. Later edits do not update the snapshot automatically.

The operator sees shared snapshots inside People → tester → Creations shared for
beta testing. Stop sharing removes the snapshot from future requests; it cannot
recall previously viewed/saved copies. Original projects are unaffected. Hosted
ownership is checked against the actual scene or render row; clients cannot share
another user's resources. Sharing again updates the same snapshot. Operators
cannot use these policies to read private scenes or storage objects. Snapshots
from revoked accounts are hidden from operators. Local demo sharing supports
account-owned project previews only; render previews require hosted accounts.

Apply `20261029180000_beta_creations.sql` after the other beta migrations. This
uses a separate table rather than widening scene or storage access policies.

## Checks completed

- Full `npm run test:phase1`: placement, uploads, export presentation, local
  storage, rendering service/proxy, body shape/pose/appearance, studio,
  snapshots, inspector/history, measurements, focus UI, password access,
  studio interactions and reveal lifecycle/camera.
- Beta admin, operations, feedback store/delivery, journey, invitation journey
  and page, login, local-debug, account profile, Google export/bridge tests.
- Isolated PostgreSQL (PGlite): actual feedback, verified-invitation, operations,
  journey and creations migrations; ownership, cross-account access, private
  triage, revoked/anonymous access, duplicate events, later-day returns, save
  trigger, project/render sharing, invalid sources/preview URLs, withdrawal,
  and the verified-invitation SQL regression script.
- Nine real HTTP/process render-server tests using the existing .focus-venv
  Python and a temporary stand-in renderer. No cloud GPU was used.
- Full ESLint, TypeScript and production build pass. Existing bundle-size
  warnings remain; performance on target devices still needs staging coverage.
- Browser: local invitation/sign-in, project save, image export and timeline
  were verified during journey integration. This pass verified disabled sharing
  before consent, exact preview, acknowledgement, operator visibility, persistence
  after reload, and withdrawal without deleting the original project.

The full suite uncovered stale test fixtures and a theme-module lint issue.
Export tests now supply the added tracking dependency. Focus UI tests isolate
feedback/tracking components (covered by their own tests) and provide matchMedia.
Appearance preferences now live in a separate module, preserving the existing
account settings behavior while satisfying React Fast Refresh lint rules.

## Remaining release gates

1. Confirm staging target and apply the migration set in order. PGlite covers
   database logic, not Supabase Auth, PostgREST, storage or deployed edge functions.
2. Use a real operator and two separate staging testers: email/Google invitation,
   sign-in, save/export, shared feedback, creation sharing/withdrawal, account
   switching and revocation. Verify failures/reconnects and inspect operator data.
3. Verify invitation email delivery and redirect URLs, deployed render gateway,
   cloud export success/failure and render limits. Verify representative devices.
4. Record the exact release revision and deploy that tested revision with its
   matching migrations. No publishing or production-branch change was performed.

See beta-journey-release.md for event definitions, outbox recovery and existing
limits. A successful build and local demo do not establish live readiness.
