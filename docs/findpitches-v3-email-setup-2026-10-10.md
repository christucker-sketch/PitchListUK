# V3 native mail checkpoint — 10 October 2026

The existing SMTP2GO account is configured inside the owned V3 preview Worker. Its native credential and the verified `findpitches.com` sender domain passed the deployed provider check. At **10:10 London time on 10 October 2026**, SMTP2GO accepted the single authorised sign-in email from `hello@findpitches.com`. The recipient confirmed delivery and successful sign-in; at **10:13**, read-only native database checks corroborated the consumed challenge and active session. No sender, account or domain was created. Live PitchList and V2 remain unchanged.

The environment secret is a proxy reference, not a raw key available for export into a Worker. The first installation copied that reference; the deployed provider check exposed the failure. The implementation now refuses proxy references as native mail credentials and prevents them from becoming deployable local key files. The user replaced the V3 binding directly in Cloudflare, and the deployed provider check then passed. Merely having a secret binding does not prove usable email.

## Completed and verified

- The native sender variable and usable `V3_EMAIL_API_KEY` secret are installed in the owned `findpitches-v3-customer-preview` Worker. No raw mail key was exported to this environment, logs or Git.
- The environment successfully reads existing provider-domain verification using the supplied key. The single-sender endpoint remains permission-restricted; the verified domain is sufficient evidence for this sender.
- Operator-only `POST /preview/email/verify` checks the deployed Worker's own credential directly against SMTP2GO, without sending a message or returning a secret. It now reports `credential_validated=true` and `sender_domain_verified=true`.
- The status endpoint reports `auth.email_configured=true`. The login route still fails closed before trying to send with a proxy reference.
- The real native `/api/v3/session/link` route submitted exactly one authorised test email. SMTP2GO accepted it and the native `auth_link/sent` event count increased by exactly one. A private durable attempt record prevents automatic resends; the recipient and challenge are absent from the committed report.
- The recipient confirmed the email arrived and opened their account. The native database independently confirms exactly one test challenge consumed and an active session for that recipient, without exporting their identity or credentials.
- An uninvited `/api/v3/session` request still receives HTTP 401. Publication and production cutover remain disabled, and the status endpoint reports zero customer-visible READY listings.
- A one-use challenge issued within the private preview can now open a fresh browser and establish both native session and restricted preview cookies. Invalid, expired and replayed challenges grant no access; verification has a durable IP rate limit. Issuing challenges and browsing inventory remain restricted.
- A deployed reserved-example control verified the fresh-browser invitation, native session, logout and one-use replay refusal. It sent no email and added one reserved-example native test account, with no Stripe subscription or charge.
- Unit checks cover SMTP2GO's actual nested domain response, require both DKIM and return-path verification, distinguish read permission denial from authentication failure, and prevent negative evidence or opaque references becoming positive verification claims.

The full V3 suite passes **210/210**, with zero failures or skipped tests. A final focused customer/mail run passes **21/21**. The read-only deployed preservation audit compares 15,811 retained receipts, 108,819 source facts and 7,077 existing identities: zero destructive source mutations, zero identity changes, zero publication/customer projection rows and zero paid queries. V1's production deployment and V2's stopped scheduler are unchanged.

## Credential custody and test outcome

The native key is now configured and verified; no further credential action is required for this test. Future rotations belong in **Workers & Pages → findpitches-v3-customer-preview → Settings → Variables and Secrets**, using the **Secret** named `V3_EMAIL_API_KEY`. `V3_EMAIL_FROM` is `hello@findpitches.com`. Do not change the live `pitchlistuk` project, create a new account/sender, or put the key in chat or Git.

A proxy secret cannot be converted into a raw credential file. Future deployments omit proxy references and preserve the directly installed Cloudflare secret; they never overwrite it with an environment placeholder.

The user-authorised test was submitted once. **Provider acceptance, inbox delivery and recipient sign-in are confirmed.** The challenge was consumed once and cannot be replayed; unused links expire after 15 minutes. Do not automatically retry or expand the recipient list. The synthetic fresh-browser invitation check remains separate control evidence. Alert email delivery remains disabled.

Publication, production cutover, live billing, bulk email and paid acquisition remain disabled. Native mail setup does not recognise or migrate existing paying subscribers; that controlled one-way mapping and launch approval remain separate gates.

[Machine report](../operations/findpitches-v3/reports/customer-email-2026-10-10.json) · [Customer architecture](findpitches-v3-customer-architecture.md)
