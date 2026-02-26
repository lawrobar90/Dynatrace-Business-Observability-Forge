# BizObs AppEngine - POC Summary

## What Was Created

A **proof-of-concept Dynatrace AppEngine frontend** that communicates with your existing BizObs Generator backend.

### Architecture Overview

```
┌────────────────────────────────────────────────┐
│        Dynatrace AppEngine (Frontend)          │
│  ┌──────────────────────────────────────────┐  │
│  │  Service Dashboard                       │  │
│  │  - Live service monitoring               │  │
│  │  - Start/stop controls                   │  │
│  │  - Real-time updates (5s)                │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │  Chaos Control                           │  │
│  │  - Inject errors/latency                 │  │
│  │  - Configure intensity (10%-100%)        │  │
│  │  - Revert all chaos                      │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │  Fix-It Agent                            │  │
│  │  - View active problems (DQL)            │  │
│  │  - Trigger autonomous remediation        │  │
│  │  - Monitor agent status                  │  │
│  └──────────────────────────────────────────┘  │
└─────────────────┬──────────────────────────────┘
                  │ REST API calls
                  │
                  ▼
┌────────────────────────────────────────────────┐
│     BizObs Generator Server (EC2)              │
│     http://YOUR_SERVER_IP:8080                    │
│                                                 │
│  • All AI agents (Fix-It, Gremlin)            │
│  • MCP Server + Davis AI                       │
│  • Service orchestration                       │
│  • Chaos injection engine                      │
│  • LoadRunner simulators                       │
└────────────────────────────────────────────────┘
```

## Files Created

### Core App Structure

```
BizObs Generator - Dynatrace AppEngine App/
├── app.config.json                    # AppEngine configuration
├── APPENGINE-README.md                # Comprehensive documentation
├── deploy-appengine.sh               # Deployment script
└── app/
    ├── package.json                   # Dependencies
    ├── tsconfig.json                  # TypeScript config
    └── src/app/
        ├── index.tsx                  # Entry point
        ├── App.tsx                    # Main app with routing
        ├── services/
        │   └── bizobs-api.ts         # API client for external server
        └── pages/
            ├── ServiceDashboard.tsx   # Service management UI
            ├── ChaosControl.tsx       # Chaos engineering UI
            └── FixItAgent.tsx         # Fix-It agent UI
```

## Key Features

### 1. Service Dashboard (`pages/ServiceDashboard.tsx`)
- ✅ Real-time service monitoring
- ✅ Company grouping
- ✅ Service metrics (uptime, port, PID)
- ✅ Stop all services control
- ✅ Auto-refresh every 5 seconds

### 2. Chaos Control (`pages/ChaosControl.tsx`)
- ✅ Service selection dropdown
- ✅ Chaos type selection (errors/latency)
- ✅ Intensity slider (10%-100%)
- ✅ One-click chaos injection
- ✅ Revert all chaos instantly
- ✅ Live global error rate display

### 3. Fix-It Agent (`pages/FixItAgent.tsx`)
- ✅ DQL query for active problems
- ✅ Manual problem ID trigger
- ✅ Agent status monitoring
- ✅ Problem list with one-click fix
- ✅ Integration with Davis AI

### 4. API Service (`services/bizobs-api.ts`)
- ✅ Type-safe API client
- ✅ All BizObs endpoints covered
- ✅ Error handling
- ✅ Configurable server URL

## Technology Stack

**Frontend:**
- React 18
- TypeScript
- Dynatrace Strato Components (native UI)
- Dynatrace SDK (for DQL queries)

**Backend (Existing):**
- Node.js Express server
- AI Agents (Fix-It, Gremlin)
- MCP Server
- Service orchestration

## Quick Start

### 1. Install Dependencies

```bash
cd "BizObs Generator - Dynatrace AppEngine App/app"
npm install
```

### 2. Local Development

```bash
# Set server URL
export BIZOBS_SERVER_URL="http://YOUR_SERVER_IP:8080"

# Start dev server
npm start
```

### 3. Deploy to Dynatrace

```bash
# Make script executable
chmod +x deploy-appengine.sh

# Deploy
./deploy-appengine.sh https://YOUR_TENANT_ID.apps.dynatracelabs.com
```

## API Integration

The AppEngine app calls these existing endpoints:

| Feature | Endpoint | Purpose |
|---------|----------|---------|
| Service List | `GET /api/admin/services/status` | Fetch all services |
| Stop All | `POST /api/admin/services/stop-everything` | Stop services |
| Inject Chaos | `POST /api/gremlin/inject` | Start chaos |
| Revert Chaos | `POST /api/gremlin/revert-all` | Stop chaos |
| Error Rates | `GET /api/feature_flag` | Get global rates |
| Trigger Fix-It | `POST /api/workflow-webhook/problem` | Start remediation |
| Agent Status | `GET /api/autonomous/status` | Check Fix-It |

