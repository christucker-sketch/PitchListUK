# FindPitches customer API service

The service layer sits between HTTP routes and the isolated customer-ready store.

It exposes four operations: markets, regions, opportunity detail, and opportunity search. It normalises incoming search parameters through the customer API contract and hydrates stored JSON fields into customer-facing objects.

This is API version **v1** for the FindPitches **v2 platform**. It has no relationship to the legacy platform.

The service does not expose HTTP routes itself, populate customer-ready storage, enable publication, or alter acquisition/classification.
