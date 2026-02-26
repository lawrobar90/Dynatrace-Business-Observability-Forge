/**
 * Serverless proxy function for BizObs Generator API calls.
 * Runs server-side to bypass browser CSP restrictions.
 */

import { edgeConnectClient } from '@dynatrace-sdk/client-app-engine-edge-connect';
import { settingsObjectsClient } from '@dynatrace-sdk/client-classic-environment-v2';
import { queryExecutionClient } from '@dynatrace-sdk/client-query';

interface ProxyPayload {
  action: 'simulate-journey' | 'test-connection' | 'get-services' | 'stop-all-services' | 'stop-company-services' | 'get-dormant-services' | 'clear-dormant-services' | 'clear-company-dormant' | 'chaos-get-active' | 'chaos-get-recipes' | 'chaos-inject' | 'chaos-revert' | 'chaos-revert-all' | 'chaos-get-targeted' | 'chaos-remove-target' | 'chaos-smart' | 'ec-create' | 'detect-builtin-settings' | 'deploy-builtin-settings' | 'debug-builtin-schema' | 'generate-dashboard' | 'generate-dashboard-async' | 'get-dashboard-status' | 'deploy-dashboard' | 'deploy-business-flow';
  apiHost: string;
  apiPort: string;
  apiProtocol: string;
  body?: unknown;
}

