import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { loadKey, seal, open } from "../src/auth/crypto.js";
import { AppError } from "../src/lib/errors.js";

const hexKey = randomBytes(32).toString("hex");

describe("loadKey", () => {
  it("acepta hex de 64 chars", () => {
    expect(loadKey(hexKey).length).toBe(32);
  });
  it("acepta base64 de 32 bytes", () => {
    const b64 = randomBytes(32).toString("base64");
    expect(loadKey(b64).length).toBe(32);
  });
  it("rechaza clave vacía", () => {
    expect(() => loadKey("")).toThrow(AppError);
  });
  it("rechaza longitud incorrecta", () => {
    expect(() => loadKey("abcd")).toThrow(AppError);
  });
});

describe("seal/open roundtrip", () => {
  it("cifra y descifra un objeto", () => {
    const key = loadKey(hexKey);
    const payload = { refresh_token: "secreto-123", scope: "a b c" };
    const sealed = seal(key, payload);
    expect(sealed.v).toBe(1);
    expect(sealed.data).not.toContain("secreto");
    const opened = open<typeof payload>(key, sealed);
    expect(opened).toEqual(payload);
  });

  it("falla al descifrar con otra clave (auth tag)", () => {
    const key1 = loadKey(hexKey);
    const key2 = loadKey(randomBytes(32).toString("hex"));
    const sealed = seal(key1, { a: 1 });
    expect(() => open(key2, sealed)).toThrow();
  });

  it("rechaza payload con versión desconocida", () => {
    const key = loadKey(hexKey);
    // @ts-expect-error prueba de runtime
    expect(() => open(key, { v: 2, iv: "x", tag: "y", data: "z" })).toThrow(AppError);
  });
});
