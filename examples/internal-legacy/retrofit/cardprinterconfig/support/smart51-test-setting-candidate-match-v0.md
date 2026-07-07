# CardPrinterConfig SMART-51 `test` Setting Candidate Match v0

Status: validated / build pass / hardware pass / code reverted

Implementation record:

```text
examples/internal-legacy/retrofit/cardprinterconfig/records/smart51-test-setting.validated-then-reverted.json
examples/internal-legacy/retrofit/cardprinterconfig/records/smart51-test-setting.validated-then-reverted.md
```

User-confirmed request:

```text
Name: test
Label: test
Behavior: during real GetConfig, read index 000 and show it.
Set: excluded
Save/load: excluded
Other features: excluded
```

## Match Result

Best candidate:

```text
SMART-51 Printer body
SubDlg51SMART.cpp
index 000 -> P51ITEM_XSTARTPOS
```

Why:

- `P51ITEM_XSTARTPOS` is defined as `0`.
- It is added to SMART-51 printer-body items as `X Start Position`.
- The SMART-51 `OnClick_btnGetConfig` flow reads parameter sections and writes
  item values to controls by item id.

## Important Caution

Index `000` is not empty. It already maps to:

```text
P51ITEM_XSTARTPOS / IDC_EDIT_XPOS / "X Start Position"
```

So the safe implementation shape is not “add a new normal parameter item”.

The safer candidate is:

```text
Add a separate read-only display labeled "test".
Populate it from the actual GetConfig read of index 000.
Do not include it in m_Items.
Do not include it in SetConfig.
Do not include it in Save/Load/Report loops.
```

## Candidate Expected Files

If implementation is later approved, likely files:

- `SubDlg51SMART.cpp`
- `SubDlg51SMART.h`
- `CardPrinterConfig.rc`
- `resource.h`

## Forbidden / Avoided Flows

Avoid:

- `OnClick_btnSetConfig`
- `SetConfig`
- `ExSetDevParam2`
- `SaveReportFile`
- `LoadConfigFile`
- normal `P51ITEM_ADDING_INIT2` registration for `test`

Reason:

The user explicitly said this is display-only during GetConfig and excluded
from set/save/load/other behavior.

## Implementation Result

The candidate was implemented after explicit user approval.

- `CardPrinterConfig.rc` adds the Factory `test` label and read-only field.
- `resource.h` adds `IDC_EDIT_PTYPEF_TEST`.
- `SubDlg51SMART.cpp` clears and populates the field during
  `OnClick_btnGetConfig`.
- Build passed for `CardPrinterConfig` `Release_Factory | Win32`.
- The generated `.res` build artifact was restored.

## Hardware Validation Result

User confirmed the hardware behavior:

```text
The SMART-51 Factory test field displays correctly after actual GetConfig.
```

## Current Code State

The temporary external source change was reverted by user request.

This candidate match remains useful as a validated retrofit PBE lifecycle
example, but CardPrinterConfig no longer contains the temporary `test` field.
