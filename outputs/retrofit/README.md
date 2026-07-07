# Retrofit Smoke Outputs

Generated retrofit smoke reports live here.

Instruction packs live under `instruction-packs/`.

Current reports:

- `devview-legacy-retrofit-smoke-report.json`
- `devview-legacy-retrofit-smoke-report.md`
  - full smoke with external reverted-signature check
  - includes formal CardPrinterConfig graph-source validation status
  - includes generated instruction-pack validation status
- `devview-legacy-retrofit-smoke-report.fixture-only.json`
- `devview-legacy-retrofit-smoke-report.fixture-only.md`
  - fixture-only smoke for environments where the external Utility_Windows repo
    is unavailable

Regenerate with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate-devview-legacy-retrofit-smoke-v0.ps1 `
  -JsonOutputPath outputs\retrofit\devview-legacy-retrofit-smoke-report.json `
  -MarkdownOutputPath outputs\retrofit\devview-legacy-retrofit-smoke-report.md
```
