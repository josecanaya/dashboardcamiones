import { describe, it, expect } from "vitest";
import { normalizeError, AppError, toToolError } from "../src/lib/errors.js";

function gErr(status: number, message = "boom") {
  return { response: { status, data: { error: { message } } } };
}

describe("normalizeError", () => {
  it("400 -> INVALID_ARGUMENT", () => {
    expect(normalizeError(gErr(400)).code).toBe("INVALID_ARGUMENT");
  });
  it("401 -> AUTH_INVALID (credenciales vencidas)", () => {
    expect(normalizeError(gErr(401)).code).toBe("AUTH_INVALID");
  });
  it("403 -> PERMISSION_DENIED", () => {
    const e = normalizeError(gErr(403, "The caller does not have permission"));
    expect(e.code).toBe("PERMISSION_DENIED");
    expect(e.message).toContain("permission");
  });
  it("404 -> NOT_FOUND", () => {
    expect(normalizeError(gErr(404)).code).toBe("NOT_FOUND");
  });
  it("429 -> RATE_LIMITED y retryable", () => {
    const e = normalizeError(gErr(429));
    expect(e.code).toBe("RATE_LIMITED");
    expect(e.retryable).toBe(true);
  });
  it("500/503 -> UPSTREAM_ERROR y retryable", () => {
    expect(normalizeError(gErr(500)).retryable).toBe(true);
    expect(normalizeError(gErr(503)).code).toBe("UPSTREAM_ERROR");
  });
  it("ETIMEDOUT -> TIMEOUT retryable", () => {
    const e = normalizeError({ code: "ETIMEDOUT" });
    expect(e.code).toBe("TIMEOUT");
    expect(e.retryable).toBe(true);
  });
  it("ECONNREFUSED -> UPSTREAM_ERROR retryable", () => {
    expect(normalizeError({ code: "ECONNREFUSED" }).code).toBe("UPSTREAM_ERROR");
  });
  it("pasa AppError sin cambios", () => {
    const orig = new AppError("CONFIG_ERROR", "x");
    expect(normalizeError(orig)).toBe(orig);
  });
  it("desconocido -> UNKNOWN", () => {
    expect(normalizeError({}).code).toBe("UNKNOWN");
  });
});

describe("toToolError", () => {
  it("serializa a { code, message } seguro", () => {
    const out = toToolError(gErr(404, "no existe"));
    expect(out).toEqual({ code: "NOT_FOUND", message: "no existe" });
  });
});
