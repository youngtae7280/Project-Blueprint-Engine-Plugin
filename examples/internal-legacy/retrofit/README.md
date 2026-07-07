# Retrofit Examples

Retrofit examples show how DevView works against an existing project where the
original intent is recovered from code, user answers, and evidence.

Current examples:

- `cardprinterconfig/`
  - legacy MFC CardPrinterConfig maintenance scenarios from Utility_Windows
  - includes one validated-then-reverted hardware case and one active
    layout-only UI case
- `open-source/cjson/`
  - first public open-source retrofit dogfood
  - read-only graph-source and planned instruction-pack candidate
  - keeps observed open-source intent separate from maintainer approval

The examples are records and fixtures only. They do not modify the external
project by themselves.

Validate the formal retrofit examples with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate-devview-retrofit-smoke-v0.ps1
```
