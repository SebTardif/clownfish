# Changelog

## Unreleased

- Bound publish-backlog git and gh children with `CLOWNFISH_PUBLISH_BACKLOG_EXEC_TIMEOUT_MS` (default 2 minutes) and treat `ETIMEDOUT` as a blocked exit 0 so a stalled remote cannot hang dispatch.
- Bound planner and result-review subprocesses with configurable deadlines, preserving unvalidated output separately and reporting action-free blocked results on timeout. Thanks @SebTardif (#313).
