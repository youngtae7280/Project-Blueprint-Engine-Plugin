# MDN Todo Vue Retrofit Dogfood

Target repo:

```text
work/external/todo-vue
```

Upstream:

```text
https://github.com/mdn/todo-vue
```

Current scope:

- real external clone
- local README-only operation-chain dogfood
- no source behavior change
- no upstream PR

The important DevView behavior under test is whether the graph-source operation
chain can keep an external-project change bounded to an explicitly allowed
surface while preserving maintainer-intent and upstream-approval boundaries.
