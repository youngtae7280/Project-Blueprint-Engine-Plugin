# DevView Project Memory Extension Gap Report

Status: `devview-project-memory-extension-gap-report-generated`

| Field                      | Value                                                 |
| -------------------------- | ----------------------------------------------------- |
| Project                    | `WindowsUtility / Utility_Windows Retrofit Portfolio` |
| Mode                       | `retrofit`                                            |
| Direction                  | `legacy-preserving-retrofit`                          |
| Taxonomy profile           | `legacy-retrofit-windowsutility-v0`                   |
| Authority                  | `preview-only-not-approved`                           |
| Missing kinds              | `2`                                                   |
| Extra observed kinds       | `6`                                                   |
| Unapproved extension kinds | `12`                                                  |

## Missing Kinds

- `hardware-boundary` (node, missing) - Profile expects this extension kind, but the current graph/read-model does not observe it yet.
- `native-interop` (node, missing) - Profile expects this extension kind, but the current graph/read-model does not observe it yet.

## Extra Observed Kinds

- `module` (node, extra-observed) - The graph/read-model observes this kind, but the Project Memory taxonomy profile does not list it.
- `product-intent` (node, extra-observed) - The graph/read-model observes this kind, but the Project Memory taxonomy profile does not list it.
- `retrofit-change-record` (node, extra-observed) - The graph/read-model observes this kind, but the Project Memory taxonomy profile does not list it.
- `change-driver` (edge, extra-observed) - The graph/read-model observes this kind, but the Project Memory taxonomy profile does not list it.
- `domain-scope` (edge, extra-observed) - The graph/read-model observes this kind, but the Project Memory taxonomy profile does not list it.
- `retrofit-detail-scope` (edge, extra-observed) - The graph/read-model observes this kind, but the Project Memory taxonomy profile does not list it.

## View Tree Coverage

- `tree.portfolio-inventory` - preview-only-not-authoritative: View tree profile is preview-only and cannot drive traversal or contract authority.
- `tree.cardprinterconfig-detailed-retrofit-slice` - preview-only-not-authoritative: View tree profile is preview-only and cannot drive traversal or contract authority.
- `tree.behavior-preservation` - preview-only-not-authoritative: View tree profile is preview-only and cannot drive traversal or contract authority.
- `tree.behavior-preservation` - missing-related-extension-kind: View tree purpose references native-interop, but that extension kind is not observed in the graph/read-model yet.
- `tree.risk-boundary` - preview-only-not-authoritative: View tree profile is preview-only and cannot drive traversal or contract authority.
- `tree.integration-target-context` - preview-only-not-authoritative: View tree profile is preview-only and cannot drive traversal or contract authority.

## Boundary

This extension gap report compares Project Memory vocabulary candidates against graph/read-model observations only. It does not approve extensions, mutate graph-source, change traversal, generate selected slices or contracts, satisfy Evidence, prove equivalence, enforce scope, or configure CI.
