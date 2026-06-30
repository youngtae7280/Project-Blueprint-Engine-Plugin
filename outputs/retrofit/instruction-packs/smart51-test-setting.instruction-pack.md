# Retrofit Instruction Pack

Status: generated-from-graph-source

Record: change.smart51-test-setting

## User Intent

settingName: test; uiLabel: test; module: SMART-51 Printer body Factory screen; operation: GetConfig display only; readIndex: 0; setBehavior: excluded; saveLoadBehavior: excluded; otherFeatures: excluded

## Allowed Files

- `src/CardPrinterConfig/CardPrinterConfig.rc`
- `src/CardPrinterConfig/resource.h`
- `src/CardPrinterConfig/SubDlg51SMART.cpp`

## Forbidden Flows

- OnClick_btnSetConfig / SetConfig / ExSetDevParam2: The user confirmed the test field must not set hardware values.
- SaveReportFile / LoadConfigFile: The user confirmed save/load and other features are excluded.
- P51ITEM_ADDING_INIT2 normal m_Items registration for test: Normal item registration risks unintended Set/save/load/report participation.
- CPConfigDlg routing and device wrapper behavior: The request is local to the SMART-51 Factory Printer GetConfig display path.

## Graph Edge Intent

- `edge.getconfig-drives-smart51-test-record` [change-driver, read-only-projection]: The change was allowed only as a read-only projection of index 000 during GetConfig.
- `edge.smart51-test-guards-forbidden-flows` [non-goal, safety-boundary]: Future maintenance must not resurrect the reverted test field through Set/save/load/report or unrelated module paths.

## Verification

- Build: pass
- Runtime/UI: not-applicable
- Hardware: user-confirmed-pass

## Boundary

- This pack does not apply changes by itself.
- External project modification requires explicit user approval.
