/**
 * Chaos Recipes — Feature-Flag-Based Failure Injection.
 * Wraps the EXISTING /api/feature_flag and /api/remediation/feature-flag
 * endpoints to inject controlled errors through the real app mechanisms.
 *
 * Each recipe calls the app's own API to toggle feature flags, change
 * error rates, and enable/disable error injection — the same controls
 * that Dynatrace Workflows and the UI use.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('nemesis');

// ─── Types ────────────────────────────────────────────────────

export type ChaosType =
  | 'enable_errors'
  | 'increase_error_rate'
  | 'slow_responses'
  | 'cascading_latency'
  | 'dependency_timeout'
  | 'jitter'
  | 'target_company'
  | 'custom_flag';

export interface ChaosRecipe {
  type: ChaosType;
  name: string;
  description: string;
  inject: (params: ChaosParams) => Promise<ChaosResult>;
  revert: (context: ChaosResult) => Promise<void>;
}

export interface ChaosParams {
  target: string;
  durationMs?: number;
  intensity?: number;
  details?: Record<string, unknown>;
}

export interface ChaosResult {
  chaosId: string;
  type: ChaosType;
  target: string;
  injectedAt: string;
  revertInfo: Record<string, unknown>;
  status: 'active' | 'reverted' | 'expired';
}

// ─── Helpers ──────────────────────────────────────────────────

let chaosCounter = 0;
function nextChaosId(): string {
  return `chaos-${Date.now()}-${++chaosCounter}`;
}

const APP_BASE = `http://localhost:${process.env.PORT || 8080}`;

async function callFeatureFlagAPI(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${APP_BASE}${path}`;
  try {
    const opts: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    log.error(`Feature flag API call failed: ${method} ${path}`, { error: String(err) });
    return { success: false, error: String(err) };
  }
}

async function callRemediationAPI(
  flag: string,
  value: unknown,
  reason: string,
  targetService?: string,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    flag,
    value,
    reason,
    triggeredBy: 'nemesis-agent',
  };
  if (targetService) {
    body.targetService = targetService;
  }
  return callFeatureFlagAPI('POST', '/api/remediation/feature-flag', body);
}

// ─── Recipes ──────────────────────────────────────────────────

const enableErrorsRecipe: ChaosRecipe = {
  type: 'enable_errors',
  name: 'Enable Error Injection',
  description: 'Enables error injection on a specific service (or all) by setting errors_per_transaction via per-service feature flag overrides. Intensity 1-10 maps to 10%-100% error rate.',
  async inject(params) {
    const id = nextChaosId();
    const intensity = params.intensity ?? 5;
    const errorRate = Math.min(intensity / 10, 1.0);
    const targetService = params.target && params.target !== 'default' ? params.target : undefined;
    log.info(`👹 Enabling error injection (rate=${errorRate})`, { id, targetService: targetService || 'all' });

    // Set errors_per_transaction via the feature flag API (System B) — this is what child services actually read
    if (targetService) {
      await callFeatureFlagAPI('POST', '/api/feature_flag', {
        flags: { errors_per_transaction: errorRate },
        targetService: targetService,
        triggeredBy: 'nemesis-agent'
      });
    } else {
      await callFeatureFlagAPI('POST', '/api/feature_flag', {
        flags: { errors_per_transaction: errorRate },
        triggeredBy: 'nemesis-agent'
      });
    }

    // Also set the legacy remediation flag for DT event tracking
    await callRemediationAPI('errorInjectionEnabled', true, `Nemesis: enabling error injection (rate=${errorRate})${targetService ? ` on ${targetService}` : ''}`, targetService);

    return {
      chaosId: id, type: 'enable_errors', target: targetService || 'all',
      injectedAt: new Date().toISOString(),
      revertInfo: { errorRate, targetService },
      status: 'active',
    };
  },
  async revert(ctx) {
    const targetService = ctx.revertInfo.targetService as string | undefined;
    if (targetService) {
      // Remove per-service override — service falls back to safe defaults (errors_per_transaction=0)
      await callFeatureFlagAPI('DELETE', `/api/feature_flag/service/${encodeURIComponent(targetService)}`);
    } else {
      // Reset global errors_per_transaction to 0
      await callFeatureFlagAPI('POST', '/api/feature_flag', {
        flags: { errors_per_transaction: 0 },
        triggeredBy: 'nemesis-agent'
      });
    }
    await callRemediationAPI('errorInjectionEnabled', false, 'Nemesis revert: error injection', targetService);
    log.info(`Reverted error injection`, { chaosId: ctx.chaosId });
  },
};

const increaseErrorRateRecipe: ChaosRecipe = {
  type: 'increase_error_rate',
  name: 'Increase Error Rate',
  description: 'Raises errors_per_transaction for a SPECIFIC service via per-service targeting. Intensity 1-10 maps to 10%-100% error rate. Only the targeted service is affected.',
  async inject(params) {
    const id = nextChaosId();
    const intensity = params.intensity ?? 5;
    const newRate = Math.min(intensity / 10, 1.0);
    const targetService = params.target || 'all';
    log.info(`👹 Increasing error rate to ${newRate} for service: ${targetService}`, { id, intensity });

    // Set per-service override so only the targeted service gets elevated errors
    await callFeatureFlagAPI('POST', '/api/feature_flag', {
      flags: { errors_per_transaction: newRate },
      targetService: targetService,
      triggeredBy: 'nemesis-agent'
    });
    await callRemediationAPI('errorInjectionEnabled', true, `Nemesis: error rate → ${newRate} on ${targetService}`, targetService);

    return {
      chaosId: id, type: 'increase_error_rate', target: targetService,
      injectedAt: new Date().toISOString(),
      revertInfo: { targetService },
      status: 'active',
    };
  },
  async revert(ctx) {
    const targetService = String(ctx.revertInfo.targetService || ctx.target);
    // Remove per-service override — service falls back to safe defaults
    await callFeatureFlagAPI('DELETE', `/api/feature_flag/service/${encodeURIComponent(targetService)}`);
    log.info(`Reverted error rate for service: ${targetService}`, { chaosId: ctx.chaosId });
  },
};

const slowResponsesRecipe: ChaosRecipe = {
  type: 'slow_responses',
  name: 'Slow Response Injection',
  description: 'Adds a REAL delay (in milliseconds) to every request processed by the targeted service. Intensity 1-10 maps to 1s-10s. The delay happens inside the HTTP handler so it shows as increased span duration in Dynatrace traces.',
  async inject(params) {
    const id = nextChaosId();
    const intensity = params.intensity ?? 5;
    const delayMs = intensity * 1000; // 1-10 → 1000-10000ms
    const targetService = params.target && params.target !== 'default' ? params.target : undefined;
    log.info(`👹 Injecting slow responses: +${delayMs}ms`, { id, targetService: targetService || 'all' });

    // Set response_time_ms via the feature flag API (System B) — child services poll this
    if (targetService) {
      await callFeatureFlagAPI('POST', '/api/feature_flag', {
        flags: { response_time_ms: delayMs },
        targetService,
        triggeredBy: 'nemesis-agent'
      });
    } else {
      await callFeatureFlagAPI('POST', '/api/feature_flag', {
        flags: { response_time_ms: delayMs },
        triggeredBy: 'nemesis-agent'
      });
    }

    return {
      chaosId: id, type: 'slow_responses', target: targetService || 'all',
      injectedAt: new Date().toISOString(),
      revertInfo: { delayMs, targetService },
      status: 'active',
    };
  },
  async revert(ctx) {
    const targetService = ctx.revertInfo.targetService as string | undefined;
    if (targetService) {
      await callFeatureFlagAPI('POST', '/api/feature_flag', {
        flags: { response_time_ms: 0 },
        targetService,
        triggeredBy: 'nemesis-agent'
      });
    } else {
      await callFeatureFlagAPI('POST', '/api/feature_flag', {
        flags: { response_time_ms: 0 },
        triggeredBy: 'nemesis-agent'
      });
    }
    log.info(`Reverted slow responses`, { chaosId: ctx.chaosId });
  },
};

const cascadingLatencyRecipe: ChaosRecipe = {
  type: 'cascading_latency',
  name: 'Cascading Latency',
  description: 'Each service in the journey chain adds progressively MORE latency. Step 1 gets base delay, step 2 gets 2×, step 3 gets 3×, etc. Creates a classic waterfall degradation pattern visible in Dynatrace distributed traces. Intensity 1-10 maps to 500ms-5000ms base delay.',
  async inject(params) {
    const id = nextChaosId();
    const intensity = params.intensity ?? 5;
    const baseMs = intensity * 500; // 1-10 → 500-5000ms base
    const targetService = params.target && params.target !== 'default' ? params.target : undefined;
    log.info(`👹 Injecting cascading latency: base=${baseMs}ms (multiplied by step index)`, { id, targetService: targetService || 'all' });

    const apiBody: Record<string, unknown> = {
      flags: { cascading_latency_ms: baseMs },
      triggeredBy: 'nemesis-agent'
    };
    if (targetService) apiBody.targetService = targetService;
    await callFeatureFlagAPI('POST', '/api/feature_flag', apiBody);

    return {
      chaosId: id, type: 'cascading_latency', target: targetService || 'all',
      injectedAt: new Date().toISOString(),
      revertInfo: { baseMs, targetService },
      status: 'active',
    };
  },
  async revert(ctx) {
    const targetService = ctx.revertInfo.targetService as string | undefined;
    const apiBody: Record<string, unknown> = {
      flags: { cascading_latency_ms: 0 },
      triggeredBy: 'nemesis-agent'
    };
    if (targetService) apiBody.targetService = targetService;
    await callFeatureFlagAPI('POST', '/api/feature_flag', apiBody);
    log.info(`Reverted cascading latency`, { chaosId: ctx.chaosId });
  },
};

const dependencyTimeoutRecipe: ChaosRecipe = {
  type: 'dependency_timeout',
  name: 'Dependency Timeout',
  description: 'Forces the targeted service to make a real outbound HTTP call to a non-routable address that hangs and times out. This creates a visible failed external dependency call in the Dynatrace trace waterfall. Intensity 1-10 maps to 2s-20s timeout.',
  async inject(params) {
    const id = nextChaosId();
    const intensity = params.intensity ?? 5;
    const timeoutMs = intensity * 2000; // 1-10 → 2000-20000ms
    const targetService = params.target && params.target !== 'default' ? params.target : undefined;
    log.info(`👹 Injecting dependency timeout: ${timeoutMs}ms`, { id, targetService: targetService || 'all' });

    const apiBody: Record<string, unknown> = {
      flags: { dependency_timeout_ms: timeoutMs },
      triggeredBy: 'nemesis-agent'
    };
    if (targetService) apiBody.targetService = targetService;
    await callFeatureFlagAPI('POST', '/api/feature_flag', apiBody);

    return {
      chaosId: id, type: 'dependency_timeout', target: targetService || 'all',
      injectedAt: new Date().toISOString(),
      revertInfo: { timeoutMs, targetService },
      status: 'active',
    };
  },
  async revert(ctx) {
    const targetService = ctx.revertInfo.targetService as string | undefined;
    const apiBody: Record<string, unknown> = {
      flags: { dependency_timeout_ms: 0 },
      triggeredBy: 'nemesis-agent'
    };
    if (targetService) apiBody.targetService = targetService;
    await callFeatureFlagAPI('POST', '/api/feature_flag', apiBody);
    log.info(`Reverted dependency timeout`, { chaosId: ctx.chaosId });
  },
};

const jitterRecipe: ChaosRecipe = {
  type: 'jitter',
  name: 'Intermittent Jitter',
  description: 'A percentage of requests get hit with a random 2-10 second delay, creating the classic "long tail latency" pattern. p50 stays normal but p95/p99 spike. Intensity 1-10 maps to 10%-100% of requests affected.',
  async inject(params) {
    const id = nextChaosId();
    const intensity = params.intensity ?? 3;
    const pct = Math.min(intensity * 10, 100); // 1-10 → 10%-100%
    const targetService = params.target && params.target !== 'default' ? params.target : undefined;
    log.info(`👹 Injecting jitter: ${pct}% of requests get 2-10s spike`, { id, targetService: targetService || 'all' });

    const apiBody: Record<string, unknown> = {
      flags: { jitter_percentage: pct },
      triggeredBy: 'nemesis-agent'
    };
    if (targetService) apiBody.targetService = targetService;
    await callFeatureFlagAPI('POST', '/api/feature_flag', apiBody);

    return {
      chaosId: id, type: 'jitter', target: targetService || 'all',
      injectedAt: new Date().toISOString(),
      revertInfo: { pct, targetService },
      status: 'active',
    };
  },
  async revert(ctx) {
    const targetService = ctx.revertInfo.targetService as string | undefined;
    const apiBody: Record<string, unknown> = {
      flags: { jitter_percentage: 0 },
      triggeredBy: 'nemesis-agent'
    };
    if (targetService) apiBody.targetService = targetService;
    await callFeatureFlagAPI('POST', '/api/feature_flag', apiBody);
    log.info(`Reverted jitter`, { chaosId: ctx.chaosId });
  },
};

const targetCompanyRecipe: ChaosRecipe = {
  type: 'target_company',
  name: 'Target Company Error Injection',
  description: 'Enables high error injection for a specific service within a company. Target = service name, intensity = error rate. Only the targeted service is affected.',
  async inject(params) {
    const id = nextChaosId();
    const targetService = params.target;
    const intensity = params.intensity ?? 7;
    const newRate = Math.min(intensity / 10, 1.0);
    const company = (params.details?.companyName as string) || targetService;
    log.info(`👹 Targeting service ${targetService} with error rate ${newRate}`, { id });

    // Set per-service override for the targeted service only
    await callFeatureFlagAPI('POST', '/api/feature_flag', {
      flags: { errors_per_transaction: newRate },
      targetService: targetService,
      companyName: company,
      triggeredBy: 'nemesis-agent'
    });
    await callRemediationAPI('errorInjectionEnabled', true, `Nemesis: targeting ${targetService} at ${newRate}`, targetService);

    return {
      chaosId: id, type: 'target_company', target: targetService,
      injectedAt: new Date().toISOString(),
      revertInfo: { targetService, company },
      status: 'active',
    };
  },
  async revert(ctx) {
    const targetService = String(ctx.revertInfo.targetService || ctx.target);
    // Remove per-service override
    await callFeatureFlagAPI('DELETE', `/api/feature_flag/service/${encodeURIComponent(targetService)}`);
    log.info(`Reverted service targeting: ${targetService}`, { chaosId: ctx.chaosId });
  },
};

const customFlagRecipe: ChaosRecipe = {
  type: 'custom_flag',
  name: 'Custom Feature Flag',
  description: 'Set any feature flag to a custom value. Target = flag name, details.value = new value.',
  async inject(params) {
    const id = nextChaosId();
    const flagName = params.target;
    const newValue = params.details?.value;
    log.info(`👹 Custom flag: ${flagName} → ${newValue}`, { id });

    // Try remediation API first (System A — sends DT events)
    const targetService = params.details?.targetService as string | undefined;
    const before = await callRemediationAPI(flagName, newValue, `Nemesis: ${flagName} → ${newValue}`, targetService);
    if ((before as any).ok) {
      return {
        chaosId: id, type: 'custom_flag', target: flagName,
        injectedAt: new Date().toISOString(),
        revertInfo: { previousValue: (before as any).previousValue, system: 'remediation', targetService },
        status: 'active',
      };
    }

    // Fall back to feature flag API (System B)
    const current = await callFeatureFlagAPI('GET', '/api/feature_flag');
    const prevValue = ((current as any).flags || {})[flagName];
    await callFeatureFlagAPI('POST', '/api/feature_flag', { flags: { [flagName]: newValue } });
    return {
      chaosId: id, type: 'custom_flag', target: flagName,
      injectedAt: new Date().toISOString(),
      revertInfo: { previousValue: prevValue, system: 'feature_flag' },
      status: 'active',
    };
  },
  async revert(ctx) {
    if (ctx.revertInfo.system === 'remediation') {
      const targetService = ctx.revertInfo.targetService as string | undefined;
      await callRemediationAPI(ctx.target, ctx.revertInfo.previousValue, `Nemesis revert: ${ctx.target}`, targetService);
    } else {
      await callFeatureFlagAPI('POST', '/api/feature_flag', { flags: { [ctx.target]: ctx.revertInfo.previousValue } });
    }
    log.info(`Reverted custom flag: ${ctx.target}`, { chaosId: ctx.chaosId });
  },
};

// ─── Registry ─────────────────────────────────────────────────

export const chaosRecipes: Record<ChaosType, ChaosRecipe> = {
  enable_errors: enableErrorsRecipe,
  increase_error_rate: increaseErrorRateRecipe,
  slow_responses: slowResponsesRecipe,
  cascading_latency: cascadingLatencyRecipe,
  dependency_timeout: dependencyTimeoutRecipe,
  jitter: jitterRecipe,
  target_company: targetCompanyRecipe,
  custom_flag: customFlagRecipe,
};

export function getRecipeList(): { type: ChaosType; name: string; description: string }[] {
  return Object.values(chaosRecipes).map(r => ({
    type: r.type, name: r.name, description: r.description,
  }));
}

export default chaosRecipes;
