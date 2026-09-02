# Changelog

## Unreleased

- Bound `gh run download` in `npm run requeue -- <run-id>` so a hung artifact fetch fails after `CLOWNFISH_REQUEUE_DOWNLOAD_TIMEOUT_MS` (default 2 minutes) instead of pinning the process.
- Bound planner and result-review subprocesses with configurable deadlines, preserving unvalidated output separately and reporting action-free blocked results on timeout. Thanks @SebTardif (#313).
