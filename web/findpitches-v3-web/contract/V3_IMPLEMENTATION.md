# Implemented native V3 preview contract

The standalone Build 4 contract is implemented by the owned V3 customer Worker and separate customer database. Only `public/` is deployed. `dev/` and its 1,903 producer fixtures are local test material, never a runtime or inventory source.

The approved product policy is free search, with application/source links and alerts on Pro. Readiness remains stricter than a producer label:

- Source/revision/version-matched READY and fresh proof are required. Latest LOW-confidence, non-current and non-READY producer observations are withheld.
- OPEN_NOW and ROLLING need supported vendor-application proof. ENQUIRY_AVAILABLE remains WATCH unless the designed source-proof policy changes through an explicit reviewed decision. No inference makes it pass.
- IDs are existing stable V3 `ent_` IDs. No frontend mapping changes identity.
- Country, organiser, location, dates, route and state come from proof. Category/type/vendor suitability, fees and coordinates are null/empty until independently supported; the UI uses neutral presentation.
- Proven region codes/literal region names are supported. Postcode resolution, map pins and radius are disabled rather than approximated. Literal place search is conservative.
- Free and cross-market application/source routes are redacted on the server.
- Closed, withdrawn, expired or held records disappear from eligible reads without deleting any evidence. Expanded saved items follow this gate.

Clean routes use the copied server SEO/routing module. Server metadata and client pages remain noindex in shadow; robots disallow crawling and shadow sitemaps are empty. Source-provider outbound links are normal user hyperlinks, not browser-side API dependencies.

The API client calls only same-origin `/api/v3/*`. Native passwordless challenges, revocable sessions, profile/saved/alert/inbox persistence and test billing are owned by V3. Stripe TEST mode is enforced, with an independent portal configuration and signed webhook; no live billing/customer movement is enabled. Alert storage exists; alert email delivery stays disabled. Native login email requires the accessible existing SMTP2GO credential and verified sender copied into V3's own bindings.

The user explicitly permits reuse of existing Stripe and SMTP2GO accounts. Provider-account reuse does not permit legacy runtime imports or shared legacy session/customer storage.

Tests distinguish local fixture checks from real deployed source-proof inventory. `tests/native-preview.py` exercises real V3 IDs and data; the local stub smoke runner does not prove commercial quality. The environment's browser relay retains upstream HTTPS verification and is not proof of direct Chromium TLS or native browser cookie scope.
