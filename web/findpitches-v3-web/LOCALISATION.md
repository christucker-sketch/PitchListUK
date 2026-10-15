# Customer languages

FindPitches uses one customer application and one V3 API. English, German and French are presentation languages; a language never selects a country, proves geography, changes an identity or chooses a subscription currency.

English URLs remain unchanged. `/lang/de/` and `/lang/fr/` prefix the same underlying page paths. For example:

| URL | Interface | Inventory |
| --- | --- | --- |
| `/uk/find-pitches/` | English | GB |
| `/lang/de/uk/find-pitches/` | German | GB |
| `/lang/fr/us/find-pitches/` | French | US |
| `/lang/fr/fr/` | French | France |

The existing `/fr/` remains the France country hub in English. Germany's language support does **not** add DE to the source intake or customer market registry. A German catalogue still requires the country/proof integration and verified inventory described in the Germany handoff.

## Shared implementation

`public/assets/js/locales.js` contains owned interface messages for German and French, keyed by the English message. `i18n.js` provides translation, country-independent language routing, display formatting, controlled application-action labels and conservative SEO metadata. `scripts/build-i18n-module.mjs` generates `server/i18n.mjs`, so the Worker and browser use identical rules and catalogs. Generated files are rebuilt with `npm run build`.

Page scripts call `translateUI(message, [arguments])` for controlled interface text. The `uiHTML` tag translates static template text and accessibility attributes **before** inserting interpolated values. Interpolated source values are never looked up in the catalog. Existing `esc` calls remain necessary: the tag deliberately supports already-escaped values and owned HTML fragments; it is not an HTML sanitizer.

Do not run the static-markup translator on assembled listing HTML or incoming API/source values. It is used only on the owned static asset before dynamic listing data is added, and on tagged static templates. There is no mutation observer translating listing text. Only controlled type/organiser-class labels and billing presentation metadata use explicit label translation.

Original titles, organiser names, venues, notes, source titles, fee wording, IDs and application URLs stay original. A detail-page notice explains the original source language. No translation service is called and no translated source facts are stored. Future translated descriptions must be separate display records with original-field/hash binding, language, translator/version and timestamp; they must never supersede proof or identity.

## Customer behaviour

- The language selector preserves the current country, entity and query parameters. Its choice is stored as a browser preference. Existing internal navigation and sign-in returns preserve the locale prefix. Returning to the root uses a previously selected language; browser language/location never forces a choice.
- Dates, lists, numbers and monetary **formatting** follow the interface language. Country units and the explicitly selected billing currency remain unchanged. A source fee written as free text remains source text.
- Enquiry, vendor registration, email, phone and direct application have distinct labels. Registration and enquiry do not become open applications or guarantee a place. Desktop and mobile actions share the route-label policy; telephone actions use the recorded phone action rather than a guessed web application.
- One account and the existing global Pro entitlement remain. The UI recognises a global plan across supported markets; the server still owns access/redaction. No new price, product, trial or entitlement is introduced.
- Sign-in requests pass `locale: en|de|fr`. The existing sender sends a translated subject/body with the same 15-minute, one-use proof and safe return path. Expired-link recovery retains language. Hosted checkout and Portal receive the validated locale and fixed same-origin localised return paths. A previously created Checkout is reused even if language changes; it keeps its original creation locale. Currency and duplicate/trial safeguards retain precedence.
- Alert email delivery remains disabled. No sign-in message or provider payment object is created by the automated localisation browser checks.

## SEO and rollout controls

Localised pages have a server-rendered language, title, description and self-canonical URL. Localised inventory hubs use the existing source-backed result set and original region names. Interactive/account pages remain noindex.

`V3_LOCALISATION_ENABLED=false` provides an optional whole-feature opt-out: localised routes return 404, the selector is hidden and the root does not restore the language preference. With no opt-out, the code release exposes the interface languages without changing country/source policy.

**German/French indexing is off by default.** `V3_LOCALISATION_INDEXABLE=true` is a separate deliberate operator change, to be considered after language/content review and useful inventory. It cannot bypass the existing inventory eligibility threshold, country launch policy or proof checks. Until then, localised pages are `noindex,follow`, absent from sitemaps and do not advertise language alternates. Restricted preview is always `noindex,nofollow`.

When that gate is open for an eligible page, `hreflang` links English/German/French versions of the **same country and page**, with English as x-default; it does not misrepresent different countries' inventories as equivalent translations. The proof-filtered sitemap can include the corresponding locale paths. Germany's unimplemented country route cannot become indexable through a language flag.

## Validation

Run the frontend build/check and the full V3 suite using the pinned environment. Targeted localisation tests cover literal source values that collide with interface messages, marker injection, immutable model objects, country/currency separation, path guards, SSR/noindex, auth proof replay and mocked hosted-provider locale/price/ownership/idempotency.

`tests/localisation-server.mjs` is a loopback-only synthetic Worker/D1 browser harness. It is outside `public/` and never deployed. Its fresh response `as_of` is independent of the retained synthetic proof clocks. Its test session cookie alias exists only in that harness.

`operations/findpitches-v3/verify-customer-localisation-browser.py` checks both languages on desktop/mobile across home, Finder, detail, country hub, pricing, account, saved, alerts and organiser pages. It compares listing titles with the exact API response rendered, verifies redaction, language/country/filter switching, header bounds and no horizontal overflow. It supports the local fixture, the existing restricted-preview relay with verified upstream TLS, and the actual owned public hostname using the environment's already-trusted CA. It sends no email, starts no Checkout and allows no third-party browser request.

The preview release tool updates only the existing restricted preview's code/assets, verifies native binding/schedule equality and retains its rollback version. Public updates use the existing guarded customer release, preserving account recovery, LIVE configuration, routes, DNS, credentials, customer storage and the independent source service.
