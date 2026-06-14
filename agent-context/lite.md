# Lite Context

Use when:

- The user requests a small bounded slice in an existing project.
- Existing PBE artifacts or a clear local scope already exist.
- The work is low-risk and does not need full ACEP packaging.

Do:

- Remember that Lite is not bypass.
- Keep mini acceptance criteria, expected files, minimal Test/Evidence, and user-only acceptance.
- Keep File Change Guard active.
- Keep Product -> Work -> Test/Evidence traceability even when reduced.
- Escalate to Full when risk grows.

Do not:

- Treat Lite as permission to skip acceptance criteria.
- Skip user review or user-only acceptance.
- Expand into broad repo conversion.
- Use Lite for unclear product meaning, visual redesign, architecture runway, permissions, DB/schema, API, hardware, concurrency, or repeated rejection.

Escalate / read full docs when:

- The slice touches multiple modules or shared files.
- The user feedback changes product meaning or acceptance criteria.
- File scope cannot be named confidently.

Full references:

- [docs/lite-mode-policy.md](../docs/lite-mode-policy.md)
- [docs/known-limits.md](../docs/known-limits.md)
