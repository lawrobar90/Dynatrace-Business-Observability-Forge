/**
 * Enhanced Dynatrace Error Handling and Trace Failure Reporting
 * Ensures exceptions are properly captured and propagated in traces
 * Uses @dynatrace/oneagent-sdk when available for real trace integration
 * Uses @opentelemetry/api to record exceptions on spans (span.events[].exception.*)
 */

// Load OpenTelemetry API for span exception recording
// OneAgent provides an OTel API bridge so span.recordException() creates real span events
let otelTrace = null;
let otelSpanStatusCode = null;
try {
  const otelApi = require('@opentelemetry/api');
  otelTrace = otelApi.trace;
  otelSpanStatusCode = otelApi.SpanStatusCode;
  console.log('[dynatrace-otel] OpenTelemetry API loaded — span.recordException() available');
} catch (e) {
  console.log('[dynatrace-otel] OpenTelemetry API not available:', e.message);
}

// Try to load the real Dynatrace OneAgent SDK
let dtSdk = null;
let dtApi = null;
try {
  dtSdk = require('@dynatrace/oneagent-sdk');
  dtApi = dtSdk.createInstance();
  console.log('[dynatrace-sdk] OneAgent SDK loaded successfully, state:', dtApi.getCurrentState());
} catch (e) {
  console.log('[dynatrace-sdk] OneAgent SDK not available, using fallback logging:', e.message);
}

// Dynatrace API helpers for error reporting — uses real SDK when available
const addCustomAttributes = (attributes) => {
  if (dtApi && typeof dtApi.addCustomRequestAttribute === 'function') {
    // Use real OneAgent SDK to attach attributes to the current PurePath trace
    for (const [key, value] of Object.entries(attributes)) {
      try {
        dtApi.addCustomRequestAttribute(key, String(value));
      } catch (e) {
        // Silently skip if attribute can't be added
      }
    }
  }
  console.log('[dynatrace] Custom attributes:', JSON.stringify(attributes));
};

const reportError = (error, context = {}) => {
  // 🔑 Record exception on the active OTel span so Dynatrace captures span.events[].exception.*
  // This is what makes exceptions queryable via: span.events[][exception.stack_trace], exception.type, etc.
  if (otelTrace) {
    try {
      const activeSpan = otelTrace.getActiveSpan();
      if (activeSpan) {
        // recordException() creates a span event with:
        //   span_event.name = "exception"
        //   exception.type = error.name
        //   exception.message = error.message
        //   exception.stack_trace = error.stack
        activeSpan.recordException(error);
        // Set span status to ERROR so it shows as failed in Dynatrace
        activeSpan.setStatus({
          code: otelSpanStatusCode.ERROR,
          message: error.message || 'Unknown error'
        });
        // Add context as span attributes for richer exception details
        for (const [key, value] of Object.entries(context)) {
          activeSpan.setAttribute(key, String(value));
        }
        console.log(`[dynatrace-otel] Recorded exception on active span: ${error.name || 'Error'}: ${error.message}`);
      } else {
        console.log('[dynatrace-otel] No active span to record exception on');
      }
    } catch (e) {
      console.log('[dynatrace-otel] Failed to record exception on span:', e.message);
    }
  }

  // Attach exception details to the PurePath via OneAgent SDK (custom attributes)
  if (dtApi && typeof dtApi.addCustomRequestAttribute === 'function') {
    try {
      dtApi.addCustomRequestAttribute('error.message', error.message || 'Unknown error');
      dtApi.addCustomRequestAttribute('error.type', error.name || error.constructor?.name || 'Error');
      dtApi.addCustomRequestAttribute('error.stack', (error.stack || '').substring(0, 500));
      for (const [key, value] of Object.entries(context)) {
        dtApi.addCustomRequestAttribute(key, String(value));
      }
    } catch (e) {
      // Silently skip
    }
  }
  console.error(`[dynatrace-error] ${error.name || 'Error'}: ${error.message}`, JSON.stringify(context));
};

