# cJSON Retrofit Dogfood

Target repo:

```text
work/open-source/cJSON
```

Upstream:

```text
https://github.com/DaveGamble/cJSON
```

Current scope:

- read-only retrofit intake
- graph-source creation
- local README-only dogfood change for a build/test boundary clarification
- no upstream PR

The important PBE behavior under test is not whether Codex can edit cJSON.
It is whether PBE can avoid pretending that inferred open-source intent is
maintainer-approved implementation authority, while still executing a bounded
local doc-only change when explicitly approved.
