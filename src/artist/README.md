# Artist desk demo

The Artist desk is available inside the existing approved workspace, from both
Projects and the tattoo editor. Leaving the editor still flushes its scene saves.

The preview supports a weekly agenda; manual appointments; client requests that
require artist approval; editing, rescheduling, cancellation, rebooking and
completion; client records and private notes; project links; manually recorded
quotes/deposits; conversations with simulated client replies; regular opening
hours, turnaround time and blocked periods.

Use **Try client request** to demonstrate the client-to-artist flow. Requests do
not reserve time. Confirmation checks hours, blocked periods, other confirmed
appointments and turnaround time. Hours changes leave existing bookings intact.
All dates/times are interpreted in the current browser's local time zone, which
is displayed under the agenda. Quotes use EUR.

This is a single-artist, local demo, not a deployed scheduling backend. Data is
stored separately for the signed-in account in localStorage. Initial people and
appointments are fictional. Nothing sends email/messages, charges deposits,
invites a client or synchronizes across devices. Storage errors are surfaced
before the UI reports success; stale writes from another tab are rejected.

Before real client use, replace this adapter with authenticated server storage,
artist/client ownership checks and separate private-note access; validate booking
conflicts in a transaction on the server; store the studio time zone explicitly;
add real client access, notifications and payment-provider integration.

Validation: `npm run test:artist` covers the booking rules and persistence failure
paths. `npm run test:focus-ui` covers the navigation and existing access gate.
