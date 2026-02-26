/**
 * Business Flow Generator Route
 * 
 * Generates Dynatrace Business Flow JSON from journey step data.
 * Called by the AppEngine proxy-api to create Business Flows dynamically
 * based on the companies/journeys running in BizObs Generator.
 * 
 * POST /api/business-flow/generate
 *   Body: { companyName, journeyType, steps: [{stepName|name, hasError?}] }
 *   Returns: { ok: true, businessFlow: <Dynatrace Biz Flow settings object> }
 */

import { Router } from 'express';
import crypto from 'crypto';

const router = Router();

/**
 * Build a Dynatrace Business Flow settings value object.
 * Matches the schema: app:dynatrace.biz.flow:biz-flow-settings
 * Format verified against live tenant objects.
 */
function buildBusinessFlow(companyName, journeyType, steps) {
  const flowName = `${companyName} - ${journeyType}`;

  // Generate deterministic UUIDs for step IDs so re-deploys produce
  // the same IDs (allows Settings SDK to update rather than duplicate).
  const stepNodes = steps.map((s, i) => {
    const name = s.stepName || s.name || `Step${i + 1}`;
    const hash = crypto.createHash('md5').update(`${flowName}:${name}`).digest('hex');
    const id = [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join('-');

    return {
      name,
      id,
      events: [
        {
          id: `provider:${companyName}-event:${name}`,
          name,
          provider: companyName,
          isError: false,
          isDisabled: false,
        },
        {
          id: `provider:${companyName}-event:${name} - Exception`,
          name: `${name} - Exception`,
          provider: companyName,
          isError: true,
          isDisabled: false,
        },
      ],
    };
  });

  // Build linear connections between consecutive steps
  const connections = [];
  for (let i = 0; i < stepNodes.length - 1; i++) {
    connections.push({
      id: `${stepNodes[i].id}__${stepNodes[i + 1].id}`,
      source: stepNodes[i].id,
      target: stepNodes[i + 1].id,
    });
  }

  // KPI event = last step (the fulfilment/completion step)
  const lastStep = stepNodes[stepNodes.length - 1];

  return {
    name: flowName,
    version: 1,
    steps: stepNodes,
    connections,
    correlationID: 'json.correlationId',
    kpiLabel: 'Revenue',
    kpi: 'additionalfields.orderTotal',
    kpiEvent: {
      name: lastStep.name,
      provider: companyName,
    },
    kpiUnit: '$',
    kpiCalculation: 'sum',
    analysisType: 'fulfillment',
    analysisCustomLabel: 'Unique flows fulfilled',
    isSmartscapeTopologyEnabled: false,
    isDefaultQueryLimitIgnored: false,
  };
}

// POST /api/business-flow/generate
router.post('/generate', (req, res) => {
  try {
    const { companyName, journeyType, steps } = req.body;

    if (!companyName || !journeyType) {
      return res.status(400).json({ ok: false, error: 'companyName and journeyType are required' });
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ ok: false, error: 'steps array is required and must not be empty' });
    }

    const businessFlow = buildBusinessFlow(companyName, journeyType, steps);

    console.log(`[Business Flow] Generated "${businessFlow.name}" with ${businessFlow.steps.length} steps`);

    return res.json({ ok: true, businessFlow });
  } catch (err) {
    console.error('[Business Flow] Generation error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
