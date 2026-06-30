# Retrofit Instruction Pack

Status: generated-from-graph-source

Record: change.laminator-tag-layout

## User Intent

Align the Tag Param and Active Param edit control left edges with their header text left edges inside the SMART-51 and SMART-52 Laminator Tag tabs.

## Allowed Files

- `src/CardPrinterConfig/CardPrinterConfig.rc`

## Forbidden Flows

- SubDlg51LAMINATOR.cpp / SubDlg52LAMINATOR.cpp logic: The user explicitly allowed only layout modification and forbade logic changes.
- GetConfig / SetConfig / SaveConfig / LoadConfig: The request is visual alignment only.
- resource.h control IDs: No new controls or IDs are needed for a coordinate-only alignment fix.
- hardware communication: Hardware validation is not required for a resource-only layout adjustment.

## Graph Edge Intent

- `edge.tag-layout-drives-laminator-record` [change-driver, layout-only]: The active change is driven only by visual left-edge alignment of existing edit controls.
- `edge.laminator-record-guards-logic` [non-goal, safety-boundary]: Future maintenance must keep this slice resource-layout-only unless the user explicitly opens logic or hardware scope.

## Verification

- Build: pass
- Runtime/UI: user-confirmed-ui-pass
- Hardware: not-applicable

## Boundary

- This pack does not apply changes by itself.
- External project modification requires explicit user approval.
