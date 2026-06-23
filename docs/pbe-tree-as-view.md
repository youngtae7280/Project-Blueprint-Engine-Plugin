# PBE Tree As View

Graph is the source knowledge model. Tree is a View.

In a Graph-first PBE, a Tree is not the only storage model. It is a lens that unfolds the Graph for a specific question.
The same real node can appear in several Views, but the node remains one Graph node with one identity.

## View Principles

- A View selects root node types.
- A View follows specific edge types.
- A View may show the same node in more than one place for readability.
- A View does not create separate truth.
- Editing through a View must eventually produce a Graph delta.

## Product Intent View

Question: What product intent exists, and how is it realized and verified?

```text
Product -> Flow -> Work -> Test -> Evidence
```

This View is useful for RPD, review, and acceptance because it preserves the reason a change exists.

## Flow Behavior View

Question: What user/system behavior happens, and what implements it?

```text
Flow -> Step -> Work -> File/Symbol -> Test
```

This View is useful when the product wording is clear but the behavior sequence or implementation responsibility needs
inspection.

## Work Implementation View

Question: What implementation responsibility touches which code and how is it tested?

```text
Work -> File/Symbol -> Test -> Evidence
```

This View is useful for ACEP execution, file-change guardrails, and focused maintenance work.

## Test Coverage View

Question: Which Product, Flow, or Work nodes are verified, and where is the proof?

```text
Product/Flow/Work -> Test -> Evidence
```

This View is useful for VD, review submission, stale evidence checks, and acceptance closure.

## Change Impact View

Question: What does a changed file affect?

```text
Changed File -> Work -> Flow -> Product -> Required Test -> Evidence -> Risk/Unknown
```

This View is the basis for incremental `pbe diff` / `pbe sync diff`. It should start from changed files and expand by
bounded radius instead of reanalyzing the whole project.

## Risk/Unknown View

Question: What is risky or unknown, and what does it affect?

```text
Risk/Unknown -> affected Work/Flow/Product
```

This View keeps uncertainty visible. Unknowns and risks are not failures by themselves, but selected work cannot close
when unresolved blocking unknowns or risk boundaries still affect it.

## Example

A single Work node named `WT-order-save` may appear under:

- Product Intent View, because it implements the order registration Flow.
- Work Implementation View, because it touches `orders/repository.ts`.
- Test Coverage View, because `TT-order-save-valid` verifies it.
- Change Impact View, because a later diff changes `orders/repository.ts`.

The View can repeat the node, but the Graph node remains one canonical identity.
