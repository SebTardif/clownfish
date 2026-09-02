# Changelog

## Unreleased

- Bound dispatch `gh` children and the publish-backlog probe with timeout and SIGKILL so a hung child cannot stall past the 10 minute backlog-wait deadline.
- Bound planner and result-review subprocesses with configurable deadlines, preserving unvalidated output separately and reporting action-free blocked results on timeout. Thanks @SebTardif (#313).
