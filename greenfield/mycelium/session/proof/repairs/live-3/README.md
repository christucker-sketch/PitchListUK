# Offline repair of third-run artifact

Copied from evidence/live-3-2026-11-06/final-integration (069e38947d7bb006aff6a4b46bff7e394c37412a). Original evidence remains immutable. Only artifact/frontier.mjs changes; artifact/quote-regression.test.mjs adds two tests. Quoting now begins only after attribute equals, preserving anchors after malformed attribute names and unquoted values.

From this directory, run each with Node read-only permission mode:

    node --permission --allow-fs-read=. checks/frontier.test.mjs
    node --permission --allow-fs-read=. artifact/frontier.test.mjs
    node --permission --allow-fs-read=. artifact/frontier.extra.test.mjs
    node --permission --allow-fs-read=. artifact/quote-regression.test.mjs

Results: 6+16+3+2 PASS. The new regression fails against the archived implementation. Posthoc offline engineering, never relabelled as in-session or OS-sandbox evidence. This repaired snapshot is not loaded into the fresh live-4 fixture; the live proof still tests genuinely generated collaborative work.
