# V3 native mail checkpoint — 10 October 2026

The existing SMTP2GO account is accessible through the environment's secure proxy. `findpitches.com` has verified DKIM and return-path configuration, covering the user-confirmed sender `hello@findpitches.com`. No sender, account or domain was created. Live PitchList and V2 remain unchanged.

The environment secret is a proxy reference, not a raw key available for export into a Worker. The first installation copied that reference; the deployed provider check exposed the failure. The implementation now refuses proxy references as native mail credentials, prevents them from becoming deployable local key files, and reports mail as unconfigured. Merely having a secret binding does not prove usable email.

## Completed and verified

- The native sender variable is installed in the owned `findpitches-v3-customer-preview` Worker.
- The environment successfully reads existing provider-domain verification using the supplied key. The single-sender endpoint remains permission-restricted; the verified domain is sufficient evidence for this sender.
- Operator-only `POST /preview/email/verify` checks the deployed Worker's own credential directly against SMTP2GO, without sending a message or returning a secret. It currently reports `proxy_reference_is_not_worker_credential`.
- The status endpoint reports `auth.email_configured=false` while the unusable reference remains. The login route fails closed before trying to send with a proxy reference.
- A one-use challenge issued within the private preview can now open a fresh browser and establish both native session and restricted preview cookies. Invalid, expired and replayed challenges grant no access; verification has a durable IP rate limit. Issuing challenges and browsing inventory remain restricted.
- A deployed reserved-example control verified the fresh-browser invitation, native session, logout and one-use replay refusal. It sent no email and added one reserved-example native test account, with no Stripe subscription or charge.
- Unit checks cover SMTP2GO's actual nested domain response, require both DKIM and return-path verification, distinguish read permission denial from authentication failure, and prevent negative evidence or opaque references becoming positive verification claims.

The full V3 suite passes **210/210**, with zero failures or skipped tests. A final focused customer/mail run passes **21/21**. The read-only deployed preservation audit compares 15,811 retained receipts, 108,819 source facts and 7,077 existing identities: zero destructive source mutations, zero identity changes, zero publication/customer projection rows and zero paid queries. V1's production deployment and V2's stopped scheduler are unchanged.

## One remaining credential action

In Cloudflare, open **Workers & Pages → findpitches-v3-customer-preview → Settings → Variables and Secrets**. Replace the **Secret** named `V3_EMAIL_API_KEY` with the same existing raw SMTP2GO key. `V3_EMAIL_FROM` is already `hello@findpitches.com`. Do not change the live `pitchlistuk` project, create a new account/sender, or put the key in chat or Git.

Alternatively, the existing raw key and sender may be supplied in the agreed mail-only mode-0600 credential file. A proxy secret cannot be converted into that raw file. Future deployments omit proxy references and preserve a directly installed Cloudflare secret; they never overwrite it with an environment placeholder.

The user authorised one test sign-in email to their specified address. **It has not been sent.** After the native provider check passes, send that single message, record provider acceptance separately from inbox delivery, and retain the one-use sign-in outcome. Do not automatically retry an ambiguous send or expand the recipient list. Alert email delivery remains disabled.

Publication, production cutover, live billing, bulk email and paid acquisition remain disabled. Native mail setup does not recognise or migrate existing paying subscribers; that controlled one-way mapping and launch approval remain separate gates.

[Machine report](../operations/findpitches-v3/reports/customer-email-2026-10-10.json) · [Customer architecture](findpitches-v3-customer-architecture.md)
