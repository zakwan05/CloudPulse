import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handler } from "../src/app.js";

/**
 * Minimal Function URL (payload format 2.0) event shape.
 * @param {string} method
 * @param {string} rawPath
 */
function functionUrlEvent(method, rawPath) {
  return {
    version: "2.0",
    rawPath,
    requestContext: {
      http: {
        method,
        path: rawPath,
      },
    },
  };
}

describe("CloudPulse handler", () => {
  const originalVersion = process.env.DEPLOYMENT_VERSION;

  beforeEach(() => {
    delete process.env.DEPLOYMENT_VERSION;
  });

  afterEach(() => {
    if (originalVersion === undefined) {
      delete process.env.DEPLOYMENT_VERSION;
    } else {
      process.env.DEPLOYMENT_VERSION = originalVersion;
    }
  });

  it("GET /health returns 200 with required fields and default version", async () => {
    const response = await handler(functionUrlEvent("GET", "/health"));
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "application/json");
    assert.equal(body.service, "CloudPulse");
    assert.equal(body.status, "healthy");
    assert.equal(body.environment, "production");
    assert.equal(body.version, "dev");
    assert.ok(
      Number.isFinite(Date.parse(body.timestamp)),
      "timestamp must be a valid ISO date",
    );
  });

  it("GET /health uses DEPLOYMENT_VERSION when set", async () => {
    process.env.DEPLOYMENT_VERSION = "1.0.0";
    const response = await handler(functionUrlEvent("GET", "/health"));
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.version, "1.0.0");
  });

  it("GET /health/ (trailing slash) is treated as /health", async () => {
    const response = await handler(functionUrlEvent("GET", "/health/"));
    assert.equal(response.statusCode, 200);
  });

  it("unknown path returns 404 JSON", async () => {
    const response = await handler(functionUrlEvent("GET", "/unknown"));
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 404);
    assert.equal(body.service, "CloudPulse");
    assert.equal(body.error, "not_found");
    assert.match(body.message, /GET \/unknown/);
  });

  it("non-GET method on /health returns 404", async () => {
    const response = await handler(functionUrlEvent("POST", "/health"));
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 404);
    assert.equal(body.error, "not_found");
  });
});
