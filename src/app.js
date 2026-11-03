/**
 * CloudPulse — Lambda Function URL health-check handler.
 * Read-only public demo: no secrets, no mutations, no privileged ops.
 */

const SERVICE_NAME = "CloudPulse";

/**
 * Build a standard JSON response for Function URL (payload format 2.0).
 * @param {number} statusCode
 * @param {Record<string, unknown>} body
 */
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

/**
 * Normalize the request path from a Function URL event.
 * @param {Record<string, unknown>} event
 * @returns {string}
 */
function getPath(event) {
  const rawPath = typeof event.rawPath === "string" ? event.rawPath : "/";
  if (rawPath.length > 1 && rawPath.endsWith("/")) {
    return rawPath.slice(0, -1);
  }
  return rawPath || "/";
}

/**
 * Emit a single structured log line (CloudWatch). No secrets or PII.
 * @param {string} level
 * @param {string} message
 * @param {Record<string, unknown>} [fields]
 */
function log(level, message, fields = {}) {
  console.log(
    JSON.stringify({
      level,
      message,
      service: SERVICE_NAME,
      ...fields,
    }),
  );
}

/**
 * AWS Lambda handler for Function URL invocations.
 * @param {Record<string, unknown>} event
 */
export async function handler(event) {
  const method =
    event.requestContext?.http?.method ??
    event.httpMethod ??
    "GET";
  const path = getPath(event);
  const deploymentVersion = process.env.DEPLOYMENT_VERSION || "dev";

  log("info", "request_received", {
    method,
    path,
    deploymentVersion,
  });

  if (method === "GET" && path === "/health") {
    const payload = {
      service: SERVICE_NAME,
      status: "healthy",
      environment: "production",
      version: deploymentVersion,
      timestamp: new Date().toISOString(),
    };

    log("info", "health_ok", { statusCode: 200 });
    return jsonResponse(200, payload);
  }

  log("warn", "route_not_found", { method, path, statusCode: 404 });
  return jsonResponse(404, {
    service: SERVICE_NAME,
    error: "not_found",
    message: `No route for ${method} ${path}`,
  });
}