const markSpanAsFailed = (error, context = {}) => {
  // 🔑 Mark the active OTel span as failed + record exception event
  if (otelTrace) {
    try {
      const activeSpan = otelTrace.getActiveSpan();
      if (activeSpan) {
        // Ensure exception event exists on this span
        activeSpan.recordException(error);
        activeSpan.setStatus({
          code: otelSpanStatusCode.ERROR,
          message: error.message || 'Unknown'
        });
        // Set the exit-by-exception marker that Dynatrace uses for span.exit_by_exception_id
        activeSpan.setAttribute('otel.status_code', 'ERROR');
        activeSpan.setAttribute('exception.escaped', 'true');
      }
    } catch (e) {
      // Silently skip
    }
  }

  // Attach failure markers to the PurePath via OneAgent SDK
  if (dtApi && typeof dtApi.addCustomRequestAttribute === 'function') {
    try {
      dtApi.addCustomRequestAttribute('span.failed', 'true');
      dtApi.addCustomRequestAttribute('failure.message', error.message || 'Unknown');
      dtApi.addCustomRequestAttribute('failure.category', context['error.category'] || 'unknown');
    } catch (e) {
      // Silently skip
    }
  }
  console.error(`[dynatrace-span-failed] ${error.message}`, JSON.stringify(context));
};

const sendErrorEvent = (eventType, error, context = {}) => {
  console.log('[dynatrace] Error business event:', eventType, {
    error: error.message || error,
    errorType: error.constructor.name || 'Error',
    timestamp: new Date().toISOString(),
    ...context
  });
  // In real Dynatrace environment, this would send a business event
};

/**
 * Send a CUSTOM_INFO event to Dynatrace via Events API v2 when a feature flag fires.
 * Also enriches the current OneAgent PurePath trace with custom request attributes.
 * @param {Object} details - { serviceName, stepName, featureFlag, errorType, httpStatus, correlationId, errorRate, domain, industryType, companyName }
 */
const sendFeatureFlagCustomEvent = async (details = {}) => {
  const {
    serviceName = 'unknown',
    stepName = 'unknown',
    featureFlag = 'unknown',
    errorType = 'unknown',
    httpStatus = 500,
    correlationId = '',
    errorRate = 0,
    domain = '',
    industryType = '',
    companyName = ''
  } = details;

  // 1) Enrich the current PurePath trace via OneAgent SDK
  if (dtApi && typeof dtApi.addCustomRequestAttribute === 'function') {
    try {
      dtApi.addCustomRequestAttribute('feature_flag.name', featureFlag);
      dtApi.addCustomRequestAttribute('feature_flag.active', 'true');
      dtApi.addCustomRequestAttribute('feature_flag.error_type', errorType);
      dtApi.addCustomRequestAttribute('feature_flag.error_rate', String(errorRate));
      dtApi.addCustomRequestAttribute('feature_flag.service', serviceName);
      dtApi.addCustomRequestAttribute('feature_flag.step', stepName);
    } catch (e) {
      // Silently skip
    }
  }

  // 2) Send CUSTOM_INFO event to Dynatrace Events API v2
  const DT_ENVIRONMENT = process.env.DT_ENVIRONMENT || process.env.DYNATRACE_URL;
  const DT_TOKEN = process.env.DT_PLATFORM_TOKEN || process.env.DYNATRACE_TOKEN;

  if (!DT_ENVIRONMENT || !DT_TOKEN) {
    console.log('[dynatrace-sdk] No DT credentials, skipping feature flag custom event');
    return { success: false, reason: 'no_credentials' };
  }

  const eventPayload = {
    eventType: 'CUSTOM_INFO',
    title: `Feature Flag Triggered: ${featureFlag}`,
    timeout: 15,
    properties: {
      'feature_flag.name': featureFlag,
      'feature_flag.error_type': errorType,
      'feature_flag.error_rate': String(errorRate),
      'feature_flag.http_status': String(httpStatus),
      'service.name': serviceName,
      'journey.step': stepName,
      'journey.correlationId': correlationId,
      'journey.domain': domain,
      'journey.industryType': industryType,
      'journey.company': companyName,
      'triggered.by': 'gremlin-agent',
      'event.source': 'bizobs-feature-flag',
      'dt.event.description': `Feature flag "${featureFlag}" injected ${errorType} error (HTTP ${httpStatus}) on ${serviceName} / ${stepName}`
    }
  };

  try {
    const response = await fetch(`${DT_ENVIRONMENT}/api/v2/events/ingest`, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Token ${DT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventPayload)
    });
    const result = await response.text();
    console.log(`[dynatrace-sdk] Feature flag custom event sent: ${response.status}`, result);
    return { success: response.ok, status: response.status };
  } catch (err) {
    console.error('[dynatrace-sdk] Failed to send feature flag custom event:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Enhanced error wrapper that captures errors for Dynatrace tracing
 */
class TracedError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'TracedError';
    this.context = context;
    this.timestamp = new Date().toISOString();
    
    // Immediately report to Dynatrace
    markSpanAsFailed(this, context);
    reportError(this, context);
  }
}