export default async function (payload: ProxyPayload) {
  if (!payload || !payload.action) {
    return { success: false, error: 'Missing action in payload' };
  }

  const { action, apiHost, apiPort, apiProtocol, body } = payload;
  const baseUrl = `${apiProtocol}://${apiHost}:${apiPort}`;

  try {
    if (action === 'test-connection') {
      try {
        const healthRes = await fetch(`${baseUrl}/api/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(8000),
        });
        const healthData = await healthRes.json() as Record<string, unknown>;
        // The server reports the caller's IP — this is the actual IP that reached the server
        const callerIp = (healthData.callerIp as string) || null;
        return {
          success: true,
          status: healthRes.status,
          message: `Server is running on ${apiHost}:${apiPort} (health: ${healthRes.status})`,
          callerIp,
        };
      } catch {
        try {
          const fallbackRes = await fetch(`${baseUrl}/api/journey-simulation/simulate-journey`, {
            method: 'GET',
            signal: AbortSignal.timeout(8000),
          });
          return {
            success: true,
            status: fallbackRes.status,
            message: `Server reachable on ${apiHost}:${apiPort} (status ${fallbackRes.status})`,
            callerIp: null,
          };
        } catch {
          // Both endpoints unreachable — likely a firewall issue
          return {
            success: false,
            error: `Cannot reach ${apiHost}:${apiPort}`,
            callerIp: null,
            details: `Could not reach ${baseUrl}. Ensure port ${apiPort} is open for inbound TCP in your firewall/security group. If using AWS, set Source to 0.0.0.0/0 temporarily, then run Test again — once connected, the exact source IP will be shown so you can restrict the rule.`,
          };
        }
      }
    }

    if (action === 'get-services') {
      const healthRes = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });
      const data = await healthRes.json();
      return { success: true, status: healthRes.status, data };
    }

    if (action === 'stop-all-services') {
      const res = await fetch(`${baseUrl}/api/admin/services/stop-everything`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    if (action === 'stop-company-services') {
      const res = await fetch(`${baseUrl}/api/admin/services/stop-by-company`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    if (action === 'get-dormant-services') {
      const res = await fetch(`${baseUrl}/api/admin/services/dormant`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    if (action === 'clear-dormant-services') {
      const res = await fetch(`${baseUrl}/api/admin/services/clear-dormant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    if (action === 'clear-company-dormant') {
      const res = await fetch(`${baseUrl}/api/admin/services/clear-dormant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    // ── Chaos Agent endpoints ──

    if (action === 'chaos-get-active') {
      const res = await fetch(`${baseUrl}/api/gremlin/active`, { method: 'GET', signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    if (action === 'chaos-get-recipes') {
      const res = await fetch(`${baseUrl}/api/gremlin/recipes`, { method: 'GET', signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    if (action === 'chaos-inject') {
      const res = await fetch(`${baseUrl}/api/gremlin/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    if (action === 'chaos-revert') {
      const { faultId } = body as { faultId: string };
      const res = await fetch(`${baseUrl}/api/gremlin/revert/${encodeURIComponent(faultId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    if (action === 'chaos-revert-all') {
      const res = await fetch(`${baseUrl}/api/gremlin/revert-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    if (action === 'chaos-get-targeted') {
      const res = await fetch(`${baseUrl}/api/feature_flag/services`, { method: 'GET', signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    if (action === 'chaos-remove-target') {
      const { serviceName } = body as { serviceName: string };
      const res = await fetch(`${baseUrl}/api/feature_flag/service/${encodeURIComponent(serviceName)}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    if (action === 'chaos-smart') {
      const res = await fetch(`${baseUrl}/api/gremlin/smart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    // ── EdgeConnect creation via SDK (server-side, uses platform auth) ──

    if (action === 'ec-create') {
      const { oauthClientId, ecName, hostPatterns } = body as {
        oauthClientId?: string;
        ecName: string;
        hostPatterns: string[];
      };

      try {
        // If no oauthClientId provided, SDK auto-generates an environment-scoped OAuth client
        const createBody: { name: string; hostPatterns: string[]; oauthClientId?: string } = {
          name: ecName,
          hostPatterns,
        };
        if (oauthClientId) {
          createBody.oauthClientId = oauthClientId;
        }
        const result = await edgeConnectClient.createEdgeConnect({
          body: createBody,
        });
        return { success: true, data: result };
      } catch (sdkErr: any) {
        const errBody = sdkErr?.body || sdkErr;
        const detail = errBody?.error?.message || sdkErr?.message || 'Unknown SDK error';
        const missingScopes = errBody?.error?.details?.missingScopes;
        const scopeInfo = missingScopes?.length ? ` | Missing scopes: ${missingScopes.join(', ')}` : '';
        return {
          success: false,
          error: `SDK EdgeConnect create failed: ${detail}${scopeInfo}`,
          debug: { rawError: JSON.stringify(errBody, null, 2) },
        };
      }
    }

    // ── Detect builtin Dynatrace settings for Get Started checklist ──
    if (action === 'detect-builtin-settings') {
      const detected: Record<string, boolean> = {};
      const hostIp = (body as any)?.hostIp as string | undefined;

      // 1. BizEvents HTTP incoming capture rule named "BizObs App2"
      try {
        const result = await settingsObjectsClient.getSettingsObjects({
          schemaIds: 'builtin:bizevents.http.incoming',
          fields: 'objectId,value',
          filter: "value.ruleName = 'BizObs App2'",
          pageSize: 1,
        });
        detected['biz-events'] = result.totalCount > 0;
      } catch { detected['biz-events'] = false; }

      // 2. OpenPipeline bizevents pipeline named "BizObs Template Pipeline2"
      try {
        const result = await settingsObjectsClient.getSettingsObjects({
          schemaIds: 'builtin:openpipeline.bizevents.pipelines',
          fields: 'objectId,value',
          filter: "value.displayName = 'BizObs Template Pipeline2'",
          pageSize: 1,
        });
        detected['openpipeline'] = result.totalCount > 0;
      } catch { detected['openpipeline'] = false; }

      // 3. OpenPipeline bizevents routing — check routingEntries[] for description "BizObs App2"
      try {
        const result = await settingsObjectsClient.getSettingsObjects({
          schemaIds: 'builtin:openpipeline.bizevents.routing',
          pageSize: 5,
        });
        let routingFound = false;
        for (const item of result.items || []) {
          const val = item.value as { routingEntries?: Array<{ description?: string }> };
          if (val.routingEntries?.some(e => e.description === 'BizObs App2')) {
            routingFound = true;
            break;
          }
        }
        detected['openpipeline-routing'] = routingFound;
      } catch { detected['openpipeline-routing'] = false; }

      // 4. OneAgent feature flag SENSOR_NODEJS_BIZEVENTS_HTTP_INCOMING enabled
      try {
        const result = await settingsObjectsClient.getSettingsObjects({
          schemaIds: 'builtin:oneagent.features',
          fields: 'objectId,value',
          filter: "value.key = 'SENSOR_NODEJS_BIZEVENTS_HTTP_INCOMING'",
          pageSize: 1,
        });
        // Must exist AND have both enabled + instrumentation true
        const flagValue = result.items?.[0]?.value as Record<string, unknown> | undefined;
        detected['feature-flags'] = result.totalCount > 0 && flagValue?.enabled === true && flagValue?.instrumentation === true;
      } catch { detected['feature-flags'] = false; }

      // 5. OneAgent installed on host — DQL query using matchesPhrase for the configured IP
      if (hostIp) {
        try {
          const dqlQuery = `fetch dt.entity.host
| fields ipAddress
| filter matchesPhrase(ipAddress,"${hostIp}")
| filter isNotNull(ipAddress)
| summarize OneAgentDeployed = count()`;
          console.log(`[detect] OneAgent DQL: ${dqlQuery}`);
          const queryResult = await queryExecutionClient.queryExecute({
            body: {
              query: dqlQuery,
              requestTimeoutMilliseconds: 15000,
              maxResultRecords: 1,
            },
          });
          const records = queryResult?.result?.records || [];
          const count = Number(records[0]?.OneAgentDeployed ?? 0);
          console.log(`[detect] OneAgent count for ${hostIp}: ${count}`);
          detected['oneagent'] = count > 0;
        } catch (e: any) { console.log(`[detect] OneAgent DQL error: ${e.message}`); detected['oneagent'] = false; }
      } else {
        console.log('[detect] No hostIp provided, skipping OneAgent check');
        detected['oneagent'] = false;
      }

      // 6. EdgeConnect deployed and online — check via EdgeConnect SDK
      try {
        const ecList = await edgeConnectClient.listEdgeConnects({ addFields: 'metadata' });
        const ecItems = ecList.edgeConnects || [];
        detected['edgeconnect-create'] = ecItems.length > 0;
        const anyWithInstances = ecItems.some(
          (ec: any) => (ec.metadata?.instances || []).length > 0
        );
        detected['edgeconnect-deploy'] = anyWithInstances;
        detected['edgeconnect-online'] = anyWithInstances;
      } catch {
        detected['edgeconnect-create'] = false;
        detected['edgeconnect-deploy'] = false;
        detected['edgeconnect-online'] = false;
      }

      // 7. EdgeConnect connectivity + test-connection — ping the configured host from serverless
      //    If the fetch succeeds, EdgeConnect routing works AND connection is verified.
      if (apiHost && apiPort) {
        try {
          const proto = apiProtocol || 'http';
          const pingUrl = `${proto}://${apiHost}:${apiPort}/api/health`;
          console.log(`[detect] Pinging ${pingUrl}...`);
          const pingRes = await fetch(pingUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(6000),
          });
          const reachable = pingRes.ok || pingRes.status > 0;
          console.log(`[detect] Ping result: status=${pingRes.status}, reachable=${reachable}`);
          detected['outbound-connections'] = reachable;
          detected['test-connection'] = reachable;
        } catch (e: any) {
          console.log(`[detect] Ping failed: ${e.message}`);
          detected['outbound-connections'] = false;
          detected['test-connection'] = false;
        }
      } else {
        console.log(`[detect] No apiHost/apiPort — skipping ping`);
        detected['outbound-connections'] = false;
        detected['test-connection'] = false;
      }

      return { success: true, data: detected };
    }

    // ── Deploy builtin Dynatrace settings for BizObs ──
    if (action === 'debug-builtin-schema') {
      const debugResults: Record<string, unknown> = {};
      
      // Fetch openpipeline pipelines (all, no filter)
      try {
        const result = await settingsObjectsClient.getSettingsObjects({
          schemaIds: 'builtin:openpipeline.bizevents.pipelines',
          pageSize: 5,
        });
        debugResults['pipelines'] = { totalCount: result.totalCount, items: result.items?.map(i => ({ objectId: i.objectId, schemaVersion: i.schemaVersion, value: i.value })) };
      } catch (err: any) {
        debugResults['pipelines'] = { error: err?.message };
      }

      // Fetch openpipeline routing (all, no filter)
      try {
        const result = await settingsObjectsClient.getSettingsObjects({
          schemaIds: 'builtin:openpipeline.bizevents.routing',
          pageSize: 5,
        });
        debugResults['routing'] = { totalCount: result.totalCount, items: result.items?.map(i => ({ objectId: i.objectId, schemaVersion: i.schemaVersion, value: i.value })) };
      } catch (err: any) {
        debugResults['routing'] = { error: err?.message };
      }

      return { success: true, data: debugResults };
    }

    if (action === 'deploy-builtin-settings') {
      const { configs } = body as { configs: string[] };
      if (!configs || !Array.isArray(configs) || configs.length === 0) {
        return { success: false, error: 'No configs specified to deploy' };
      }

      const results: Record<string, { success: boolean; error?: string }> = {};

      for (const configKey of configs) {
        try {
          if (configKey === 'biz-events') {
            // Fetch the existing "BizObs App" capture rule to get exact schema structure
            const existing = await settingsObjectsClient.getSettingsObjects({
              schemaIds: 'builtin:bizevents.http.incoming',
              filter: "value.ruleName = 'BizObs App'",
              pageSize: 1,
            });
            
            if (existing.totalCount > 0 && existing.items?.[0]) {
              // Clone the existing value and rename
              const clonedValue = JSON.parse(JSON.stringify(existing.items[0].value));
              clonedValue.ruleName = 'BizObs App2';
              
              await settingsObjectsClient.postSettingsObjects({
                body: [{
                  schemaId: 'builtin:bizevents.http.incoming',
                  scope: 'environment',
                  schemaVersion: existing.items[0].schemaVersion,
                  value: clonedValue,
                }],
              });
              results['biz-events'] = { success: true };
            } else {
              // No existing config to clone — create from scratch with minimal fields
              await settingsObjectsClient.postSettingsObjects({
                body: [{
                  schemaId: 'builtin:bizevents.http.incoming',
                  scope: 'environment',
                  value: {
                    enabled: true,
                    ruleName: 'BizObs App2',
                    triggers: { trigger: [{ source: { dataSource: 'request.path' }, type: 'CONTAINS', value: '/api/', caseSensitive: false }] },
                    event: {
                      provider: { sourceType: 'constant', source: 'bizobs-generator' },
                      type: { sourceType: 'constant', source: 'com.bizobs.http.request' },
                      category: { sourceType: 'constant', source: '' },
                    },
                  },
                }],
              });
              results['biz-events'] = { success: true, error: 'Created from scratch (no existing BizObs App config found to clone)' };
            }
          } else if (configKey === 'openpipeline') {
            // Clone existing "BizObs Template Pipeline" → create "BizObs Template Pipeline2"
            // Then immediately create routing entry pointing to the new pipeline
            const existingPipeline = await settingsObjectsClient.getSettingsObjects({
              schemaIds: 'builtin:openpipeline.bizevents.pipelines',
              filter: "value.displayName = 'BizObs Template Pipeline'",
              pageSize: 1,
            });

            if (existingPipeline.totalCount > 0 && existingPipeline.items?.[0]) {
              const clonedValue = JSON.parse(JSON.stringify(existingPipeline.items[0].value));
              clonedValue.displayName = 'BizObs Template Pipeline2';
              clonedValue.customId = 'pipeline_BizObs_Template_Pipeline2_' + Math.floor(Math.random() * 10000);
              
              const pipelineResponse = await settingsObjectsClient.postSettingsObjects({
                body: [{
                  schemaId: 'builtin:openpipeline.bizevents.pipelines',
                  scope: 'environment',
                  value: clonedValue,
                }],
              });
              
              const newPipelineObjectId = pipelineResponse?.[0]?.objectId;
              results['openpipeline'] = { success: true };

              // If routing is also requested, chain it now with the correct pipelineId
              if (configs.includes('openpipeline-routing') && newPipelineObjectId) {
                try {
                  const existingRouting = await settingsObjectsClient.getSettingsObjects({
                    schemaIds: 'builtin:openpipeline.bizevents.routing',
                    pageSize: 5,
                  });

                  let routingItem = existingRouting.items?.[0];
                  let bizObsEntry: Record<string, unknown> | undefined;
                  for (const item of existingRouting.items || []) {
                    const val = item.value as { routingEntries?: Array<Record<string, unknown>> };
                    const entry = val.routingEntries?.find(e => e.description === 'BizObs App');
                    if (entry) { bizObsEntry = entry; routingItem = item; break; }
                  }

                  if (bizObsEntry && routingItem) {
                    const routingValue = JSON.parse(JSON.stringify(routingItem.value)) as { routingEntries: Array<Record<string, unknown>> };
                    const newEntry = JSON.parse(JSON.stringify(bizObsEntry));
                    newEntry.description = 'BizObs App2';
                    newEntry.pipelineId = newPipelineObjectId;  // Point to the newly created pipeline
                    routingValue.routingEntries.push(newEntry);

                    await settingsObjectsClient.postSettingsObjects({
                      body: [{
                        schemaId: 'builtin:openpipeline.bizevents.routing',
                        scope: 'environment',
                        value: routingValue,
                      }],
                    });
                    results['openpipeline-routing'] = { success: true };
                  } else {
                    results['openpipeline-routing'] = { success: false, error: 'No existing routing entry with description "BizObs App" found to clone' };
                  }
                } catch (routeErr: any) {
                  const detail = routeErr?.body?.error?.constraintViolations
                    ? JSON.stringify(routeErr.body.error.constraintViolations)
                    : routeErr?.body?.error?.message || routeErr?.message || 'Unknown error';
                  results['openpipeline-routing'] = { success: false, error: detail };
                }
              }
            } else {
              results['openpipeline'] = { success: false, error: 'No existing "BizObs Template Pipeline" found to clone' };
            }

          } else if (configKey === 'openpipeline-routing') {
            // Skip if already handled by the openpipeline block above
            if (results['openpipeline-routing']) continue;
            
            // Routing requested alone — find existing BizObs Template Pipeline2 objectId
            const existingRouting = await settingsObjectsClient.getSettingsObjects({
              schemaIds: 'builtin:openpipeline.bizevents.routing',
              pageSize: 5,
            });

            // Find the routing object with "BizObs App" entry to clone
            let routingItem = existingRouting.items?.[0];
            let bizObsEntry: Record<string, unknown> | undefined;
            for (const item of existingRouting.items || []) {
              const val = item.value as { routingEntries?: Array<Record<string, unknown>> };
              const entry = val.routingEntries?.find(e => e.description === 'BizObs App');
              if (entry) { bizObsEntry = entry; routingItem = item; break; }
            }

            // Find existing Pipeline2 to get its objectId for the routing entry
            const existingPipeline2 = await settingsObjectsClient.getSettingsObjects({
              schemaIds: 'builtin:openpipeline.bizevents.pipelines',
              filter: "value.displayName = 'BizObs Template Pipeline2'",
              pageSize: 1,
            });
            const pipeline2ObjectId = existingPipeline2.items?.[0]?.objectId;

            if (bizObsEntry && routingItem && pipeline2ObjectId) {
              const routingValue = JSON.parse(JSON.stringify(routingItem.value)) as { routingEntries: Array<Record<string, unknown>> };
              const newEntry = JSON.parse(JSON.stringify(bizObsEntry));
              newEntry.description = 'BizObs App2';
              newEntry.pipelineId = pipeline2ObjectId;
              routingValue.routingEntries.push(newEntry);

              await settingsObjectsClient.postSettingsObjects({
                body: [{
                  schemaId: 'builtin:openpipeline.bizevents.routing',
                  scope: 'environment',
                  value: routingValue,
                }],
              });
              results['openpipeline-routing'] = { success: true };
            } else if (!pipeline2ObjectId) {
              results['openpipeline-routing'] = { success: false, error: 'Pipeline "BizObs Template Pipeline2" must be created first' };
            } else {
              results['openpipeline-routing'] = { success: false, error: 'No existing routing entry with description "BizObs App" found to clone' };
            }

          } else if (configKey === 'feature-flags') {
            // OneAgent feature keys are predefined enums — cannot create custom keys.
            // Check if SENSOR_NODEJS_BIZEVENTS_HTTP_INCOMING already exists; if so, update it.
            const existing = await settingsObjectsClient.getSettingsObjects({
              schemaIds: 'builtin:oneagent.features',
              fields: 'objectId,value',
              filter: "value.key = 'SENSOR_NODEJS_BIZEVENTS_HTTP_INCOMING'",
              pageSize: 1,
            });

            if (existing.totalCount > 0 && existing.items?.[0]) {
              // Already exists — ensure it's enabled
              const currentValue = existing.items[0].value as Record<string, unknown>;
              if (currentValue.enabled === true) {
                results['feature-flags'] = { success: true, error: 'Already configured and enabled — no changes needed' };
              } else {
                // UPDATE existing object via PUT (can't POST a duplicate feature key)
                const updatedValue = JSON.parse(JSON.stringify(currentValue));
                updatedValue.enabled = true;
                updatedValue.instrumentation = true;
                await settingsObjectsClient.putSettingsObjectByObjectId({
                  objectId: existing.items[0].objectId,
                  body: {
                    value: updatedValue,
                  },
                });
                results['feature-flags'] = { success: true };
              }
            } else {
              // Create from scratch with the real key
              await settingsObjectsClient.postSettingsObjects({
                body: [{
                  schemaId: 'builtin:oneagent.features',
                  scope: 'environment',
                  value: {
                    enabled: true,
                    key: 'SENSOR_NODEJS_BIZEVENTS_HTTP_INCOMING',
                    instrumentation: true,
                  },
                }],
              });
              results['feature-flags'] = { success: true };
            }
          } else {
            results[configKey] = { success: false, error: `Unknown config key: ${configKey}. OpenPipeline configs must be configured manually.` };
          }
        } catch (err: any) {
          const detail = err?.body?.error?.constraintViolations
            ? JSON.stringify(err.body.error.constraintViolations)
            : err?.body?.error?.message || err?.message || 'Unknown error';
          results[configKey] = { success: false, error: detail };
        }
      }

      return { success: true, data: results };
    }

    // ── Async Dashboard generation (jobs/polling model) ──
    if (action === 'generate-dashboard-async') {
      try {
        const res = await fetch(`${baseUrl}/api/ai-dashboard/generate-async`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20000), // Allow extra time for routing/edge latency
        });
        const data = await res.json();
        return { success: res.ok, ...data };
      } catch (error: any) {
        console.error('[proxy-api] Async dashboard start error:', error.message);
        return { success: false, error: error.message };
      }
    }

    // Get dashboard job status (polling)
    if (action === 'get-dashboard-status') {
      try {
        const { jobId } = body as { jobId: string };
        if (!jobId) {
          return { success: false, error: 'jobId required' };
        }
        const res = await fetch(`${baseUrl}/api/ai-dashboard/status/${jobId}`, {
          method: 'GET',
          signal: AbortSignal.timeout(15000), // Slightly longer to accommodate network/edge delays
        });
        const data = await res.json();
        return { success: res.ok, ...data };
      } catch (error: any) {
        console.error('[proxy-api] Dashboard status check error:', error.message);
        return { success: false, error: error.message };
      }
    }

    // ── AI Dashboard generation (calls server's ai-dashboard route) ──
    if (action === 'generate-dashboard') {
      try {
        const res = await fetch(`${baseUrl}/api/ai-dashboard/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000), // Template generation: fast, but allow ample time
        });
        const data = await res.json();
        // Optimize large response: strip unnecessary fields to reduce size
        if (data.dashboard && data.dashboard.content) {
          // Keep only essential dashboard properties
          const optimized = {
            name: data.dashboard.name,
            type: data.dashboard.type,
            version: data.dashboard.version,
            content: data.dashboard.content,
            metadata: data.dashboard.metadata
          };
          // Check size and optionally compress
          const jsonStr = JSON.stringify(optimized);
          const sizeKb = jsonStr.length / 1024;
          
          // If response is large enough, indicate compression for client-side handling
          return { 
            success: res.ok, 
            status: res.status, 
            data: { 
              dashboard: optimized,
              _meta: { sizeMb: (sizeKb / 1024).toFixed(3), compressed: false }
            } 
          };
        }
        // Fallback: return minimal response structure
        return { success: res.ok, status: res.status, data };
      } catch (error: any) {
        console.error('[proxy-api] Dashboard generation timeout/error:', error.message);
        return { success: false, status: 0, error: error.message };
      }
    }


    if (action === 'deploy-business-flow') {
      try {
        // 1. Generate the Business Flow JSON from the Node backend (no DT credentials needed)
        const genRes = await fetch(`${baseUrl}/api/business-flow/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        const genData = await genRes.json() as any;
        if (!genRes.ok || !genData.ok || !genData.businessFlow) {
          return { success: false, error: genData.error || 'Failed to generate Business Flow' };
        }
        const flow = genData.businessFlow;

        // 2. Deploy to Dynatrace using AppEngine SDK (uses AppEngine OAuth — no API token needed)
        await settingsObjectsClient.postSettingsObjects({
          body: [{
            schemaId: 'app:dynatrace.biz.flow:biz-flow-settings',
            scope: 'environment',
            value: flow,
          }],
        });

        return {
          success: true,
          data: {
            ok: true,
            name: flow.name,
            steps: flow.steps.length,
            message: `Business Flow "${flow.name}" deployed successfully.`
          }
        };
      } catch (error: any) {
        console.error('[proxy-api] Business Flow deploy error:', error.message);
        return { success: false, status: 0, error: error.message };
      }
    }

    if (action === 'simulate-journey') {
      const apiUrl = `${baseUrl}/api/journey-simulation/simulate-journey`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      let data: unknown;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = responseText;
      }

      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          error: `API responded with ${response.status}: ${response.statusText}`,
          data,
        };
      }

      return { success: true, status: response.status, data };
    }

    return { success: false, error: `Unknown action: ${action}` };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Connection failed',
      details: `Could not reach ${baseUrl}. Check host/port, ensure the server is running, and that your firewall allows inbound TCP on port ${apiPort}.`,
    };
  }
}
