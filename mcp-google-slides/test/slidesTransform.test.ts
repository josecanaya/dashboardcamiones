import { describe, it, expect } from "vitest";
import type { slides_v1 } from "googleapis";
import {
  summarizePresentation,
  extractText,
  summarizeSlide,
} from "../src/google/slidesTransform.js";

const VT = String.fromCharCode(11);

function textContent(text: string): slides_v1.Schema$TextContent {
  return { textElements: [{ textRun: { content: text } }] };
}

describe("extractText", () => {
  it("concatena textRuns", () => {
    const tc: slides_v1.Schema$TextContent = {
      textElements: [{ textRun: { content: "Hola " } }, { textRun: { content: "mundo\n" } }],
    };
    expect(extractText(tc)).toBe("Hola mundo");
  });
  it("convierte vertical-tab a salto de línea", () => {
    expect(extractText(textContent(`linea1${VT}linea2`))).toBe("linea1\nlinea2");
  });
  it("devuelve vacío sin textElements", () => {
    expect(extractText(undefined)).toBe("");
    expect(extractText({})).toBe("");
  });
});

const mockPresentation: slides_v1.Schema$Presentation = {
  presentationId: "PRES1",
  title: "Informe Ricardone",
  revisionId: "rev1",
  pageSize: { width: { magnitude: 9144000, unit: "EMU" }, height: { magnitude: 6858000, unit: "EMU" } },
  slides: [
    {
      objectId: "slide_1",
      slideProperties: {
        layoutObjectId: "layout_title",
        notesPage: {
          notesProperties: { speakerNotesObjectId: "notes_1" },
          pageElements: [{ objectId: "notes_1", shape: { text: textContent("Nota del orador") } }],
        },
      },
      pageElements: [
        {
          objectId: "title_1",
          shape: { shapeType: "TEXT_BOX", placeholder: { type: "TITLE" }, text: textContent("Circuitos R7") },
        },
        {
          objectId: "img_1",
          image: { contentUrl: "https://example.com/x.png" },
        },
        {
          objectId: "tbl_1",
          table: { rows: 3, columns: 4 },
        },
      ],
    },
  ],
};

describe("summarizePresentation", () => {
  it("resume metadata y slides", () => {
    const s = summarizePresentation(mockPresentation);
    expect(s.presentationId).toBe("PRES1");
    expect(s.title).toBe("Informe Ricardone");
    expect(s.slideCount).toBe(1);
    expect(s.pageSize?.width).toBe(9144000);
    expect(s.pageSize?.unit).toBe("EMU");
  });

  it("detecta título, notas y elementos", () => {
    const slide = summarizeSlide(mockPresentation.slides![0], 0);
    expect(slide.objectId).toBe("slide_1");
    expect(slide.title).toBe("Circuitos R7");
    expect(slide.speakerNotes).toBe("Nota del orador");
    expect(slide.layoutObjectId).toBe("layout_title");
    const types = slide.elements.map((e) => e.type).sort();
    expect(types).toEqual(["image", "table", "text"]);
    const table = slide.elements.find((e) => e.type === "table");
    expect(table?.rows).toBe(3);
    expect(table?.columns).toBe(4);
  });

  it("maneja presentación vacía", () => {
    const s = summarizePresentation({ presentationId: "P", title: "T" });
    expect(s.slideCount).toBe(0);
    expect(s.slides).toEqual([]);
  });
});
