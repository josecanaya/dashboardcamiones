import { describe, it, expect } from "vitest";
import { z } from "zod";
import * as S from "../src/tools/schemas.js";

describe("validación de parámetros (Zod)", () => {
  it("get_presentation exige presentation no vacío", () => {
    const schema = z.object(S.getPresentationShape);
    expect(schema.safeParse({ presentation: "abc" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ presentation: "" }).success).toBe(false);
  });

  it("insert_textbox valida position/size numéricos y size positivo", () => {
    const schema = z.object(S.insertTextboxShape);
    const ok = schema.safeParse({
      presentation: "P",
      pageObjectId: "s1",
      text: "hola",
      position: { x: 100, y: 200 },
      size: { width: 300, height: 100 },
    });
    expect(ok.success).toBe(true);

    const badSize = schema.safeParse({
      presentation: "P",
      pageObjectId: "s1",
      text: "hola",
      position: { x: 1, y: 2 },
      size: { width: -5, height: 100 },
    });
    expect(badSize.success).toBe(false);
  });

  it("add_table exige rows/columns enteros >= 1", () => {
    const schema = z.object(S.addTableShape);
    expect(
      schema.safeParse({ presentation: "P", pageObjectId: "s1", rows: 2, columns: 3 }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ presentation: "P", pageObjectId: "s1", rows: 0, columns: 3 }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ presentation: "P", pageObjectId: "s1", rows: 1.5, columns: 3 }).success,
    ).toBe(false);
  });

  it("delete_slide exige confirm boolean", () => {
    const schema = z.object(S.deleteSlideShape);
    expect(
      schema.safeParse({ presentation: "P", slideObjectId: "s1", confirm: true }).success,
    ).toBe(true);
    expect(schema.safeParse({ presentation: "P", slideObjectId: "s1" }).success).toBe(false);
  });

  it("export_presentation solo acepta pdf|pptx", () => {
    const schema = z.object(S.exportPresentationShape);
    expect(schema.safeParse({ presentation: "P", format: "pdf" }).success).toBe(true);
    expect(schema.safeParse({ presentation: "P", format: "pptx" }).success).toBe(true);
    expect(schema.safeParse({ presentation: "P", format: "docx" }).success).toBe(false);
  });

  it("insert_image exige URL válida", () => {
    const schema = z.object(S.insertImageShape);
    const base = {
      presentation: "P",
      pageObjectId: "s1",
      position: { x: 1, y: 2 },
      size: { width: 100, height: 100 },
    };
    expect(schema.safeParse({ ...base, url: "https://x/y.png" }).success).toBe(true);
    expect(schema.safeParse({ ...base, url: "no-es-url" }).success).toBe(false);
  });

  it("search_presentations limita pageSize a 1..100", () => {
    const schema = z.object(S.searchPresentationsShape);
    expect(schema.safeParse({ pageSize: 50 }).success).toBe(true);
    expect(schema.safeParse({ pageSize: 0 }).success).toBe(false);
    expect(schema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});
