# Repo-Wide Graph-Source Transition Mechanics

Status: implementation-mechanics / bounded / non-enforcing

## Purpose

This record captures the first repo-wide transition mechanics after Todo Search and Todo App PBE Run both became
graph-source-backed configured read-model slices.

It does not retire tree-native artifacts, enable enforcement, enroll invalid fixtures in CI, or promote Todo App beyond
`structure-only`.

## Machine-Readable Status

The transition status artifact is:

- `examples/read-model-aggregate/graph-source-transition-status.json`

The artifact records:

- `sourceDirection: graph-source-confirmed-for-configured-read-model-slices`
- `treeNativeRole: compatibility-fallback-reference`
- Todo Search source role: `limited-graph-source-promoted`
- Todo App source role: `confirmed-structure-only-graph-source`
- repo-wide boundaries: promotion not complete, tree-native retirement not complete, required checks/branch protection/CI
  enforcement not enabled, Todo App beyond `structure-only` not approved

## Registry Alignment

`examples/read-model-aggregate/read-model-slices.json` is now recorded as
`active-consumed-by-validate-all`.

The registry still has exactly two positive validate-all profiles:

| Profile                           | Source role                                        | Positive validate-all role                                                              |
| --------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `todo-search-selected-slice`      | limited graph-source promoted selected slice       | graph-source-backed generate/compare/validate plus source-backed projection contract    |
| `todo-app-pbe-run-structure-only` | confirmed graph-source-backed structure-only slice | graph-source-backed generate/validate plus confirmed structure-only projection contract |

## E2E Check

`npm run test:read-model:e2e` now reads the transition status artifact and checks:

- Todo Search remains 40 nodes / 59 edges / 7 Core Views with source-backed projection contract.
- Todo App remains 22 nodes / 38 edges / 7 Core Views with confirmed structure-only projection contract.
- tree-native artifacts remain compatibility/fallback/reference.
- repo-wide promotion, tree-native retirement, and CI enforcement remain incomplete.

## Boundaries

This mechanics step is intentionally not:

- tree-native retirement
- required check or branch protection configuration
- CI enforcement
- invalid fixture CI inclusion
- Todo App parity-backed or pilot-marker-backed promotion
- Todo App source authority beyond `structure-only`
- replacement of user acceptance

## Next Decision Surface

The next bounded decision should choose one of:

- continue observing the two graph-source-backed configured slices
- design repo-wide transition mechanics for additional slice enrollment
- design tree-native compatibility/fallback retirement criteria without executing retirement
- design enforcement/required-check policy separately
