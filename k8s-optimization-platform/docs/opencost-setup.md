# Real per-namespace/pod cost attribution (OpenCost)

Connecting real cloud billing (AWS/GCP/Azure — see the Cloud Discovery page)
gives you an accurate **total**. It doesn't tell you *which namespace or
team* caused it — that's a genuinely hard bin-packing/allocation problem,
separate from "what did we pay."

Rather than build that from scratch, this platform integrates with
[OpenCost](https://www.opencost.io/) (CNCF project, the same allocation
engine Kubecost is built on) for the allocation **shape**, and blends it
with your real billing **total**:

```
real per-namespace cost = real total (from Cloud Discovery) × OpenCost's namespace share
```

We never trust OpenCost's own dollar figures directly (those come from
OpenCost's own pricing source, usually on-demand list price) — only the
*proportions*. That way you get real $ amounts with a real, bin-packing-
aware breakdown, instead of either a flat resource-weighted guess or an
unverified absolute number from a second pricing source.

## Install (official OpenCost Helm chart — we don't ship a fork)

```bash
helm repo add opencost https://opencost.github.io/opencost-helm-chart
helm repo update
helm install opencost opencost/opencost --namespace opencost --create-namespace
```

This also installs OpenCost's own minimal Prometheus if you don't already
have one collecting kubelet/cAdvisor metrics. If your cluster already runs
Prometheus (e.g. for Grafana dashboards), point OpenCost at it instead —
see the chart's `values.yaml` for `prometheus.external.url`.

## Point the agent at it

Set `OPENCOST_URL` in `deployment.yaml`'s `agent-config` ConfigMap (or via
`kubectl edit configmap agent-config -n k8s-optimization-agent`):

```yaml
OPENCOST_URL: "http://opencost.opencost.svc.cluster.local:9003"
```

Restart the agent deployment to pick up the change:

```bash
kubectl rollout restart deployment/k8s-optimization-agent -n k8s-optimization-agent
```

## What happens without it

Nothing breaks. `OPENCOST_URL` unset (the default) means the agent skips
the query entirely — no error, no retry storm. Namespace cost attribution
falls back to the same resource-request-weighted estimate (70% CPU / 30%
memory) Phase-1 estimation already uses, just applied against your real
billing total instead of an estimated one. That's already an improvement
over what shipped before this: connecting real billing used to make
per-namespace attribution disappear (an empty list) rather than degrade
gracefully.

## Verifying it's working

`GET /api/v1/cost-management` (or any FinOps page reading namespace
breakdowns) for a cluster with real billing connected — the response
includes a `source` field per snapshot. Once OpenCost is deployed and the
agent has reported at least one collection cycle, per-namespace costs will
reflect OpenCost's actual allocation shares rather than the resource-
weighted fallback.
