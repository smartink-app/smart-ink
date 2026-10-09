# 3D feedback demo

Open a project, then choose **Feedback**. Switch between Client view and Artist view to try both sides of a review. Pin feedback to visible skin, leave a general note, reply, and resolve/reopen as the artist. Frame tattoo and Fit model only move the review camera.

Pins use a body mesh ID, triangle index and barycentric coordinates. They follow the current deformed geometry and are hidden when the skin picker cannot see the point. Different body models keep their comments in the panel but do not display the old model's pins. Saved camera views help return to a discussion point; they are not immutable snapshots of the original design. A topology-changing mesh replacement will require anchor migration/versioning before production use.

Review disables tattoo/body editing and undo, suspends scene and thumbnail saves, and restores the artist camera on exit. It does not change the tattoo projection or render contract.

Comments are localStorage data, scoped to the signed-in email and project ID. Writes happen before success is shown; unreadable data, quota errors and stale sequential writes are rejected. Draft text survives an ordinary save failure and has an unload guard. This is a local prototype, not a multi-user database: simultaneous writes from multiple tabs are not transactional. The demo role switch is not authorization.

Before real client sharing: authenticated project invitations, server-enforced participant/artist permissions, transactional threads, revisions tied to a frozen preview, deletion/access expiry, and notifications. No client messages, emails, links or remote access are created by this demo.

Run `npm run test:feedback` for persistence, roles, pointer interaction, anchoring and production Workspace lock/camera guards.
