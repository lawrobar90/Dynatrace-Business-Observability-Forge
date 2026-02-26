# BizObs Generator - Dynatrace AppEngine App

A Dynatrace AppEngine frontend for the BizObs Generator platform. This app provides a native Dynatrace UI for service orchestration, chaos engineering, and autonomous remediation powered by AI agents.

## Architecture

### Hybrid Deployment Model

```
┌─────────────────────────────────────────┐
│   Dynatrace AppEngine (Frontend)        │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│   • React + Strato Components           │
│   • DQL queries (native Dynatrace SDK)  │
│   • Real-time dashboards                │
│   • Service management UI               │
│   • Chaos control panel                 │
│   • Fix-It agent triggers               │
└──────────────┬──────────────────────────┘
               │ HTTP REST API calls
               │
               ▼
┌─────────────────────────────────────────┐
│   BizObs Generator Server (Backend)     │
│   External EC2: YOUR_SERVER_IP:8080       │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│   • AI Agents (Fix-It, Gremlin)         │
│   • MCP Server + Davis AI integration   │
│   • Service orchestration engine        │
│   • Chaos injection system              │
│   • LoadRunner simulators               │
│   • Feature flag management             │
└─────────────────────────────────────────┘
```

### Benefits of This Architecture

✅ **No Backend Migration Needed** - All complex logic stays on the existing EC2 server  
✅ **Dynatrace Native UI** - Uses official Strato components for consistent UX  
✅ **DQL Integration** - Direct queries to Dynatrace data without API tokens  
✅ **Easy Updates** - Backend improvements don't require AppEngine redeployment  
✅ **Flexible Deployment** - App can run standalone or embedded in Dynatrace  

## Features

### 1. Service Management Dashboard
- Real-time view of all running microservices
- Service metrics (status, uptime, port, company context)
- Start/stop controls
- Auto-refresh (5s interval)

### 2. Chaos Engineering Control
- Inject chaos into specific services
- Configure error rates (10% - 100%)
- Enable latency injection
- Revert all chaos with one click
- Live global error rate monitoring

### 3. Fix-It AI Agent
- View active Dynatrace problems (via DQL)
- Manual trigger for specific problem IDs
- Agent status monitoring
- Integration with Davis AI for root cause analysis
- Autonomous remediation tracking

## API Endpoints Used

The AppEngine app calls these BizObs server APIs:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/services/status` | GET | Fetch all running services |
| `/api/admin/services/stop-everything` | POST | Stop all services |
| `/api/gremlin/inject` | POST | Inject chaos into service |
| `/api/gremlin/revert-all` | POST | Revert all chaos |
| `/api/feature_flag` | GET | Get global error rates |
| `/api/workflow-webhook/problem` | POST | Trigger Fix-It agent |
| `/api/autonomous/status` | GET | Get Fix-It agent status |

## Setup & Deployment

### Prerequisites

1. **BizObs Generator Server Running**
   - Must be accessible at `http://YOUR_SERVER_IP:8080`
   - Or configure custom URL in `app/src/app/services/bizobs-api.ts`

2. **Dynatrace Tenant Access**
   - AppEngine deployment permissions
   - DQL query access

3. **Node.js & npm**
   - Node.js 18+
   - npm or yarn

### Installation

```bash
cd "BizObs Generator - Dynatrace AppEngine App/app"
npm install
```

### Local Development

```bash
# Set environment variables
export BIZOBS_SERVER_URL="http://YOUR_SERVER_IP:8080"

# Start development server
npm start
```

The app will start at `https://localhost:3000` with hot-reload enabled.

### Build for Production

```bash
npm run build
```

### Deploy to Dynatrace

```bash
# Authenticate with Dynatrace
dt-app login

# Deploy to your tenant
npm run deploy
```

Or use the Dynatrace CLI:

```bash
dt-app deploy --tenant-url=https://YOUR_TENANT_ID.apps.dynatracelabs.com
```

## Configuration

### Server URL Configuration

The BizObs server URL can be configured in multiple ways:

**Option 1: Environment Variable** (Recommended)
```bash
export BIZOBS_SERVER_URL="http://your-server:8080"
```

