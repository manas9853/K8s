# Real network flow data (Cilium Hubble)

East-West Traffic and Network Evidence previously inferred everything from
one static signal — a pod's `hostNetwork: true` flag — rather than any
actual observed traffic. That's still a real signal (kept as a labeled
fallback, `source: "config_posture"`), but it can't tell you what's
actually talking to what.

This integration is **CNI-conditional**: it only works if the cluster's
CNI is [Cilium](https://cilium.io/) with [Hubble](https://github.com/cilium/hubble)
enabled. If it isn't, these features honestly stay on the config-posture
fallback rather than fabricating flow data — there's no generic way to get
real flow-level network visibility across arbitrary CNIs.

## How it gets to us

Hubble can export flow metrics in Prometheus format
(`hubble_flows_processed_total`, labeled by source/destination
namespace+pod and verdict). The agent polls this endpoint directly — same
pattern as its OpenCost integration (`docs/opencost-setup.md`) — no gRPC
client or extra binary needed.

## Enable Hubble metrics (if Cilium is already your CNI)

```bash
cilium hubble enable --ui  # or: helm upgrade cilium cilium/cilium --reuse-values \
  --set hubble.metrics.enabled="{flow:sourceContext=namespace|pod;destinationContext=namespace|pod}"
```

The `sourceContext`/`destinationContext` settings above are what produce
the `namespace/pod` label format this integration parses — see
[Cilium's Hubble metrics docs](https://docs.cilium.io/en/stable/observability/metrics/#hubble-metrics)
for the full context option list.

## Point the agent at it

Set `HUBBLE_METRICS_URL` in `deployment.yaml`'s `agent-config` ConfigMap:

```yaml
HUBBLE_METRICS_URL: "http://hubble-metrics.kube-system.svc.cluster.local:9965"
```

Restart the agent to pick up the change:

```bash
kubectl rollout restart deployment/k8s-optimization-agent -n k8s-optimization-agent
```

## What happens without it

Nothing breaks. `HUBBLE_METRICS_URL` unset (the default, and the only
sane default for non-Cilium clusters) means the agent skips the query
entirely. East-West Traffic and Network Evidence keep working exactly as
before, labeled `source: "config_posture"` / `source_kind: "config_posture"`.

## Verifying it's working

- `GET /api/v1/security/network-security/east-west-traffic` — `source`
  field switches from `"config_posture"` to `"hubble"`, and `traffic_flows`
  reflects real observed namespace-pair flow counts and drop verdicts
  instead of the isolated-namespace-list heuristic.
- `GET /api/attack-investigation/forensics/network-evidence/{pod_name}` —
  `connections` gains entries with `"source_kind": "hubble"` showing real
  pod-to-pod flows once that pod has observed traffic.
