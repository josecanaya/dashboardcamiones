import { describe, it, expect, beforeEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// --- Mock del factory de clientes de Google (sin red real) -----------------
const h = vi.hoisted(() => ({
  presentationsGet: vi.fn(),
  presentationsBatchUpdate: vi.fn(),
  presentationsCreate: vi.fn(),
  filesList: vi.fn(),
  filesExport: vi.fn(),
  filesCopy: vi.fn(),
  filesGet: vi.fn(),
  filesUpdate: vi.fn(),
}));

vi.mock("../src/google/googleClient.js", () => ({
  getGoogleClients: vi.fn(async () => ({
    auth: {},
    slides: {
      presentations: {
        get: h.presentationsGet,
        batchUpdate: h.presentationsBatchUpdate,
        create: h.presentationsCreate,
      },
    },
    drive: {
      files: {
        list: h.filesList,
        export: h.filesExport,
        copy: h.filesCopy,
        get: h.filesGet,
        update: h.filesUpdate,
      },
    },
  })),
}));

import { getConfig } from "../src/config.js";
import { createMcpServer } from "../src/server/mcpServer.js";

const PRES_URL = "https://docs.google.com/presentation/d/PRES_TEST_1234567890/edit";

async function makeClient() {
  const cfg = getConfig();
  const server = createMcpServer(cfg);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function parse(result: { content: Array<{ type: string; text?: string }> }) {
  const text = result.content.find((c) => c.type === "text")?.text ?? "{}";
  return JSON.parse(text);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.presentationsGet.mockResolvedValue({
    data: {
      presentationId: "PRES_TEST_1234567890",
      title: "Informe operativo",
      pageSize: { width: { magnitude: 9144000, unit: "EMU" }, height: { magnitude: 6858000, unit: "EMU" } },
      slides: [
        {
          objectId: "slide_1",
          pageElements: [
            { objectId: "t1", shape: { shapeType: "TEXT_BOX", placeholder: { type: "TITLE" }, text: { textElements: [{ textRun: { content: "Titulo" } }] } } },
          ],
        },
      ],
    },
  });
  h.presentationsBatchUpdate.mockResolvedValue({
    data: { replies: [{ replaceAllText: { occurrencesChanged: 2 } }] },
  });
  h.filesList.mockResolvedValue({ data: { files: [{ id: "F1", name: "Deck" }], nextPageToken: "NX" } });
});

describe("MCP tools (in-memory client <-> server)", () => {
  it("expone las 14 tools esperadas", async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "google_drive_export_presentation",
        "google_drive_search_presentations",
        "google_slides_add_slide",
        "google_slides_add_table",
        "google_slides_batch_update",
        "google_slides_create_presentation",
        "google_slides_delete_slide",
        "google_slides_duplicate_presentation",
        "google_slides_get_presentation",
        "google_slides_insert_image",
        "google_slides_insert_textbox",
        "google_slides_list_slides",
        "google_slides_replace_text",
        "google_slides_update_text_element",
      ].sort(),
    );
  });

  it("marca correctamente read-only vs destructivas", async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName["google_slides_get_presentation"].annotations?.readOnlyHint).toBe(true);
    expect(byName["google_slides_delete_slide"].annotations?.destructiveHint).toBe(true);
  });

  it("get_presentation acepta URL y devuelve resumen", async () => {
    const client = await makeClient();
    const res = await client.callTool({
      name: "google_slides_get_presentation",
      arguments: { presentation: PRES_URL },
    });
    const data = parse(res as never);
    expect(data.title).toBe("Informe operativo");
    expect(data.presentationId).toBe("PRES_TEST_1234567890");
    expect(data.slides[0].title).toBe("Titulo");
  });

  it("replace_text devuelve occurrencesChanged", async () => {
    const client = await makeClient();
    const res = await client.callTool({
      name: "google_slides_replace_text",
      arguments: { presentation: PRES_URL, replacements: { PLANTA: "Ricardone" } },
    });
    const data = parse(res as never);
    expect(data.occurrencesChanged).toBe(2);
  });

  it("delete_slide sin confirm falla (protección destructiva)", async () => {
    const client = await makeClient();
    const res = await client.callTool({
      name: "google_slides_delete_slide",
      arguments: { presentation: PRES_URL, slideObjectId: "slide_1", confirm: false },
    });
    expect((res as { isError?: boolean }).isError).toBe(true);
    expect(parse(res as never).error.code).toBe("INVALID_ARGUMENT");
    expect(h.presentationsBatchUpdate).not.toHaveBeenCalled();
  });

  it("delete_slide con confirm=true ejecuta el borrado", async () => {
    h.presentationsBatchUpdate.mockResolvedValueOnce({ data: { replies: [] } });
    const client = await makeClient();
    const res = await client.callTool({
      name: "google_slides_delete_slide",
      arguments: { presentation: PRES_URL, slideObjectId: "slide_1", confirm: true },
    });
    expect((res as { isError?: boolean }).isError).toBeFalsy();
    expect(h.presentationsBatchUpdate).toHaveBeenCalledTimes(1);
  });

  it("batch_update con deleteObject sin confirm falla", async () => {
    const client = await makeClient();
    const res = await client.callTool({
      name: "google_slides_batch_update",
      arguments: { presentation: PRES_URL, requests: [{ deleteObject: { objectId: "x" } }] },
    });
    expect((res as { isError?: boolean }).isError).toBe(true);
    expect(parse(res as never).error.message).toMatch(/destructiv/i);
  });

  it("batch_update rechaza operación fuera de la allowlist (con confirm)", async () => {
    const client = await makeClient();
    const res = await client.callTool({
      name: "google_slides_batch_update",
      arguments: { presentation: PRES_URL, requests: [{ evilOp: {} }], confirm: true },
    });
    expect((res as { isError?: boolean }).isError).toBe(true);
    expect(parse(res as never).error.code).toBe("INVALID_ARGUMENT");
  });

  it("search_presentations pagina (nextPageToken)", async () => {
    const client = await makeClient();
    const res = await client.callTool({
      name: "google_drive_search_presentations",
      arguments: { nameContains: "Deck", pageSize: 1 },
    });
    const data = parse(res as never);
    expect(data.files[0].id).toBe("F1");
    expect(data.nextPageToken).toBe("NX");
  });

  it("propaga errores de permisos de Google como isError", async () => {
    h.presentationsGet.mockRejectedValueOnce({
      response: { status: 403, data: { error: { message: "No permission" } } },
    });
    const client = await makeClient();
    const res = await client.callTool({
      name: "google_slides_get_presentation",
      arguments: { presentation: PRES_URL },
    });
    expect((res as { isError?: boolean }).isError).toBe(true);
    expect(parse(res as never).error.code).toBe("PERMISSION_DENIED");
  });
});
