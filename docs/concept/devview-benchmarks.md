# DevView Benchmarks

DevView benchmark artifacts compare stored candidate results against golden answers without running Codex, Graphify,
native builds, retrofit tests, providers, shell commands, hooks, or graph updates.

The first benchmark surface is report-only:

```bash
devview benchmark evaluate-result \
  --benchmark-suite .tmp/benchmark-fixtures/suite.json \
  --task .tmp/benchmark-fixtures/task.json \
  --golden-answer .tmp/benchmark-fixtures/golden.json \
  --candidate-result .tmp/benchmark-fixtures/candidate.json \
  --output .tmp/benchmark-fixtures/evaluation.json \
  --markdown .tmp/benchmark-fixtures/evaluation.md \
  --json
```

Multiple stored evaluation reports can then be grouped into a report-only comparison matrix:

```bash
devview benchmark summarize-comparison \
  --evaluations .tmp/benchmark-fixtures/native-devview.json,.tmp/benchmark-fixtures/native-codex-only.json \
  --output .tmp/benchmark-fixtures/comparison-summary.json \
  --markdown .tmp/benchmark-fixtures/comparison-summary.md \
  --json
```

## Comparison Arms

Benchmark specs can model these arms:

- `codex-only`
- `codex-graphify`
- `codex-devview`
- `codex-graphify-devview`

In the report-only foundation, these labels identify stored candidate results. DevView does not execute any arm.

## Golden-Answer Scoring

The default evaluator uses a 100-point rubric:

- task success
- scope accuracy
- context precision
- context recall
- regression risk
- evidence quality
- graph/update quality
- time/cost/iterations
- user interpretability and Work Journal usefulness

Golden answers may override weights, but scoring still uses explicit stored fields only. Unsafe execution or authority
flags block the evaluator before output is written.

## Comparison Summary

The aggregate comparison report groups scored evaluation reports by suite, task, project mode, and comparison group.
Each task row carries the four arm columns, missing-arm lists, pass/fail state, hard-failure counts, dimension scores,
and score deltas such as DevView versus Codex-only or Graphify versus Codex-only. The summary also carries compact
averages for Work Journal usefulness, Evidence quality, and scope accuracy.

Like the evaluator, the summary consumes stored JSON reports only. It does not perform live benchmark-task, Graphify,
native/retrofit build/test, extension-code, provider, hook, graph-update, or lifecycle-authority activity.

## Static Fixture Skeletons

The repository includes minimal Native and Retrofit benchmark skeletons under
`cli/src/__tests__/fixtures/benchmarks/`. They contain only suite, task, golden-answer, and stored candidate-result
JSON files for evaluator tests. They do not include buildable projects, live benchmark harnesses, live Graphify
outputs, native test activity, external service activity, command activity, graph updates, or extension code activity.

These fixtures are intentionally small CI-safe examples for proving that stored `codex-devview`, `codex-only`, and
`codex-graphify` candidate arms can be scored against golden answers. Public benchmark examples and executable harnesses
remain future work.
