import { describe, it, expect } from "vitest";
import { extractPresentationId, presentationUrl, assertObjectId } from "../src/lib/urls.js";
import { AppError } from "../src/lib/errors.js";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ab";

describe("extractPresentationId", () => {
  it("extrae de URL /presentation/d/<ID>/edit", () => {
    expect(
      extractPresentationId(`https://docs.google.com/presentation/d/${ID}/edit#slide=id.p`),
    ).toBe(ID);
  });

  it("extrae de URL con ?usp=sharing", () => {
    expect(
      extractPresentationId(`https://docs.google.com/presentation/d/${ID}/edit?usp=sharing`),
    ).toBe(ID);
  });

  it("extrae sin /edit final", () => {
    expect(extractPresentationId(`https://docs.google.com/presentation/d/${ID}`)).toBe(ID);
  });

  it("extrae de drive.google.com/file/d/<ID>/view", () => {
    expect(extractPresentationId(`https://drive.google.com/file/d/${ID}/view`)).toBe(ID);
  });

  it("extrae de drive.google.com/open?id=<ID>", () => {
    expect(extractPresentationId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
  });

  it("acepta el ID pelado", () => {
    expect(extractPresentationId(ID)).toBe(ID);
  });

  it("recorta espacios", () => {
    expect(extractPresentationId(`   ${ID}   `)).toBe(ID);
  });

  it("lanza con string vacío", () => {
    expect(() => extractPresentationId("")).toThrow(AppError);
  });

  it("lanza con texto sin ID", () => {
    expect(() => extractPresentationId("hola mundo no soy una url")).toThrow(AppError);
  });

  it("lanza con tipo no-string", () => {
    // @ts-expect-error prueba de runtime
    expect(() => extractPresentationId(null)).toThrow(AppError);
  });
});

describe("presentationUrl", () => {
  it("construye la URL canónica", () => {
    expect(presentationUrl(ID)).toBe(`https://docs.google.com/presentation/d/${ID}/edit`);
  });
});

describe("assertObjectId", () => {
  it("acepta ids no vacíos y recorta", () => {
    expect(assertObjectId("  abc  ")).toBe("abc");
  });
  it("rechaza vacío", () => {
    expect(() => assertObjectId("   ")).toThrow(AppError);
  });
});
