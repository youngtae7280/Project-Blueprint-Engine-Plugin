# CardPrinterConfig SMART-51 `test` Setting Implementation v0

Status: validated / build pass / hardware pass / code reverted

This record converts the prior retrofit candidate match into an implemented
graph delta with user-confirmed hardware validation. The temporary external
code change was later reverted by user request, so this is now a validated
retrofit lifecycle record rather than an active Utility_Windows change.

## User-Confirmed Intent

```text
Name: test
Label: test
Target: SMART-51 Factory Printer screen
Behavior: during real GetConfig, read index 000 and show it
Set: excluded
Save/load: excluded
Other features: excluded
```

## Implemented Shape

The implemented shape matches the safe candidate:

- add a separate read-only display labeled `test`
- populate it from the actual SMART-51 `GetConfig` read of index `000`
- keep the existing `X Start Position` parameter semantics unchanged
- do not add `test` to normal `m_Items` parameter registration
- do not include it in Set, save/load, report, or unrelated feature paths

## Graph Delta

New implementation nodes:

- `change.smart51-factory-test-display`
- `ui.smart51-factory-test-field`
- `code.smart51-getconfig-test-display`
- `boundary.smart51-test-display-only`
- `evidence.smart51-test-build`
- `evidence.smart51-test-hardware`

Important edges:

- `GetConfig index 000 -> test field`
- `test field -> display-only side-effect boundary`
- `build evidence -> implementation`
- `hardware pending -> full device acceptance`

## Code Anchors

Implemented files:

- `src/CardPrinterConfig/CardPrinterConfig.rc`
  - adds the `test` label and `IDC_EDIT_PTYPEF_TEST` read-only edit control
- `src/CardPrinterConfig/resource.h`
  - adds `IDC_EDIT_PTYPEF_TEST`
- `src/CardPrinterConfig/SubDlg51SMART.cpp`
  - clears the field at the start of `OnClick_btnGetConfig`
  - sets the field when `pi->id == P51ITEM_XSTARTPOS`

Avoided files/flows:

- `SubDlg51SMART.h`
- `CPConfigDlg.cpp`
- `OnClick_btnSetConfig`
- `SetConfig`
- `ExSetDevParam2`
- `SaveReportFile`
- `LoadConfigFile`
- normal `P51ITEM_ADDING_INIT2` registration for `test`

## Evidence

Build evidence:

```text
CardPrinterConfig Release_Factory Win32 build: PASS
```

The build-generated `.res` artifact was restored, leaving only the source
changes.

Hardware evidence:

```text
SMART-51 hardware GetConfig validation: PASS
```

User-confirmed result:

```text
The SMART-51 Factory test field displays correctly after actual GetConfig.
```

## Why This Matters

Without this graph delta, a future maintainer or AI could see a `test` field
and incorrectly treat it as a normal configurable parameter. The recorded
intent is narrower: `test` is a read-only projection of GetConfig index `000`,
not a new writable or persisted setting.

## Rollback State

The temporary CardPrinterConfig source change was reverted after successful
hardware confirmation.

Reverted files:

- `src/CardPrinterConfig/CardPrinterConfig.rc`
- `src/CardPrinterConfig/resource.h`
- `src/CardPrinterConfig/SubDlg51SMART.cpp`

Active external code state:

```text
The Utility_Windows CardPrinterConfig source no longer contains the test field.
```

Preserved PBE learning:

```text
The retrofit lifecycle was validated, including intent capture, code anchors,
bounded implementation, build evidence, hardware evidence, and rollback.
```
