# Beta feedback: local prototype and staging boundary

Update: shared feedback and journey integration is now implemented locally; see
[beta-journey-release.md](beta-journey-release.md) for current behavior and release checks.
The notes below describe the earlier implementation.

Branch: feature/beta-feedback. Live beta is unchanged.

## Available locally

- Free comments and journey drafts recover per account after closing/reloading.
- Draft text is never shown in the operator inbox. Session metadata indicates a private draft exists.
- Session outcomes distinguish commented, skipped, not tried, and not reviewed.
- Closing an unfinished review pauses it. Completing the summary with no unsubmitted drafts completes it; opening again starts a new session.
- Journey submissions, session summaries and draft changes use a single localStorage write. Failed writes do not advance the review.
- Comments can be filtered by tester, step, session and test label. Counts follow these filters and the search query; the status selector then narrows the list.
- Old reports are preserved. Old sessions cannot be reconstructed reliably, so they remain in Comments without invented step outcomes.
- Reference editor screens are still illustrative. This does not collect actual visit events.

## Shared storage: prepared, not enabled

The 20261029130000_beta_feedback migration and hostedFeedback adapter are staging preparation only. The UI still uses the local store and is gated to demo mode. No migration has been applied to the hosted database.

Tables separate submitted reports, review session outcomes, and operator triage notes. Owners are derived from authenticated identity; active beta access is required for tester reads/writes. Operators can read reports/sessions and manage triage. Testers cannot read operator notes. Draft text is never part of the adapter payload.

Before enabling hosted collection:

1. Apply the migration to a disposable Supabase staging database with existing beta auth migrations.
2. Verify direct API behavior with two active users, a revoked user, an anonymous caller, and an operator. Check cross-account reads and writes are denied; original creation/ownership fields cannot be rewritten; tester triage access is denied.
3. Wire an async storage interface to the UI. Save session before its report, retry the same IDs safely, and avoid marking a local submission delivered before confirmation. Complete a review only after all pending comments are confirmed.
4. Add staging tests for reconnect/retry, reload recovery, permissions, and operator notes. Current adapter reads are bounded to 500 rows and need pagination before larger cohorts.
5. Replace illustrative references with safe real-screen views before using this for detailed interface research.
6. Verify the end-to-end journey with a separate tester account and operator account before releasing beta.

An optional local Google export bridge is implemented; it was connected to the owner-authorized Apps Script receiver on 2026-10-29 and live delivery was verified. See google-feedback-setup.md. No site publishing or access-policy changes were made as part of the local implementation.
