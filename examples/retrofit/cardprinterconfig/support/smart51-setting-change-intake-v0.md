# CardPrinterConfig SMART-51 Setting Change Intake v0

Status: blocked-before-user-confirmation

Target:

```text
C:/Users/ytkim/Desktop/kyt_work/Utility_Windows/src/CardPrinterConfig
```

Write boundary:

```text
Do not modify C:/Users/ytkim/Desktop/kyt_work.
```

## Purpose

This worksheet defines how PBE should handle a future request like:

> Add a SMART-51 printer setting change.

The goal is not to implement the setting yet. The goal is to avoid guessing.

## Known From Read-Only Observation

PBE can safely know these from code structure:

- SMART-51 exists as a printer group.
- SMART-51 has multiple module routes:
  - Printer body
  - Laminator
  - Flipper
  - MHopper2
- Grant levels exist:
  - User
  - Dealer
  - Factory
- Main dialog device read/write wrappers exist.
- Config save/load flows exist.
- Subdialogs own model/module-specific parameter catalogs.

## Still Unknown

PBE does not know these without the user:

- The exact setting name, label, parameter id, or menu wording.
- Which SMART-51 module owns the setting.
- Whether this is User, Dealer, or Factory behavior.
- Whether the change is UI-only, read-only, write-capable, or read/write.
- Whether config save/load should include it.
- Whether real hardware validation is mandatory.

## First Question To Ask

Decision needed:

What exact SMART-51 setting do you want to add or change?

Known from graph/code:

SMART-51 exists, and the code has separate module paths for Printer,
Laminator, Flipper, and MHopper2. The code also has grant levels, read/write
wrappers, and config save/load paths.

Still unknown:

The specific setting name is not present in the request, so PBE cannot choose
the owning module, expected files, or tests safely.

Why this blocks the next step:

If PBE guesses the module or parameter, it may edit the wrong subdialog, bypass
the intended permission level, or include/exclude config save/load incorrectly.

Please answer like:

```text
Setting name or UI label:
Existing device/menu wording if known:
Target module if known:
Expected behavior:
  - UI only
  - read from device
  - write to device
  - read and write
Should save/load include it:
Hardware test available:
```

If you do not know all fields, answer only what you know. PBE should then search
for matching labels, nearby parameters, and candidate files before asking the
next smaller question.

## Candidate Search After First Answer

After the user provides a setting name or description, PBE should search only
read-only anchors first:

- `SubDlg51SMART.*`
- `SubDlg51LAMINATOR.*`
- `SubDlg51FLIPPER.*`
- `SubDlg51MHOPPER2.*`
- `resource.h`
- `CardPrinterConfig.rc`
- `CPConfigDlg.h`
- `CPConfigDlg.cpp`
- `{ releaes_note }.txt`

The output should be candidate matches, not an implementation plan.

## Confirmed Slice Requirements

Before implementation, the slice must have:

- confirmed setting name or behavior description
- confirmed module owner or a high-confidence anchored match approved by user
- confirmed permission level
- confirmed UI/read/write scope
- confirmed save/load behavior
- hardware validation status
- expected files
- forbidden files
- tests/evidence

Until then, status remains:

```text
blocked-before-user-confirmation
```