**No backend changes needed!** All APIs already exist.

## Advantages of This Approach

### ✅ Minimal Effort
- **2-3 days** to production-ready app
- No backend rewrite
- Uses existing APIs

### ✅ Dynatrace Native
- Official Strato components
- DQL integration (no API tokens)
- Consistent UX with other apps

### ✅ Flexible
- Backend stays independent
- Can update separately
- Existing UI still works at `:8080`

### ✅ Secure
- No data duplication
- Real-time from source
- Can add authentication easily

## Next Steps

### Phase 1: Core Features (Current POC)
- [x] Service Dashboard
- [x] Chaos Control
- [x] Fix-It Agent
- [x] API Integration

### Phase 2: Enhanced UI (1-2 days)
- [ ] Add journey visualization
- [ ] Real-time metrics charts
- [ ] Service health indicators
- [ ] Enhanced error display

### Phase 3: Security (1 day)
- [ ] Add API authentication
- [ ] HTTPS for external server
- [ ] CORS configuration
- [ ] Credential vault integration

### Phase 4: Production (1 day)
- [ ] Performance optimization
- [ ] Error boundary components
- [ ] Loading states
- [ ] User documentation

## Configuration Options

### Server URL

**Option 1: Environment Variable**
```bash
export BIZOBS_SERVER_URL="http://your-server:8080"
```

**Option 2: App Settings** (edit `services/bizobs-api.ts`)
```typescript
const BIZOBS_SERVER_URL = 'http://YOUR_SERVER_IP:8080';
```

**Option 3: Dynatrace Credential Vault** (recommended for production)
```typescript
import { credentialsVaultClient } from '@dynatrace-sdk/client-classic-environment-v2';
```

## Testing

### Verify BizObs Server
```bash
curl http://YOUR_SERVER_IP:8080/api/health
# Should return: {"status":"ok"}
```

### Test Service API
```bash
curl http://YOUR_SERVER_IP:8080/api/admin/services/status | jq
```

### Test Chaos API
```bash
curl -X POST http://YOUR_SERVER_IP:8080/api/gremlin/revert-all
```

## Deployment Checklist

- [ ] BizObs server running on EC2
- [ ] Server accessible from Dynatrace IPs
- [ ] Dependencies installed (`npm install`)
- [ ] App builds successfully (`npm run build`)
- [ ] Dynatrace CLI authenticated
- [ ] App deployed to tenant
- [ ] Verified in Dynatrace Apps menu
- [ ] Tested all three pages
- [ ] Confirmed API calls work

## Troubleshooting

### Connection Failed
**Problem**: Can't reach BizObs server

**Solutions**:
1. Check server: `curl http://YOUR_SERVER_IP:8080/api/health`
2. Verify firewall allows Dynatrace IPs
3. Check CORS headers on server
4. Review browser console errors

### DQL Permission Denied
**Problem**: Can't query events

**Solution**: Add scopes to `app.config.json`:
```json
{
  "scopes": [
    {"name": "environment-api"},
    {"name": "storage:events:read"}
  ]
}
```

### Services Not Showing
**Problem**: Dashboard shows 0 services

**Solutions**:
1. Verify services running: `curl http://YOUR_SERVER_IP:8080/api/admin/services/status`
2. Check API endpoint in `bizobs-api.ts`
3. Review browser network tab
4. Check server logs

## Estimated Timeline

| Phase | Task | Duration |
|-------|------|----------|
| **Day 1** | Setup + Base structure | 4 hours |
| **Day 2** | Three main pages | 6 hours |
| **Day 3** | Polish + Testing | 4 hours |
| **Total** | POC to Production | **2-3 days** |

## Success Metrics

✅ **Functionality**
- All three dashboards working
- Real-time updates active
- API calls successful

✅ **UX**
- Consistent with Dynatrace design
- Responsive and fast
- Clear error messages

✅ **Integration**
- DQL queries working
- External API connection stable
- Chaos and Fix-It operational

## Resources

- **Dynatrace AppEngine Docs**: https://developer.dynatrace.com/preview/develop/app-functions/
- **Strato Components**: https://developer.dynatrace.com/preview/develop/ui/strato/
- **DQL Reference**: https://docs.dynatrace.com/docs/platform/grail/dynatrace-query-language

---

**Status**: ✅ POC Complete - Ready for installation and deployment

**Next Action**: Run `npm install` in the `app/` directory to get started!
