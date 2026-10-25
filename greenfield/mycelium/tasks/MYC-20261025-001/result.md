1. **Pending tasks can stall indefinitely.** Line: `if [[ $remote == "$last" ]]; then ... exit 0; fi`. After processing five tasks, `last_seen` advances to the current tip; remaining tasks are skipped on subsequent polls until the remote changes.
   **Fix:** Check for pending tasks before taking the unchanged-remote shortcut.

2. **Write failures may be ignored.** Line: `if write_and_push; then break; fi`. Calling this function as an `if` condition suppresses Bash’s `errexit` behavior throughout its body, so failed result writes, staging, or commits can continue into later operations.
   **Fix:** Explicitly check every write, `git add`, and `git commit`, and call `fail` on failure.

3. **Repository symlinks can redirect writes outside the results directory.** Line: `> "$REPO/$HUBSYNC_RESULTS/$id.json"`. A tracked symlink at the results directory or result filename can redirect this write; the later Git diff check does not prevent filesystem damage.
   **Fix:** Reject symlinks in every output-path component and existing destination before creating or writing results.