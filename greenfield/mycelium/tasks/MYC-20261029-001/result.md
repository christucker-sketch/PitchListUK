## Approach

A pitch claim is really three separate claims: it **exists** (a real, identifiable event/market), it is **open now** (applications currently accepted), and it is **actionable** (date, place, fee and route to apply are all stated). Verify each independently, and require a corroborating source for each, since a listing that is only a repost of another listing proves nothing.

### Test protocol

1. **Existence: two independent sources.** Find the organiser's own channel (website, or an active social page) *and* one source the organiser doesn't control, such as a local council event or licensing page, a venue's calendar, a trade body listing, or dated press and photo coverage of a previous edition. Check that the organiser is a identifiable entity (a named person or body with contact details), and that the venue confirms hosting the event. Aggregators and directories count as leads only, not evidence.
2. **Open now: a dated, primary signal.** Look for an application form or email that currently works, a stated deadline that has not passed, or a recent organiser post (within weeks) calling for traders. Compare the listing's date with today's. A "traders wanted" post from a past season is stale. Check the page's last-modified date or post timestamp, and whether the form still accepts submissions or returns "closed".
3. **Actionable: a completeness check.** Record event date(s), exact location, pitch fee (or explicit "free"/commission), pitch size and type, and application route. Missing fields downgrade the pitch to "lead", not "verified".
4. **Live contact test (where permitted).** A short, polite enquiry to the organiser asking whether pitches remain for the stated date. A reply confirming it is the strongest evidence, and the absence of one after a reasonable window is weak evidence against.
5. **Record provenance.** Store source URLs, retrieval date and the checker's confidence, then re-verify before anyone acts, because availability decays quickly.

### What would make the claim wrong

- The event was cancelled, moved, or is a past edition with an unchanged page.
- Applications are closed, full, or invitation-only despite the listing.
- The organiser can't be identified, or the venue has no record of the event (possible scam or phantom listing).
- The fee or requirements differ from the listing, such as required public liability insurance, food hygiene registration, or a trader-only licence the small trader lacks. These can make a pitch real but not actionable.
- Both "independent" sources trace back to one origin, so there is no real corroboration.

```mycelium-contribution
{"kind": "verification-protocol", "title": "Verify a pitch as three separate claims: exists, open now, actionable, each needing a dated primary or independent source", "body": "Treat a pitch claim as three claims. (1) Exists: organiser's own channel plus one source not controlled by the organiser (council or licensing page, venue calendar, trade body, dated coverage of a prior edition); the organiser must be an identifiable entity and the venue should confirm hosting. Aggregators are leads only. (2) Open now: a working application form/email, an unexpired deadline, or an organiser post within recent weeks; check timestamps, last-modified dates and whether the form still accepts entries. (3) Actionable: date(s), exact location, fee (or explicit free/commission), pitch type/size and application route all present; missing fields mean 'lead', not 'verified'. Optionally send a short enquiry; a reply confirming availability is the strongest evidence. Store source URLs, retrieval date and confidence; re-verify before acting. The claim is wrong if the event is cancelled/moved or the page is a stale past edition, applications are closed or invitation-only, the organiser or venue cannot be confirmed, the fee or requirements (insurance, hygiene registration) differ or exclude the trader, or the two sources share a single origin.", "links": [{"to": "b2339ae1-288b-8fa4-bd83-9bac741808fd", "relation": "answers"}], "stances": [{"node": "b2339ae1-288b-8fa4-bd83-9bac741808fd", "stance": "neutral", "weight": 0.5}]}
```
