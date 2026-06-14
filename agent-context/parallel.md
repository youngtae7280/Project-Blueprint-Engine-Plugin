# Parallel Context

Use when:

- WorkGraph, staged parallel execution, dependency impact, or file scope risk is involved.
- Multiple tasks could run at once.
- Validation commands, generated outputs, or `.pbe` artifacts may collide.

Do:

- Default to sequential unless parallel safety is proven.
- Check same-file, same-artifact, same-state, same-evidence, and same-generated-resource collisions.
- Require integration work and integration evidence for every parallel group.
- Keep generated resources such as `dist`, coverage, temp output, and clean/build steps serialized.
- On Windows, run `validate:pbe` and `test:examples` sequentially.

Do not:

- Parallelize unknown write sets.
- Parallelize shared schemas, shared types, build config, package config, auth, permissions, migrations, or same `.pbe` state transitions.
- Treat distinct Product nodes as automatically parallel-safe.
- Run clean/build/test commands concurrently when they share output paths.

Escalate / read full docs when:

- Shared files or generated outputs are involved.
- Any task has unknown expected files.
- Human approval is needed for a larger parallel group.

Full references:

- [docs/parallel-safety.md](../docs/parallel-safety.md)
- [docs/troubleshooting.md](../docs/troubleshooting.md)
