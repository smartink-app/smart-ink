# Artist discovery preview

Open **Find an artist** on the landing page, or use `?view=artists`. This public,
lazy-loaded page does not include the editor or the artist desk. Opening the
studio still goes through the existing access gate.

The main view provides portfolio cards, combined name/studio/style search, city
and style filters, an illustrative availability filter, sorting, a locally saved
shortlist, and lightweight portfolio previews. It supports both UI themes.

All six artists, studios and availability states are fictional. Images are
existing Smart Ink renders and sample tattoo artwork, not portfolios attributed
to real people. No real artist profiles or bookings are connected. The separate
Artist desk demonstrates the request/approval workflow with its own local data.

`npm run test:discovery` checks filtering, saved-only intersections, sort stability,
image availability and that the public page has no private-workspace dependency.
Access routing is also covered by `npm run test:focus-ui`.

Approved beta users can now open **Moodboard** from discovery, collect portfolio references, and attach a saved inspiration brief to a local Artist desk consultation request. Public visitors still pass through the existing access gate before opening boards. See `../moodboard/README.md`.
