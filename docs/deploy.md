# Public beta release checklist

Reviewed against the local `studio-test` code on 13 October 2026. This document
describes release checks; it does not confirm that the hosted configuration,
database migrations, email delivery, DNS or GPU worker have been validated.

## Hosting and release branch

- **Cloudflare Pages** serves the Vite frontend from `dist/`. The established
  beta URL is `https://smart-ink-beta.pages.dev`; the intended public domain is
  `https://smartink.app`.
- **Hostnet** remains the domain registrar. Cloudflare manages DNS after the
  nameserver change has activated. Pages provides frontend hosting and HTTPS.
- **Supabase** provides approved-account authentication, access requests,
  invitations, saved scenes, private image storage and render history.
- **RunPod Serverless** renders still images through the Supabase `render-job`
  function. Browser code must never receive a RunPod API key or Supabase service
  role key. The previous Cloud Run HTTP renderer is an optional fallback.

The local product changes are on `studio-test`. The previously configured Pages
production branch was `beta`; confirm the current dashboard setting and exact
deployed commit before releasing. A successful local build does not publish this
branch. Review the working changes, choose a release commit, and deploy that same
commit through the configured Pages project. Do not change the production branch
or push a release as a side effect of local testing.

## Product boundaries

Hosted auth, scene and render-history adapters exist. Their end-to-end hosted
behavior still needs the smoke tests below. With Supabase configured, scenes and
their placed artwork use private account storage.

These newer features are **local prototypes**, including in a hosted build:

- Artist desk and Client space use one account's browser-local demo records.
  Client messages, appointments and deposits are simulated; nothing is sent or
  charged. Changing the preview role is not multi-user authorization.
- Feedback, shared design versions and decisions are browser-local records.
  They do not grant another person remote access to a project.
- Moodboards are local to this browser/account. A request creates a demo
  consultation locally. Downloading a brief does not deliver it anywhere.
- Artist discovery contains fictional artists, studios and availability.
- The reusable Artwork library is browser-local and account-scoped. Legacy
  uploads under the old unowned `smartink:tattoo-library:v1` key are preserved,
  but not silently assigned to any account. Re-import them into the intended
  account's library; artwork already embedded in saved scenes is unchanged.
- Motion/video export is available only with the local renderer; it is disabled
  for RunPod/cloud rendering.

Keep these boundaries visible wherever testers enter the prototypes. Real client
sharing requires separate identities, server-enforced project permissions,
transactional storage and delivery. Visual cleanup does not add those services.

## Build configuration

Pages build command: `npm run build`. Output directory: `dist`. Use Node 22,
matching `.github/workflows/ci.yml`. Vite reads frontend environment values at
build time; changing an environment setting requires a new build.

| Frontend variable | Release use |
| --- | --- |
| `VITE_SUPABASE_URL` | Hosted Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | Browser-safe Supabase anon/publishable key, never the service role key. |
| `VITE_RENDER_BACKEND` | Set to `runpod` for the authenticated render gateway. |
| `VITE_RENDER_URL` | Only for the legacy HTTP render path; it does not select RunPod. |
| `VITE_WAITLIST_ENDPOINT` | Optional request destination when Supabase is absent; not needed with hosted Supabase requests. |
| `VITE_CONTACT_EMAIL` | Optional request-delivery fallback contact shown in the UI. |
| `VITE_AUTH_MODE` | `demo` is development-only and cannot enable demo sign-in in a production build. |

Production without both Supabase settings disables sign-in. The landing page must
also have a working request destination: a local demo request is not a delivered
beta request. Inspect the effective Pages production environment; `.env.local`
behavior is not evidence of hosted configuration.

## Domain, auth and render prerequisites

1. Confirm `smartink.app` is active in Cloudflare after the Hostnet nameserver
   change. Preserve Google MX, SPF, DKIM, DMARC and verification records.
2. Associate `smartink.app` with the existing Pages project using Custom domains.
   Resolve conflicting legacy website records when setting up the Pages record.
   Verify HTTPS and the intended `www` redirect if `www` is used.
3. Set Supabase Auth's site URL to the canonical domain and allow the exact OAuth
   return URL. Google sign-in requests the current origin/path. Keep the beta
   domain permitted if it remains an intentional preview entry.
4. Configure the `send-invite` function's `SITE_URL`, `INVITE_FROM` and
   `RESEND_API_KEY`. Invite emails must point to the public domain. Confirm the
   email-code template/provider settings in `supabase-setup.md`.
5. Add `https://smartink.app` to the deployed `render-job` function's
   `RENDER_ALLOWED_ORIGINS`. Its source default permits the beta Pages domain and
   localhost, **not** `smartink.app`. Each other origin needs explicit inclusion.
6. Confirm `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` are configured server-side.
   Inspect the endpoint's image and scaling. Min 0/max 1 supports queued jobs with
   scale-to-zero; max 0 cannot start workers. The gateway health response checks
   configuration presence, not live worker readiness.
7. Review applied Supabase migrations against `supabase/migrations/`, especially
   `20261008120000_active_beta_resources.sql`. Earlier local readiness notes record
   it as unapplied. Its policies require active beta membership for scenes, render
   history, jobs and private assets. Run `supabase/tests/active_beta_resources.sql`
   in a suitable test environment and verify real active, revoked, unapproved and
   anonymous accounts.
8. Ensure the worker image includes the current studio/skin assets and render
   contract. Follow `render-gateway.md` and the immutable image workflow;
   deploying the frontend does not update the worker.

## Local validation

Install dependencies using `npm ci`, then run once for the release candidate:

```bash
npm run typecheck
npm run lint
npm run test:phase1
npm run test:artist
npm run test:client
npm run test:versions
npm run test:feedback
npm run test:discovery
npm run test:moodboard
node tools/tattoo-library.test.mjs
node tools/runpod-render-service.test.mjs
deno test tools/render-gateway.test.ts
npm run build
```

`test:phase1` includes core demo regressions. Repeat only suites affected by later
changes. CI runs core and prototype suites on `main`, `beta` and `studio-test`. CI rejects
`dist/` over 80 MiB (70 MiB reviewed baseline including starter artwork and skin atlases). Keep Blender working files outside `public/`; inspect the
actual release output rather than relying on an old size estimate.

## Live smoke tests before inviting testers

Use the chosen release on the public HTTPS origin and a fresh test account:

1. Request access and confirm it appears in the operator view. Approve/invite,
   receive the real email, redeem it, sign in, sign out and sign in again. Check
   Google return routing if offered. Verify denied/revoked access.
2. Create a project, upload artwork, place it, make one change, navigate away and
   reopen. Reload, then reopen from a separate browser to prove hosted persistence.
   Check account isolation with a second account, including the local library.
3. Produce one still render on RunPod, download it and reopen it from history.
   Use a representative Detailed render to verify the current worker and private
   image storage. Test cancellation once with its reported outcome. This starts
   billable work and requires the intended endpoint to be available.
4. Check the homepage, sign-in, projects, Artwork, Client space, Artist desk,
   discovery/moodboards, dialogs and studio controls at desktop and narrow widths.
   Confirm prototype labels, empty/error states, return navigation and keyboard
   focus. Leave the existing 3D behavior unchanged during presentation cleanup.

Cloud rendering currently needs the page left open until completion: there is no
resume-on-reload/background finalization flow. Document this tester limitation.
Existing signed render links expire after 30 days and are not revoked immediately
when account access is revoked. No live smoke test above is implied by a passing
mocked test, local demo session, build or configured health response.
