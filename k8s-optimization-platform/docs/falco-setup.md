# Real runtime security (Falco)

Runtime Security, Crypto-Miner Detection, Process History, and Network
Evidence previously derived everything from static container config
(`privileged`, `runAsRoot`, `hostNetwork`, ...) — a real signal, but a
config-*posture* one, not actual runtime behavior. Deploying Falco adds
real behavioral detections (process execution, syscalls, network activity)
alongside those, without replacing them.

We integrate with [Falco](https://falco.org/) (CNCF project) rather than
building an eBPF sensor — it's the standard for this and already ships
crypto-miner and suspicious-process rules out of the box.

## How it gets to us

Falco supports pushing each alert as JSON directly via its own
[`http_output`](https://falco.org/docs/outputs/) feature — no extra
collector process needed. Falco can't send custom auth headers in any
shipped version, so the per-cluster token goes in the URL path instead
(the same trick webhook URLs from Slack/GitHub use):

```
POST /api/agents/falco-alerts/{cluster_name}/{token}
```

## Install (official Falco Helm chart)

```bash
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm repo update
helm install falco falcosecurity/falco \
  --namespace falco --create-namespace \
  --set falco.json_output=true \
  --set falco.http_output.enabled=true \
  --set falco.http_output.url="https://<your-platform-host>/api/agents/falco-alerts/<cluster_name>/<api-token>"
```

Use the same `cluster_name` and `api-token` already set in this cluster's
`platform-credentials` Secret (see `agent/deployment.yaml`) — the endpoint
validates the cluster is registered before accepting alerts.

## What happens without it

Nothing breaks. No alerts arrive, so Runtime Security/Crypto-Miner
Detection/Process History/Network Evidence keep showing exactly what they
showed before (config-posture heuristics), each labeled `source:
"config_posture"` — never fabricated behavioral data.

## Verifying it's working

Once Falco is deployed and has fired at least one alert:

- `GET /api/v1/container-security/runtime` — `runtime_threats` entries
  gain `"source": "falco"` alongside the existing `"config_posture"` ones.
- `GET /api/v1/attack-investigation/crypto-miner-detection` — `note` says
  "Confirmed via Falco runtime detection" once a Stratum/miner rule fires.
- `GET /api/v1/attack-investigation/forensics/process-history/{pod_name}`
  — real `proc.name`/`pid`/`user` entries instead of the "no Falco alerts"
  note.

## Not covered here

East-West Traffic and rich network-flow evidence need real packet/flow
data (Cilium Hubble, CNI-conditional) — a separate integration, not part
of this one.
