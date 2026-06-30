# Open Source Retrofit Examples

These examples use public open-source repositories as retrofit PBE dogfood.

The first target is `cJSON`, cloned locally under `work/open-source/cJSON`.
The current example is read-only and planned-only: it creates a graph-source
and instruction pack candidate without changing the cloned project.

Additional committed fixtures:

- `todo-vue`: local README-only operation-chain dogfood against `mdn/todo-vue`.
- `escape-html`: local behavior-change operation-chain dogfood against `component/escape-html`.
- `kubernetes-sidecar-kep`: read-only large-project KEP intent recovery fixture for Kubernetes KEP-753 Sidecar
  Containers, mapping formal KEP intent to related Kubernetes code/test surfaces without cloning or mutating Kubernetes.
