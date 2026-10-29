# Automatic feedback export — local setup

Connected locally on 2026-10-29. Google Apps Script receiver deployed and authorized by the owner. The live browser exporter delivered nine existing test reports plus a new test submission (TEST AUTO EXPORT 01); Google readback verified the new report. Server-only credentials are in ignored `.env.local`. This connection is not deployed to smartink.app.

## Behavior

While the local studio or Beta feedback inbox is open, it checks every 15 seconds for submitted reports. Existing submitted reports are included on first connection, including clearly labelled test data. Private drafts and review session summaries are not exported. Closing the browser pauses exporting; reopening resumes it.

A report's stable ID identifies its row. Google-side status and internal notes are populated on first export and preserved on subsequent updates. Revised comments update source columns A:F. This is a one-way export, not a two-way admin sync. Receipts are saved only after Google acknowledges the report ID. An interrupted request retries the same ID. Google serializes writes with a script lock.

The destination is Smart Ink - Beta, Feedback, header row 7, data starting at row 8. No other tabs are changed. The receiver checks the headers before writing. Test data is labelled in Comment.

## Connect once

1. Sign in as the Smart Ink tracker owner. Open the tracker, then Extensions → Apps Script.
2. Paste `integrations/google-feedback/Code.gs` into the script editor.
3. Generate a random secret locally, for example `openssl rand -hex 32`. Keep it out of chat and source control.
4. Under Apps Script Project Settings → Script properties, add `FEEDBACK_SECRET` with that value.
5. Deploy as a Web app, executing as yourself. The local server needs to call it without an interactive Google session, so choose access “Anyone” if your Workspace policy permits it. The receiver rejects requests without the secret. Review Google's authorization prompt yourself. Do not relax Workspace policy if this option is unavailable; use an approved service account integration instead.
6. Add these **server-only** settings to `.env.local` (never use a `VITE_` prefix):

   ```dotenv
   GOOGLE_FEEDBACK_WEBAPP_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
   GOOGLE_FEEDBACK_SECRET=YOUR_RANDOM_SECRET
   ```

7. Restart the local development server. Open Beta feedback: its connection status will report success only after Google acknowledges all pending reports.
8. Submit a labelled test comment; verify its ID and text in Google. Edit the comment and verify there is still one row. Temporarily disconnect the network, submit another test, reconnect and verify delivery. Edit its status/notes in Sheets and verify a comment revision preserves those values.

If script code changes, publish a new deployment version. To pause export, remove the local environment settings and restart. Rotate the secret in both locations if compromised.

## Security and deployment boundary

The secret stays in the local Vite server and Apps Script properties. The browser never receives it. The local bridge only accepts loopback connections, an exact loopback Host, same-origin requests, bounded JSON, and the fixed Google Apps Script URL configured by the owner. User content is written as literal text, not spreadsheet formulas.

The Vite bridge is development-only. It is not shipped in the production browser build. Before online beta rollout, wire shared feedback storage and move the exporter behind authenticated server-side access with a durable job queue. This prototype must not be exposed as a public unauthenticated export endpoint.

Checks: `node tools/google-feedback.test.mjs`, `node tools/google-feedback-bridge.test.mjs`, `node tools/beta-feedback-store.test.mjs`, `npm run typecheck`, `npm run build`.

Reference: https://developers.google.com/apps-script/guides/web
