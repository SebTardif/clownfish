# Changelog

## Unreleased

- Bound hung `gh` capacity polls with `execFileSync` timeouts so `waitForLiveWorkerCapacity` can honor its deadline. Thanks @SebTardif.
- Bound planner and result-review subprocesses with configurable deadlines, preserving unvalidated output separately and reporting action-free blocked results on timeout. Thanks @SebTardif (#313).