/**
 * Async function wrapper that catches errors and reports them to Dynatrace
 */
const withErrorTracking = (serviceName, operation) => {
  return async (...args) => {
    try {
      const result = await operation(...args);
      return result;
    } catch (error) {
      const context = {
        'service.name': serviceName,
        'operation': operation.name || 'unknown',
        'error.caught': true
      };
      
      // Mark trace as failed
      markSpanAsFailed(error, context);
      reportError(error, context);
      
      // Send error business event
      sendErrorEvent('service_operation_failed', error, {
        serviceName,
        operation: operation.name || 'unknown'
      });
      
      // Re-throw to maintain error flow
      throw new TracedError(error.message, context);
    }
  };
};

/**
 * Express middleware for error handling with Dynatrace integration
 */
const errorHandlingMiddleware = (serviceName) => {
  return (error, req, res, next) => {
    const context = {
      'service.name': serviceName,
      'request.path': req.path,
      'request.method': req.method,
      'correlation.id': req.correlationId,
      'journey.step': req.body?.stepName || 'unknown'
    };
    
    // Report error to Dynatrace
    markSpanAsFailed(error, context);
    reportError(error, context);
    
    // Send error business event
    sendErrorEvent('http_request_failed', error, {
      serviceName,
      path: req.path,
      method: req.method,
      correlationId: req.correlationId,
      stepName: req.body?.stepName
    });
    
    // Add error headers for trace propagation
    res.setHeader('x-trace-error', 'true');
    res.setHeader('x-error-type', error.constructor.name);
    res.setHeader('x-error-message', error.message);
    
    // Return standardized error response
    const errorResponse = {
      status: 'error',
      error: error.message,
      errorType: error.constructor.name,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
      service: serviceName,
      traceError: true
    };
    
    res.status(error.status || 500).json(errorResponse);
  };
};

/**
 * Simulate random errors based on error profiles for testing
 */
const simulateRandomError = (errorProfile, stepName, context = {}) => {
  if (!errorProfile || Math.random() >= errorProfile.errorRate) {
    return null; // No error
  }
  
  const errorType = errorProfile.errorTypes[Math.floor(Math.random() * errorProfile.errorTypes.length)];
  const httpStatus = errorProfile.httpErrors[Math.floor(Math.random() * errorProfile.httpErrors.length)];
  
  const error = new TracedError(`Simulated ${errorType} in ${stepName}`, {
    'error.simulated': true,
    'error.type': errorType,
    'http.status': httpStatus,
    'journey.step': stepName,
    ...context
  });
  
  error.status = httpStatus;
  error.errorType = errorType;
  
  return error;
};

/**
 * Check if a step should fail based on hasError flag or error simulation
 */
const checkForStepError = (payload, errorProfile) => {
  // Check explicit error flag first
  if (payload.hasError === true) {
    const error = new TracedError(
      payload.errorMessage || `Step ${payload.stepName} marked as failed`,
      {
        'error.explicit': true,
        'journey.step': payload.stepName,
        'service.name': payload.serviceName
      }
    );
    error.status = payload.httpStatus || 500;
    return error;
  }
  
  // Check for simulated errors
  if (errorProfile) {
    return simulateRandomError(errorProfile, payload.stepName, {
      'journey.step': payload.stepName,
      'service.name': payload.serviceName
    });
  }
  
  return null;
};

module.exports = {
  TracedError,
  withErrorTracking,
  errorHandlingMiddleware,
  simulateRandomError,
  checkForStepError,
  markSpanAsFailed,
  reportError,
  sendErrorEvent,
  sendFeatureFlagCustomEvent,
  addCustomAttributes
};