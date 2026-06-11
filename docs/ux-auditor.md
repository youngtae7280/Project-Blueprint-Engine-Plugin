# UX Auditor

UX Auditor checks UI/UX preview, confirmation, work design, verification, task card, state, and evidence coverage.

## Output

```text
.pbe/blueprint/ux-audit.md
```

## Checks

- Every UI-required screen or flow has a preview.
- Every required preview is confirmed, deferred, or out of scope.
- Confirmed UX rules are reflected in WPD.
- Confirmed UX rules are converted into VD checks.
- UI task cards include Approved UI/UX Direction.
- UI task cards include UI/UX Non-Scope.
- UI task cards include UI/UX Evidence Required.
- Required UI states are covered.
- Evidence checklist exists for UI work.
- Legacy/parity UI surfaces have a visible/enabled control inventory before parity is claimed.
- Popup, clipping, alignment, resize/DPI, and runtime coordinate checks are included when visual parity matters.
- Missing, deferred, blocked, and verification-pending UI gaps are visible in the surface completion ledger.

Blocking UX gaps must be repaired before ACEP generation or final completion.