**Option 2: Dynatrace App Settings**
```typescript
// In app/src/app/services/bizobs-api.ts
import { settingsObjectsClient } from '@dynatrace-sdk/client-classic-environment-v2';

const settings = await settingsObjectsClient.getObjectList({
  schemaIds: 'builtin:bizobs.server.url'
});
```

**Option 3: Dynatrace Credential Vault**
```typescript
import { credentialsVaultClient } from '@dynatrace-sdk/client-classic-environment-v2';

const credential = await credentialsVaultClient.getCredentials({
  id: 'BIZOBS_SERVER_URL'
});
```

### Security Considerations

⚠️ **Important**: The external BizObs server must be accessible from Dynatrace AppEngine:

1. **Whitelist Dynatrace IPs** - Configure firewall rules
2. **Use HTTPS** - Recommended for production
3. **API Authentication** - Add API key validation on BizObs server
4. **CORS Configuration** - Allow Dynatrace domain origins

## File Structure

```
app/
├── package.json              # Dependencies
├── src/
│   └── app/
│       ├── index.tsx         # Entry point
│       ├── App.tsx           # Main app component with routing
│       ├── services/
│       │   └── bizobs-api.ts # API client for external server
│       └── pages/
│           ├── ServiceDashboard.tsx  # Service management UI
│           ├── ChaosControl.tsx      # Chaos engineering UI
│           └── FixItAgent.tsx        # Fix-It agent UI
└── app.config.json          # AppEngine configuration
```

## Development Workflow

### Adding New Features

1. **Add API method** in `services/bizobs-api.ts`:
```typescript
export async function myNewFeature(): Promise<any> {
  const response = await fetch(`${BIZOBS_SERVER_URL}/api/my-endpoint`);
  return response.json();
}
```

2. **Create component** in `pages/`:
```typescript
import { myNewFeature } from '../services/bizobs-api';

export const MyFeature = () => {
  // Use Strato components
  return <Page>...</Page>;
};
```

3. **Add route** in `App.tsx`:
```typescript
<Route path="/my-feature" element={<MyFeature />} />
```

### Testing

```bash
# Run tests
npm test

# Run linting
npm run lint
```

## Troubleshooting

### Connection Failed

**Error**: `Failed to fetch services: Network request failed`

**Solutions**:
- Verify BizObs server is running: `curl http://YOUR_SERVER_IP:8080/api/health`
- Check firewall rules
- Verify CORS headers on server
- Check browser console for detailed errors

### DQL Permission Denied

**Error**: `403 Forbidden when querying events`

**Solution**: Ensure app has required scopes in `app.config.json`:
```json
{
  "scopes": [
    { "name": "environment-api" },
    { "name": "storage:logs:read" },
    { "name": "storage:events:read" }
  ]
}
```

### Services Not Updating

**Issue**: Dashboard shows stale data

**Solution**: 
- Check auto-refresh interval (default: 5s)
- Verify server API is responding
- Check browser network tab for failed requests

## Extending the App

### Adding Dynatrace Data

Use the Dynatrace SDK to query native data:

```typescript
import { queryExecutionClient } from '@dynatrace-sdk/client-query';

// Query service metrics
const result = await queryExecutionClient.queryExecute({
  body: {
    query: `
      timeseries avg(dt.service.request.count)
      | filter dt.entity.service == "ClubcardLinkingService-Retail"
    `
  }
});
```

### Custom Visualizations

Use Strato components for charts:

```typescript
import { LineChart } from '@dynatrace/strato-components-preview/charts';

<LineChart
  data={metricsData}
  xAxis={{ key: 'timestamp' }}
  yAxis={{ key: 'errorRate' }}
/>
```

## Production Checklist

- [ ] Configure production server URL
- [ ] Enable HTTPS on BizObs server
- [ ] Set up API authentication
- [ ] Configure CORS properly
- [ ] Test all features end-to-end
- [ ] Set up monitoring/logging
- [ ] Document deployment process
- [ ] Train users on new UI

## Support

For issues or questions:
- Check server logs: `/home/ec2-user/BizObs Generator/logs/`
- Review AppEngine logs in Dynatrace UI
- Test APIs directly: `curl http://YOUR_SERVER_IP:8080/api/health`

## License

Internal use only
