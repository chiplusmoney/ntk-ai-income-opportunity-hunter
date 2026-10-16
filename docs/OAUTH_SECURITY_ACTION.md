# OAuth incident status

Date: 2026-10-16. **OWNER SECURITY ACTION STILL REQUIRED**.

The earlier exposed authorization belongs to the Firebase CLI's different cached Google identity, not the sole authorized chiplusmoney identity. This pass inspected account email metadata only and did not print access/refresh tokens. The authorized Neo Google session is chiplusmoney. No attempt was made to switch to or act as the other owner.

The affected account owner should open their own Google Account > Security > Connections to third-party apps and services, select the Firebase CLI connection, and remove its access. This revokes the exposed CLI grant; it does not delete Firebase projects or production data. Reauthorize the CLI only when needed afterward. Do not share a JSON account listing or credential content.

Project credentials and the canonical source/artifacts are separate from this unrelated grant. The dedicated chiplusmoney Firebase session is preserved. No secret value or unrelated owner email is included in this receipt.
