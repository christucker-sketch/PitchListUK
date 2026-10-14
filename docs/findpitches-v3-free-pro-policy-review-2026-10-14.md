# Free/Pro identity-disclosure candidate

**Prepared for ChatGPT/Chris review; not activated in production.**

The current product exposes event titles, organiser/location identity and genuine pins to Free users, while withholding source/application links. Those details make independent Google lookup straightforward. [Current execution order](../team/ORDERS.md) explicitly says: “Do not implement a final paywall model until ChatGPT has recorded the agreed product rule.” No final rule is recorded at this checkpoint.

The candidate keeps truthful country/region/category/month/status counts and search breadth, but presents unsampled Free results as “Verified opportunity”, with source-backed broad region, month and current application status. Pro retains the existing worldwide view under canonical entitlement. A fixed operator-reviewed sample can show identity; the prepared transform caps that set at eight, defaults to zero, and never rotates it with pagination/filters. Eight is a review bound, not an approved sample size.

Unsampled Free responses omit event title, organiser, venue/street, exact date/deadline, canonical event path, source/application links and exact coordinates. Their markers are withheld alongside cards. The prepared frontend renders a region/month/status teaser with an “Unlock details with Pro” action. Present production responses never set this flag, so existing behaviour is unchanged.

The [server transform](../platform/findpitches-v3/commercial-disclosure-preview.mjs) is deliberately not imported by the customer Worker. Tests prove unchanged counts/source input, removal of identity/coordinates/paths, preservation of canonical Pro rows and fixed sample limits across pages. This is a concrete server and card candidate, not CSS-only hiding.

Before activation, the product owner must record sample size/selection, date granularity and Free search policy. The server rule must cover list/detail/drawers, boot/home/upcoming, saved listings, maps, direct IDs, search-query behaviour and SEO/JSON-LD/canonical pages. Free exact-title/venue query enumeration and public SEO disclosure need explicit decisions; changing cards alone leaves alternative disclosure paths. Preserve source evidence/identity and currency-independent global Pro; re-run the complete access/browser/SEO matrix before approved deployment.

No pricing, trial, entitlement, publication setting, customer object or production gate changed for this preparation. Genuine owned LIVE Checkout/global Pro/Portal acceptance remains separate.
