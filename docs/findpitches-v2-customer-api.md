# FindPitches customer API v1 contract

The customer API is first-party FindPitches infrastructure. The frontend consumes this API and never reads D1 directly.

Initial resources:

- `GET /v1/markets`
- `GET /v1/regions?market=GB`
- `GET /v1/opportunities/search`
- `GET /v1/opportunities/:id`

Search contract supports market, region, free text, adaptive offering/cuisine terms, coordinates/radius, cursor pagination and bounded page size.

Offering and cuisine values are deliberately open-ended strings, not enumerations. The API may aggregate discovered values for UI suggestions later, but new authentic cuisines/products do not require a deployment or schema change.

Distance is canonicalised as kilometres at the API boundary. Frontends may display miles for appropriate locales.

This module is a contract/normalisation layer only. It does not expose routes, query D1, enable publication, or connect the frozen Build 4 frontend.
