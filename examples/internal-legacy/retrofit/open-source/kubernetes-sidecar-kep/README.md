# Kubernetes KEP-753 Sidecar Containers Retrofit Fixture

Status: read-only-kep-intent-recovery / no external checkout mutation

This fixture tests whether PBE can recover intent from a large external project's formal design process before any code
change is attempted.

Target:

- KEP repo: `kubernetes/enhancements`
- Code repo: `kubernetes/kubernetes`
- KEP: `keps/sig-node/753-sidecar-containers/README.md`
- KEP title: `KEP-753: Sidecar containers`

The fixture maps KEP goals, non-goals, risks, test-plan surfaces, rollout/upgrade boundaries, and related
`kubernetes/kubernetes` code/test paths into a retrofit graph-source.

It does not:

- clone or edit Kubernetes;
- claim Kubernetes maintainer approval;
- create an upstream PR;
- mutate `kubernetes/enhancements` or `kubernetes/kubernetes`;
- run Kubernetes build/e2e suites;
- enroll this fixture in positive read-model `validate --all`.

The first expected PBE action is read-only:

```bash
node dist/cli/index.js graph retrofit plan --graph-source examples/internal-legacy/retrofit/open-source/kubernetes-sidecar-kep/graph-source.json --json
node dist/cli/index.js graph operation generate-pack --graph-source examples/internal-legacy/retrofit/open-source/kubernetes-sidecar-kep/graph-source.json --record change.kep753.sidecar-intent-map --json
```

Scaling path:

1. Keep this fixture read-only while validating KEP intent extraction.
2. Expand from one KEP to multiple KEPs only after source/test/document surfaces stay traceable.
3. Attempt a docs-only or test-only local target change only after a selected record has explicit allowed files,
   forbidden flows, and verification boundaries.
