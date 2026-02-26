# Dynatrace AI Business Observability Engine — Deployment Guide

> **Version:** 2.9.10 · **Last updated:** February 2026
>
> Deploy the BizObs Engine on a fresh Linux VM with Ollama AI, OpenTelemetry instrumentation, and full Dynatrace integration (traces, metrics, logs).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Linux VM (EC2 / Azure VM / GCP CE)                 │
│                                                     │
│  ┌──────────────┐   HTTP    ┌──────────────┐        │
│  │  BizObs      │ ◄──────► │   Ollama      │        │
│  │  Engine      │  :11434   │   (LLM)      │        │
│  │  (Node.js)   │           └──────────────┘        │
│  │  :8080       │                                   │
│  └──────┬───────┘                                   │
│         │  OTLP (proto)                             │
│         ▼                                           │
│  ┌──────────────────────────────────────────┐       │
│  │  otel.cjs  (--require bootstrap)         │       │
│  │  • Auto-instruments HTTP (Ollama calls)  │       │
│  │  • Traces + Metrics + Logs → Dynatrace   │       │
│  └──────────────┬───────────────────────────┘       │
└─────────────────┼───────────────────────────────────┘
                  │  HTTPS
                  ▼
         ┌─────────────────┐
         │   Dynatrace     │
         │   /api/v2/otlp  │
         │   v1/traces     │
         │   v1/metrics    │
         │   v1/logs       │
         └─────────────────┘
```

---

## Prerequisites

| Requirement | Minimum | Recommended |
|---|---|---|
| **OS** | Ubuntu 20.04+ / Amazon Linux 2023 / RHEL 8+ | Amazon Linux 2023 |
| **Node.js** | 18.x | 20.x or 22.x |
| **RAM** | 4 GB | 8 GB+ (Ollama needs memory for models) |
| **Disk** | 10 GB | 20 GB (model storage) |
| **Dynatrace** | SaaS or Managed 1.222+ | Latest SaaS |
| **Ports** | 8080 (app), 11434 (Ollama) | + 443 if using nginx |

---

## Step 1 — Install Node.js

```bash
# Amazon Linux / RHEL
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version   # v20.x+
npm --version    # 10.x+
```

---

## Step 2 — Install & Configure Ollama

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama service
sudo systemctl enable ollama
sudo systemctl start ollama

# Wait for Ollama to be ready
until curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; do
  echo "Waiting for Ollama..."
  sleep 2
done

# Pull the default model (llama3.2 — 2 GB)
ollama pull llama3.2

# (Optional) For lightweight environments, use qwen2:1.5b instead (934 MB)
# ollama pull qwen2:1.5b
```

> **Note:** The app has a rule-based fallback if Ollama is unavailable. AI features (dashboard generation, Fix-It agent, Nemesis agent) require Ollama.

---

## Step 3 — Clone & Install the App

```bash
cd /home/ec2-user   # or your preferred directory
git clone https://github.com/lawrobar90/Dynatrace-AI-Business-Observability-Engine.git "BizObs Generator - Dynatrace AppEngine App"
cd "BizObs Generator - Dynatrace AppEngine App"

# Install dependencies
npm install

# Build TypeScript agents
npm run build:agents
```

---

## Step 4 — Configure Environment

### 4a. Create `.env`

```bash
cp .env.template .env
```

Edit `.env` with your values:

```dotenv
# === Required ===
PORT=8080
NODE_ENV=production

# === Ollama ===
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=llama3.2

# === Dynatrace (optional — can also use .dt-credentials.json) ===
# DT_ENVIRONMENT=https://YOUR_TENANT_ID.live.dynatrace.com
# DT_PLATFORM_TOKEN=dt0c01.XXXXXX.YYYYYY
```

### 4b. Configure Dynatrace Credentials

The app reads Dynatrace credentials from `.dt-credentials.json`. You can create this manually or configure it from the UI after starting the app.

```bash
cat > .dt-credentials.json << 'EOF'
{
  "environmentUrl": "https://YOUR_TENANT_ID.live.dynatrace.com",
  "apiToken": "YOUR_GENERAL_API_TOKEN",
  "otelToken": "YOUR_OTEL_INGEST_TOKEN"
}
EOF
```

| Field | Purpose | Required Token Scopes |
|---|---|---|
| `apiToken` | DT API access (problems, logs, metrics queries) | `problems.read`, `metrics.read`, `logs.read`, `entities.read` |
| `otelToken` | OTLP signal ingestion | `openTelemetryTrace.ingest`, `metrics.ingest`, `logs.ingest` |

> **How to create tokens:** In Dynatrace, go to **Access Tokens** (Settings → Integration → Access Tokens), click **Generate new token**, and select the required scopes.

---

## Step 5 — Configure Dynatrace for OpenTelemetry Ingestion

In your Dynatrace environment, ensure these settings are enabled:

### 5a. Enable W3C Trace Context

1. Go to **Settings** → **Preferences** → **OneAgent features**
2. Turn on **Send W3C Trace Context HTTP headers**

### 5b. Enable OpenTelemetry Ingestion

1. Go to **Settings** → **Preferences** → **OneAgent features**
2. Search for **OpenTelemetry** and enable:
   - **OpenTelemetry (Node.js)**

### 5c. Allow Custom OTel Attributes (for GenAI spans)

1. Go to **Settings** → **Server-side service monitoring** → **Span attributes**
2. Add the following attributes to the allowlist:

