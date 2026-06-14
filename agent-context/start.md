# Start Context

Use when:

- The user starts PBE with `@project-blueprint-engine start`.
- The user asks to apply PBE to a new or existing repository.
- The current task is about initialization, profile choice, or first-slice setup.

Do:

- Treat `start` alone as valid.
- Do not require a `Brief:` label.
- Inspect minimal repo signals before initializing: existing `.pbe`, README, package/project metadata, current conversation task.
- Recommend or infer a profile only after the task or slice is reasonably clear.
- Use `pbe profile recommend --brief "<brief>"` when a target task is available.
- Explain that start does not mean broad repo conversion.
- Ask one concise question when the target task or slice is unclear.
- Wait for user confirmation before broad workflow adaptation or large file changes.

Do not:

- Initialize with an arbitrary brief.
- Convert the whole repo just because PBE started.
- Require the user to write Product Tree JSON.
- Create code, docs, decks, images, or review reports before Root confirmation.
- Read every PBE doc before choosing the smallest next card.

Escalate / read full docs when:

- The profile is unclear after minimal inspection.
- The task involves UI/UX, architecture, hardware, migration, parallel work, or repeated review failure.
- The user asks how PBE start works in detail.

Full references:

- [README.md](../README.md)
- [docs/cli-reference.md](../docs/cli-reference.md)
- [docs/lite-mode-policy.md](../docs/lite-mode-policy.md)
