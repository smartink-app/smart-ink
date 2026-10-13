# Inspiration moodboards

From Find an artist, choose **Moodboard**, or collect artwork from a portfolio preview. `?view=moodboard` preserves the existing approved-account gate. Public artist browsing does not load the private board or the 3D editor.

Each account can keep multiple boards containing local JPG/PNG/WebP images, web links and notes. Users can describe what they like, record a brief/placement/size, order references and undo removal. Photo preparation happens locally, downscales to 900 px and strips metadata. Links are references, never scraped or embedded remotely. Storage is local to the current browser, with explicit errors on quota, malformed data or stale revisions. Limits: 12 boards, 24 active references per board, 1.2 MB per board and 3 MB per collection. Removed references are retained for undo.

**Create artist request** selects a fictional artist and creates a requested consultation in the same account's demo Artist desk. The client, appointment and frozen moodboard are written together to the artist store; the artist reviews the board and confirms using the existing calendar rules. Later board changes cannot modify that attachment. This simulates both sides locally, not remote artist delivery or authorization.

**Download brief** creates a self-contained HTML file, with inline image copies, escaped text and source links. Users can send that attachment themselves or print it to PDF. Nothing is emailed or published automatically.

For production: separate client/artist identities and project permissions, image object storage, database transactions, real artist directories and request delivery, asset retention/deletion policies, and a client-facing signup flow. Local data is not cloud-synced. The local artist store remains subject to browser quota, so large repeated attachments can fail visibly without losing the board.

Checks: `npm run test:moodboard`, `npm run test:artist`, `npm run test:discovery`, and `npm run test:focus-ui` (approved-account route and session-loss coverage).