```
gen_ai.system
gen_ai.request.model
gen_ai.request.temperature
gen_ai.prompt.0.role
gen_ai.prompt.0.content
gen_ai.prompt.1.role
gen_ai.prompt.1.content
gen_ai.completion.0.role
gen_ai.completion.0.content
gen_ai.response.model
gen_ai.usage.prompt_tokens
gen_ai.usage.completion_tokens
gen_ai.response.tool_calls
gen_ai.response.duration_ms
gen_ai.request.tools
gen_ai.request.tools_count
ai.agent.framework
ai.engine.type
```

### 5d. Configure Span Capture Rules (optional, for full prompt visibility)

1. Go to **Settings** → **Server-side service monitoring** → **Span capture rules**
2. Add a rule:
   - **Match:** Span name starts with `chat` or `chatJSON` or `agentLoop`
   - **Action:** Capture — this ensures GenAI spans are always stored

---

## Step 6 — Start the App

```bash
# Create log directory
mkdir -p logs

# Start with OpenTelemetry auto-instrumentation
node --require ./otel.cjs server.js >> logs/server.log 2>&1 &
echo $! > server.pid

# Verify it's running
sleep 5
curl -s http://localhost:8080/api/health | head -c 200
```

You should see output like:

```
[otel.js] 📦 Loaded credentials from .dt-credentials.json
[otel.js]    Token type: otelToken (ingest scopes)
[otel.js] ✅ OTLP endpoint: https://YOUR_TENANT.live.dynatrace.com/api/v2/otlp
[otel.js] 📡 Traces → .../v1/traces
[otel.js] 📊 Metrics → .../v1/metrics
[otel.js] 📝 Logs   → .../v1/logs
[otel.js] 🎯 OpenTelemetry initialized — traces + metrics + logs → Dynatrace
🚀 Business Observability Server running on port 8080
```

### Useful Management Commands

```bash
# Check status
curl -s http://localhost:8080/api/health | python3 -m json.tool

# View logs
tail -f logs/server.log

# Stop the server
kill $(cat server.pid)

# Restart
kill $(cat server.pid) 2>/dev/null; sleep 2
node --require ./otel.cjs server.js >> logs/server.log 2>&1 &
echo $! > server.pid
```

---

## Step 7 — (Optional) Set Up Nginx Reverse Proxy

For production deployments with HTTPS:

```bash
# Install nginx
sudo yum install -y nginx   # Amazon Linux
# sudo apt install -y nginx # Ubuntu

# Copy the provided config
sudo cp nginx/bizobs.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl restart nginx
```

For HTTPS, place your SSL certs and use the HTTPS config:

```bash
sudo mkdir -p /etc/nginx/ssl
sudo cp your-cert.crt /etc/nginx/ssl/bizobs.crt
sudo cp your-cert.key /etc/nginx/ssl/bizobs.key
sudo cp nginx/bizobs-https.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl restart nginx
```

---

## Step 8 — (Optional) Set Up as a System Service

For auto-start on boot:

```bash
# Edit the service file to match your setup
sudo tee /etc/systemd/system/bizobs.service << EOF
[Unit]
Description=BizObs AI Business Observability Engine
After=network.target ollama.service
Wants=ollama.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$(pwd)
Environment=NODE_ENV=production
Environment=PORT=8080
ExecStart=/usr/bin/node --require ./otel.cjs server.js
Restart=always
RestartSec=10
StandardOutput=append:$(pwd)/logs/bizobs.log
StandardError=append:$(pwd)/logs/bizobs-error.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable bizobs
sudo systemctl start bizobs
```

---

## Step 9 — Verify in Dynatrace

### Traces

1. Go to **Distributed Traces** → **Ingested traces** tab
2. Filter by `service.name = bizobs-ai-engine`
3. You should see HTTP spans for every API call, with Ollama calls tagged with `gen_ai.system = ollama`

### Metrics

1. Go to **Metrics** explorer
2. Search for metrics from the `bizobs-ai-engine` service

### Logs

1. Go to **Logs & Events**
2. Filter by `service.name = bizobs-ai-engine`

### AI Observability (GenAI Spans)

1. Go to **AI Observability** (or **Notebooks** → search "AI Observability")
2. You should see LLM call traces with model name, prompt/completion content, token usage, and latency

---

## Quick Reference

| Item | Value |
|---|---|
| **App URL** | `http://YOUR_HOST:8080` |
| **Health endpoint** | `http://YOUR_HOST:8080/api/health` |
| **Ollama** | `http://localhost:11434` |
| **Default model** | `llama3.2` |
| **Start command** | `node --require ./otel.cjs server.js` |
| **Config files** | `.env`, `.dt-credentials.json` |
| **Logs** | `logs/server.log` |
| **PID file** | `server.pid` |
| **OTel bootstrap** | `otel.cjs` (loaded via `--require`) |
| **TypeScript build** | `npm run build:agents` |

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `OTel tracing NOT enabled` | Check `.dt-credentials.json` has `environmentUrl` and `otelToken` |
| `403 Token missing scope` | Ensure `otelToken` has `openTelemetryTrace.ingest`, `metrics.ingest`, `logs.ingest` |
| `Ollama connection refused` | Run `sudo systemctl start ollama` and verify `curl http://localhost:11434` |
| `LLM request timed out` | The model may be loading. First request after cold start takes longer. Try again. |
| No traces in Dynatrace | Check **Ingested traces** tab (not PurePaths). Allow 2-3 minutes for data to appear. |
| GenAI attributes missing | Add them to the **Span attributes** allowlist in Dynatrace Settings |
| `require is not defined` | The bootstrap file must be `otel.cjs` (not `.js`) because the project uses ESM |
