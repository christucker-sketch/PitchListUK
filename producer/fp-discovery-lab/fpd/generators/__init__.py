"""Discovery generators: independent strategies that put candidate URLs into the frontier.

Each generator is resumable (records its cursor in kv) and accounts its external API calls.
Yield per generator is measured downstream, and the scheduler shifts crawl budget toward
generators that are actually producing opportunities.
"""
