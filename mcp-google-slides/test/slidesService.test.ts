import { describe, it, expect, vi } from "vitest";
import type { slides_v1 } from "googleapis";
import { SlidesService, ALLOWED_BATCH_REQUESTS } from "../src/google/slidesService.js";
import type { AppConfig } from "../src/config.js";

const cfg = { GOOGLE_MAX_RETRIES: 0, GOOGLE_HTTP_TIMEOUT_MS: 1000 } as AppConfig;

function fakeSlides(overrides: Partial<{ batchUpdate: unknown; get: unknown; create: unknown }> = {}) {
  const batchUpdate =
    overrides.batchUpdate ?? vi.fn().mockResolvedValue({ data: { replies: [] } });
  const get = overrides.get ?? vi.fn();
  const create = overrides.create ?? vi.fn();
  const slides = {
    presentations: { batchUpdate, get, create },
  } as unknown as slides_v1.Slides;
  return { slides, batchUpdate, get, create };
}

describe("SlidesService.batchUpdate (validación / allowlist)", () => {
  it("rechaza array vacío", async () => {
    const { slides } = fakeSlides();
    const svc = new SlidesService(slides, cfg);
    await expect(svc.batchUpdate("P", [])).rejects.toThrow();
  });

  it("rechaza request con más de una operación", async () => {
    const { slides } = fakeSlides();
    const svc = new SlidesService(slides, cfg);
    await expect(
      svc.batchUpdate("P", [{ insertText: {}, deleteText: {} } as never]),
    ).rejects.toThrow(/exactamente una/);
  });

  it("rechaza operación fuera de la allowlist", async () => {
    const { slides } = fakeSlides();
    const svc = new SlidesService(slides, cfg);
    await expect(
      svc.batchUpdate("P", [{ hackTheThing: {} } as never]),
    ).rejects.toThrow(/no permitida/);
  });

  it("acepta operación válida y llama a Google", async () => {
    const { slides, batchUpdate } = fakeSlides();
    const svc = new SlidesService(slides, cfg);
    await svc.batchUpdate("P", [{ createSlide: {} }]);
    expect(batchUpdate).toHaveBeenCalledTimes(1);
  });

  it("la allowlist contiene operaciones núcleo", () => {
    for (const op of ["createSlide", "insertText", "replaceAllText", "deleteObject", "createTable"]) {
      expect(ALLOWED_BATCH_REQUESTS.has(op)).toBe(true);
    }
  });
});

describe("SlidesService.replaceText", () => {
  it("construye replaceAllText y suma occurrencesChanged", async () => {
    const batchUpdate = vi.fn().mockResolvedValue({
      data: { replies: [{ replaceAllText: { occurrencesChanged: 3 } }] },
    });
    const { slides } = fakeSlides({ batchUpdate });
    const svc = new SlidesService(slides, cfg);
    const res = await svc.replaceText("P", { FECHA: "2026-08-20" });
    const arg = batchUpdate.mock.calls[0][0];
    expect(arg.requestBody.requests[0].replaceAllText.containsText.text).toBe("{{FECHA}}");
    expect(res.replies?.[0].replaceAllText?.occurrencesChanged).toBe(3);
  });

  it("rechaza reemplazos vacíos", async () => {
    const { slides } = fakeSlides();
    const svc = new SlidesService(slides, cfg);
    await expect(svc.replaceText("P", {})).rejects.toThrow();
  });
});

describe("SlidesService.updateTextElement (preserva formato)", () => {
  it("inserta texto nuevo y borra el viejo por rango", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        slides: [
          {
            objectId: "s1",
            pageElements: [
              { objectId: "tb1", shape: { text: { textElements: [{ textRun: { content: "viejo" } }] } } },
            ],
          },
        ],
      },
    });
    const batchUpdate = vi.fn().mockResolvedValue({ data: { replies: [] } });
    const { slides } = fakeSlides({ get, batchUpdate });
    const svc = new SlidesService(slides, cfg);
    await svc.updateTextElement("P", "tb1", "nuevo texto");
    const reqs = batchUpdate.mock.calls[0][0].requestBody.requests;
    expect(reqs[0].insertText.text).toBe("nuevo texto");
    expect(reqs[0].insertText.insertionIndex).toBe(0);
    // "viejo" = 5 chars, desplazado detrás de "nuevo texto" (11 chars)
    expect(reqs[1].deleteText.textRange).toMatchObject({
      type: "FIXED_RANGE",
      startIndex: 11,
      endIndex: 16,
    });
  });

  it("lanza NOT_FOUND si el objectId no existe", async () => {
    const get = vi.fn().mockResolvedValue({ data: { slides: [{ pageElements: [] }] } });
    const { slides } = fakeSlides({ get });
    const svc = new SlidesService(slides, cfg);
    await expect(svc.updateTextElement("P", "nope", "x")).rejects.toThrow(/No se encontró/);
  });
});

describe("SlidesService.addTable", () => {
  it("crea tabla y puebla celdas dentro de rango", async () => {
    const batchUpdate = vi.fn().mockResolvedValue({ data: { replies: [] } });
    const { slides } = fakeSlides({ batchUpdate });
    const svc = new SlidesService(slides, cfg);
    await svc.addTable("P", {
      pageObjectId: "s1",
      rows: 2,
      columns: 2,
      values: [
        ["a", "b"],
        ["c", "d"],
      ],
    });
    const reqs = batchUpdate.mock.calls[0][0].requestBody.requests;
    expect(reqs[0].createTable.rows).toBe(2);
    // 1 createTable + 4 insertText
    expect(reqs.filter((r: Record<string, unknown>) => "insertText" in r)).toHaveLength(4);
  });

  it("rechaza dimensiones inválidas", async () => {
    const { slides } = fakeSlides();
    const svc = new SlidesService(slides, cfg);
    await expect(
      svc.addTable("P", { pageObjectId: "s1", rows: 0, columns: 2 }),
    ).rejects.toThrow();
  });
});

describe("SlidesService.deleteSlide", () => {
  it("emite deleteObject", async () => {
    const batchUpdate = vi.fn().mockResolvedValue({ data: { replies: [] } });
    const { slides } = fakeSlides({ batchUpdate });
    const svc = new SlidesService(slides, cfg);
    await svc.deleteSlide("P", "slide_9");
    expect(batchUpdate.mock.calls[0][0].requestBody.requests[0].deleteObject.objectId).toBe(
      "slide_9",
    );
  });
});
