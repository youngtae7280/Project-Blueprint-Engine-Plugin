# Completion Criteria

Project completion requires:

1. Every task in `execution-manifest.json` is completed or explicitly marked deferred/out_of_scope with reason.
2. Every requirement has at least one linked task or an explicit deferred/out_of_scope reason.
3. Every task has at least one linked verification item or an explicit explanation.
4. Every verification item has evidence or a not-runnable explanation.
5. All required validation commands pass, or failures are documented as environment-limited/non-blocking with reason.
6. Every required UI screen has UI/UX evidence.
7. Every required UI state is implemented or explicitly documented as not applicable.
8. When the parity/completeness profile is active, surface completion, legacy inventory, visual/runtime verification, hardware readiness, and verification miss promotion status are recorded.
9. No surface claims `parity_reviewed` without inventory/evidence or explicit not-runnable/deferred risk notes.
10. No command that opens a dialog, popup, subdialog, or secondary workflow is treated as complete from command mapping alone.
11. Required dialog/subdialog controls, default states, enable/disable states, button actions, async/repeated behavior, error/busy/cancel behavior, and legacy event handlers are either verified or explicitly listed as blocking not-checked items.
12. Hardware-gated surfaces have substitute evidence or explicit blocking `manual_not_verified` entries.
13. No hardware feature claims `hardware_certified` without certification evidence.
14. Final Coverage Check is completed.
15. Final Report is completed and includes a Not Checked section.
16. Result Review Pack is created.
17. Delivery status is `submitted_for_review`.
18. No unresolved stop condition remains.

User acceptance requires:

1. The user reviews the result.
2. Only the user can mark the result `accepted`.
3. If the user requests changes, feedback collection and Revision Pack creation must follow.
4. After revision, the result returns to Result Review.
5. Until user acceptance, the final product is not considered accepted.

Codex must not produce the final report until technical completion criteria are satisfied. Codex must not mark the result accepted.
