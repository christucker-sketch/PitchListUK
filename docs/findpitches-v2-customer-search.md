# Customer search document

The customer search layer receives customer-ready projections and builds a search document from fields customers can understand.

Visible listing metadata includes title, organiser, location and adaptive offerings.

Searchable terms include title, organiser, location, canonical region code, and every evidence-backed offering label/kind/cuisine/product. No fixed cuisine or product taxonomy is required.

Example: a listing enriched with `Jamaican jerk / street food / Jamaican / jerk chicken` exposes those values for display and search. A newly discovered term such as `Trinidadian doubles` becomes searchable without a code or taxonomy deployment.

This module is pure preparation only. It does not query D1, create an index, expose a route, enable publication, or change acquisition/classification.
