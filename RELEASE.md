# Release Policy

DevView uses explicit package and plugin versions so users can understand whether a new Codex session is running the
current workflow.

## Version Types

- Patch: documentation, examples, schemas, validator fixes, or report-shape clarifications that preserve behavior.
- Minor: optional DevView lifecycle reports, policy boundaries, validators, or command surfaces that preserve existing
  public paths.
- Major: incompatible public command, artifact, storage, or workflow changes. Avoid these unless migration guidance and
  transition behavior are available.

## Required Release Checks

Before pushing plugin changes, run the focused checks for the touched area plus the requested release validation. Common
checks include:

```text
npm run build:cli
npm run validate:devview
npm run format:check
npm run devview:runtime:smoke
git -c core.longpaths=true diff --check
```

## Compatibility Rules

- Keep public DevView terminology canonical.
- Keep release artifacts focused on DevView production surfaces.
- Treat compatibility as beginning at the first DevView production baseline.
- Do not remove or rename public paths without migration notes and validation.
