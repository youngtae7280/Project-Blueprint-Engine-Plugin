# CardPrinterConfig Laminator Tag Layout Change v0

Status: implemented / build pass / UI review pass

## User Intent

Target:

```text
SMART-51, SMART-52 Laminator 화면의 Tag 탭 내부 레이아웃
```

Intent:

```text
Tag Param 열과 Active Param 열의 edit control left가 각 header text left와
맞도록 수정한다.
```

Allowed:

```text
레이아웃 수정
```

Forbidden:

```text
로직 수정 금지
```

Hardware validation:

```text
불필요
```

## Implemented Shape

Only `CardPrinterConfig.rc` was changed.

The same coordinate adjustment was applied to:

- `IDD_CSubDlg52LAMINATOR_Tag`
- `IDD_DIALOG_SUB_LAMINATOR51_TAG`

Coordinate changes:

- `IDC_EDIT_LAMINATOR_TAGPARAM_*`: x `129 -> 111`
- `IDC_EDIT_LAMINATOR_ACTIVEPARAM_*`: x `221 -> 194`

This left-aligns the edit controls with the existing header labels without
changing labels, widths, styles, IDs, or C++ logic.

## Explicitly Not Changed

- `SubDlg51LAMINATOR.cpp`
- `SubDlg52LAMINATOR.cpp`
- `resource.h`
- `GetConfig`
- `SetConfig`
- `SaveConfig`
- `LoadConfig`
- hardware communication

## Evidence

Build:

```text
CardPrinterConfig Release_Factory Win32: PASS
```

Hardware:

```text
Not required
```

Manual UI review:

```text
PASS
```

User-confirmed result:

```text
레이아웃 확인: OK
```

## Current Code State

The layout resource change remains active in `CardPrinterConfig.rc`.

No logic, resource ID, save/load, read/write, or hardware communication path was
changed.
