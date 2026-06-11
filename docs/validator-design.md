# Validator Design

PBE validation is split into small responsibility-focused validators while preserving the historical command:

```text
node scripts/validate-pbe-files.js
npm run validate:pbe
npm run validate
```

## Layers

- `scripts/validate-pbe-files.js`: orchestration entry point and report formatting.
- `scripts/validators/*`: responsibility-focused validators.
- `scripts/validator-utils/*`: shared file, JSON, markdown, and report helpers.
- `scripts/validators/legacy-core.js`: compatibility validator preserved from the previous monolithic implementation.

## Expected Report Shape

```text
[PBE Validate]

✓ Plugin structure
✓ Skills
✓ Templates
✓ Schemas
✓ PBE layout
✓ Autoflow state
✓ WorkGraph
✓ ACEP manifest
✓ Revision
✓ Examples
✓ Compatibility core

Result: PASS
```

Failures should include the validator name, file, error code, message, and a suggested fix.

