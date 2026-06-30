# Graph Counter Demo Native Behavior Example

This example proves a tiny behavior change through the same PBE operation chain:

```text
graph-source -> instruction pack -> local change -> graph delta -> graph update proposal
```

Target repo:

```text
work/native/graph-counter-demo
```

The change is intentionally small: `Get-GraphCounterNextValue` moves from `+1`
to `+2`, with the local test updated to match.
