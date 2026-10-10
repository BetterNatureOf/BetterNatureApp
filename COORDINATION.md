# Coordination — Claude × ChatGPT

Shared ledger for parallel work on BetterNatureApp. Each party updates its own rows; neither edits the other's rows. Before starting a task, add a row claiming the files; before touching a file, check no active row owns it.

## Rules of engagement

- Claude works on branch `claude/vigilant-nash` (and sub-branches cut off main as needed).
- ChatGPT works on its own branch(es), e.g. `gpt/*`.
- Never both edit the same file at the same time. If a file is contested, the second-mover claims it after the first-mover's PR merges (or they re-sync).
- Starting commit = SHA of `main` (or branch) at the moment work began. Always record it so hand-offs can replay the diff.
- When finishing a task, move the row from **Active** to **Done**, add final commit SHA and test results, and clear the files from the "owned files" list.

## Active

| Task | Owner | Branch | Files | Starting commit | Status |
|------|-------|--------|-------|-----------------|--------|
| Pickup update rules — field-level allow (claimant can rewrite any field; claim-via-update theft; restaurant_id/chapter_id in privileged guard) | Claude | claude/vigilant-nash | firestore.rules | 4962e86 | queued — awaiting ChatGPT audit |

## Done

| Task | Owner | Branch | Files | Start → End | Tests |
|------|-------|--------|-------|-------------|-------|
| _(none yet)_ |  |  |  |  |  |

## Hand-offs

_(Note here when work needs to be picked up by the other party: what's done, what's next, where to look.)_
