# DevView Core Schemas

These files describe the common graph operation artifacts shared by native and
retrofit DevView flows.

Current common operation chain:

```text
graph-source -> instruction pack -> local change -> graph delta -> graph update proposal
```

`native` and `retrofit` are modes on the same structure. Native starts from
authored graph intent. Retrofit starts from observed/user-confirmed graph intent.
