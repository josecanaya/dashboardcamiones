import { describe, it, expect } from "vitest";
import {
  applyPlaceholders,
  buildReplaceAllTextRequests,
  toPlaceholderToken,
} from "../src/lib/placeholders.js";

describe("toPlaceholderToken", () => {
  it("envuelve claves sin llaves", () => {
    expect(toPlaceholderToken("FECHA")).toBe("{{FECHA}}");
  });
  it("respeta claves ya con llaves", () => {
    expect(toPlaceholderToken("{{PLANTA}}")).toBe("{{PLANTA}}");
  });
  it("recorta espacios", () => {
    expect(toPlaceholderToken("  TOTAL  ")).toBe("{{TOTAL}}");
  });
});

describe("applyPlaceholders", () => {
  it("reemplaza múltiples placeholders", () => {
    const out = applyPlaceholders("Planta {{PLANTA}} el {{FECHA}}", {
      PLANTA: "Ricardone",
      FECHA: "2026-08-20",
    });
    expect(out).toBe("Planta Ricardone el 2026-08-20");
  });

  it("reemplaza todas las ocurrencias", () => {
    const out = applyPlaceholders("{{X}}-{{X}}-{{X}}", { X: "1" });
    expect(out).toBe("1-1-1");
  });

  it("acepta claves ya con llaves", () => {
    const out = applyPlaceholders("Total: {{TOTAL_CAMIONES}}", { "{{TOTAL_CAMIONES}}": "128" });
    expect(out).toBe("Total: 128");
  });

  it("valor vacío borra el placeholder", () => {
    expect(applyPlaceholders("a{{X}}b", { X: "" })).toBe("ab");
  });

  it("no toca texto sin placeholders", () => {
    expect(applyPlaceholders("sin cambios", { X: "1" })).toBe("sin cambios");
  });
});

describe("buildReplaceAllTextRequests", () => {
  it("genera un replaceAllText por clave con matchCase default true", () => {
    const reqs = buildReplaceAllTextRequests({ FECHA: "2026-08-20", PLANTA: "Ricardone" });
    expect(reqs).toHaveLength(2);
    expect(reqs[0].replaceAllText?.containsText?.text).toBe("{{FECHA}}");
    expect(reqs[0].replaceAllText?.containsText?.matchCase).toBe(true);
    expect(reqs[0].replaceAllText?.replaceText).toBe("2026-08-20");
  });

  it("incluye pageObjectIds cuando se pasan", () => {
    const reqs = buildReplaceAllTextRequests(
      { X: "1" },
      { pageObjectIds: ["slide_1", "slide_2"] },
    );
    expect(reqs[0].replaceAllText?.pageObjectIds).toEqual(["slide_1", "slide_2"]);
  });

  it("omite pageObjectIds si el array está vacío", () => {
    const reqs = buildReplaceAllTextRequests({ X: "1" }, { pageObjectIds: [] });
    expect(reqs[0].replaceAllText?.pageObjectIds).toBeUndefined();
  });

  it("respeta matchCase=false", () => {
    const reqs = buildReplaceAllTextRequests({ X: "1" }, { matchCase: false });
    expect(reqs[0].replaceAllText?.containsText?.matchCase).toBe(false);
  });
});
