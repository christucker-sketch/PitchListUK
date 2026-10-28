#!/usr/bin/env bash
# Offline end-to-end rehearsal of the L2 bridge: the EXACT tasks 005/006 and bridge-launch.sh through the real repo
# myc-stageb -> myc-gate -> myc-agent (v6) with FAKE claude/codex CLIs and a local bare repo; then the real bridge ingest
# into PGlite seeded with the same memory as Neon. No network, no Neon, no model, no root.   bash test-bridge-chain.sh
set -uo pipefail
for c in git jq flock iconv dd timeout awk node; do command -v $c >/dev/null || { echo "bridge chain tests: need $c"; exit 1; }; done
D=$(cd "$(dirname "$0")" && pwd); S=$D/../stageb; MEM=$D/../memory; GATE=$S/myc-gate; STAGEB=$S/myc-stageb; AGENTX=$S/myc-agent
LAUNCH=$D/bridge-launch.sh SNAP=greenfield/mycelium/collab/memory-recall-2026-10-28.md TD=greenfield/mycelium/tasks
REPO_TD=$(cd "$D/../tasks" && pwd); IDS=(MYC-20261028-005 MYC-20261028-006); B=findpitches-v3/greenfield
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
export GIT_AUTHOR_NAME=chris GIT_AUTHOR_EMAIL=c@x GIT_COMMITTER_NAME=chris GIT_COMMITTER_EMAIL=c@x
mkdir -p "$T/stub" "$T/bin" "$T/w/hs" "$T/w/spool" "$T/w/myc" "$T/w/ctl" "$T/w/decisions"
# 1. a snapshot rendered by the REAL bridge from PGlite seeded like Neon
(cd "$MEM" && node --input-type=module -e "
  import { PGlite } from '@electric-sql/pglite'; import { writeFile } from 'node:fs/promises';
  import { migrate } from './src/schema.mjs'; import { explorerA, explorerB } from './examples/fixtures.mjs'; import { snapshot } from './scripts/bridge.mjs';
  const pg = new PGlite('$T/pgdata'); const db = { query: async (s, p = []) => (await pg.query(s, p)).rows,
    transaction: ss => pg.transaction(async tx => { const o = []; for (const s of ss) o.push((await tx.query(s.text, s.values ?? [])).rows); return o; }) };
  await migrate(db); const a = await explorerA(db, { synthetic: true, run: 'live-proof-2026-10-28-a' });
  await explorerB(db, { synthetic: true, run: 'live-proof-2026-10-28-b', aRun: 'live-proof-2026-10-28-a' });
  const s = await snapshot(db); await writeFile('$T/snapshot.md', s.text); await writeFile('$T/ids.json', JSON.stringify(a)); await pg.close();") \
  || { echo "could not build the snapshot"; exit 1; }
F=$(jq -r .finding "$T/ids.json") X=$(jq -r .failure "$T/ids.json")
# 2. fake CLIs that save their prompt and answer with a valid contribution block
cat > "$T/stub/claude" <<EOF
#!/usr/bin/env bash
[[ \$1 == auth ]] && { echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'; exit 0; }
[[ \$1 == --version ]] && { echo "2.1.308 (Claude Code)"; exit 0; }
cat > "\$CTL/prompt.claude"
a=\$(printf 'Cofactor, not temperature.\n\n\`\`\`mycelium-contribution\n{"kind":"hypothesis","title":"K7 needs a metal cofactor","body":"Chelate metals at 30 C.","links":[{"to":"$F","relation":"explains"},{"to":"$X","relation":"reinterprets"}],"stances":[{"node":"$X","stance":"contradicts","weight":0.5}]}\n\`\`\`\n')
jq -n --arg r "\$a" '{type:"result", is_error:false, result:\$r, usage:{input_tokens:5, output_tokens:20, cache_read_input_tokens:0}, modelUsage:{"claude-sonnet-5-5":{}}, total_cost_usd:0.01}'
EOF
cat > "$T/stub/codex" <<EOF
#!/usr/bin/env bash
[[ \$1 == login ]] && { echo "Logged in using ChatGPT"; exit 0; }
[[ \$1 == --version ]] && { echo "codex-cli 0.164.0"; exit 0; }
cat > "\$CTL/prompt.codex"
out=""; prev=""; for a in "\$@"; do [[ \$prev == -o ]] && out=\$a; prev=\$a; done
printf 'Refine it.\n\n\`\`\`mycelium-contribution\n{"kind":"probe_design","title":"Chelator titration","body":"EDTA at 10, 20, 30 C.","links":[{"to":"@MYC-20261028-005","relation":"refines"},{"to":"$F","relation":"tests"}],"stances":[]}\n\`\`\`\n' > "\$out"
echo '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":0,"output_tokens":20}}'
EOF
printf '#!/usr/bin/env bash\nexec "$@"\n' > "$T/bin/myc-run"; chmod +x "$T/stub/"* "$T/bin/myc-run"
# 3. a remote holding the snapshot and the EXACT task files, as the PC snapshot commit + the hub commit will leave it
git init -q --bare "$T/w/remote.git"; git clone -q "$T/w/remote.git" "$T/w/human" 2>/dev/null
(cd "$T/w/human" && git checkout -q -b "$B" && mkdir -p "$(dirname "$SNAP")" && cp "$T/snapshot.md" "$SNAP" \
  && for id in "${IDS[@]}"; do mkdir -p "$TD/$id/events"; cp "$REPO_TD/$id/task.json" "$REPO_TD/$id/events/0001.json" "$TD/$id/" 2>/dev/null; mv "$TD/$id/0001.json" "$TD/$id/events/"; done \
  && git add -A && git commit -qm "snapshot + bridge tasks" && git push -q origin "$B") 2>/dev/null
git clone -q --branch "$B" "$T/w/remote.git" "$T/w/hs/repo" 2>/dev/null
: > "$T/w/allowed"; for id in "${IDS[@]}"; do echo "$id $(jq -r .assigned_agent "$REPO_TD/$id/task.json") $(git hash-object "$REPO_TD/$id/task.json")" >> "$T/w/allowed"; done
export PATH="$T/stub:$PATH" MYC_TEST=1 MYC_BILLING_CONFIRMED=yes COLLAB_TEST=1 CTL=$T/w/ctl MYC_HOME=$T/w/hs MYC_SPOOL=$T/w/spool \
  MYC_STATE=$T/w/state/state.json MYC_AS_MYC="env HOME=$T/w/myc" MYC_GATE=$GATE MYC_AGENT=$AGENTX MYC_DECISIONS=$T/w/decisions \
  MYC_GUARD=$T/bin/myc-run MYC_ALLOW=$T/w/allowed T_ALLOW=$T/w/allowed T_AS_HUBSYNC="env HOME=$T/w/hs" T_GATE=$GATE T_STAGEB=$STAGEB
st() { MYC_MAX_CALLS=2 "$GATE" state "$1" 2>/dev/null | head -1; }
res() { git --git-dir="$T/w/remote.git" show "$B:$TD/$1/result.md" 2>/dev/null; }

echo "1. the exact tasks pass the writer's contract; the snapshot passes the ref rules"
good=1; for id in "${IDS[@]}"; do [[ $(st "$id") == "$id pending seq=1" ]] || { good=0; echo "    $(st "$id")"; }; done
[[ $good == 1 ]] && ok "tasks 005 (claude) and 006 (codex) are pending under the five-field contract" || bad "task contract"
[[ $(wc -c < "$T/snapshot.md") -le 32768 ]] && ! LC_ALL=C grep -qaP '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' "$T/snapshot.md" && ok "snapshot $(wc -c < "$T/snapshot.md") bytes, clean text" || bad "snapshot rules"

echo "2. the launcher: two calls, in order; Claude sees the memory; Codex sees the memory AND Claude's answer"
bash "$LAUNCH" > "$T/w/out" 2>&1; r=$?
[[ $r == 0 && $(st MYC-20261028-005) == *completed* && $(st MYC-20261028-006) == *completed* ]] && grep -q 'DONE: both turns' "$T/w/out" && ok "both turns completed" || { bad "launch"; cat "$T/w/out"; }
grep -q "## Reference: $SNAP" "$T/w/ctl/prompt.claude" && grep -q "$F" "$T/w/ctl/prompt.claude" && ok "Claude's prompt carries the recalled memory (incl. A's discovery id)" || bad "claude prompt"
grep -q "## Reference: $SNAP" "$T/w/ctl/prompt.codex" && grep -q "K7 needs a metal cofactor" "$T/w/ctl/prompt.codex" && ok "Codex's prompt carries the memory and Claude's unedited answer" || bad "codex prompt"
bash "$LAUNCH" > "$T/w/out" 2>&1; grep -c 'already completed' "$T/w/out" | grep -qx 2 && ok "a rerun makes no call" || bad rerun

echo "3. ingest the two published results into memory (the real bridge), linked to the memory and to each other"
res MYC-20261028-005 > "$T/r5.md"; res MYC-20261028-006 > "$T/r6.md"
R5=$(git --git-dir="$T/w/remote.git" show "$B:$TD/MYC-20261028-005/events/0002.json" | jq -r .run_id); R6=$(git --git-dir="$T/w/remote.git" show "$B:$TD/MYC-20261028-006/events/0002.json" | jq -r .run_id)
out=$(cd "$MEM" && node --input-type=module -e "
  import { PGlite } from '@electric-sql/pglite'; import { readFile } from 'node:fs/promises'; import { ingest, contributionId } from './scripts/bridge.mjs';
  const pg = new PGlite('$T/pgdata'); const db = { query: async (s, p = []) => (await pg.query(s, p)).rows,
    transaction: ss => pg.transaction(async tx => { const o = []; for (const s of ss) o.push((await tx.query(s.text, s.values ?? [])).rows); return o; }) };
  const made = await ingest(db, await readFile('$T/snapshot.md', 'utf8'), [
    { task: 'MYC-20261028-005', cli: 'claude', run: '$R5', answer: await readFile('$T/r5.md', 'utf8') },
    { task: 'MYC-20261028-006', cli: 'codex', run: '$R6', answer: await readFile('$T/r6.md', 'utf8') }]);
  const e = await db.query('SELECT relation FROM mycelium_memory.edges WHERE source_id = \$1 AND target_id = \$2', [made[1].id, made[0].id]);
  console.log(JSON.stringify({ made, codexToClaude: e.map(x => x.relation) })); await pg.close();" 2>&1)
echo "$out" | jq -e '.made | length == 2' >/dev/null && echo "$out" | jq -e '.codexToClaude == ["refines"]' >/dev/null \
  && ok "both CLI answers became memory; Codex's contribution links 'refines' to Claude's" || { bad ingest; echo "$out"; }

echo; echo "bridge chain tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
