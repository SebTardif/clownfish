# Changelog

## Unreleased

- Bound `gh secret list` and `gh variable list` in `npm run dispatch` so a hung GitHub CLI skips token-secret preflight after `CLOWNFISH_DISPATCH_SECRET_LIST_TIMEOUT_MS` (default 2 minutes) instead of pinning the process.
- Bound planner and result-review subprocesses with configurable deadlines, preserving unvalidated output separately and reporting action-free blocked results on timeout. Thanks @SebTardif (#313).
