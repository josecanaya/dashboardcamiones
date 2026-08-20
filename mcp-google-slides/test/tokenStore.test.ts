import { describe, it, expect, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm, readFile } from "node:fs/promises";
import { getTokenStore, __setTokenStoreForTests, type StoredTokens } from "../src/auth/tokenStore.js";
import type { AppConfig } from "../src/config.js";

const path = join(tmpdir(), `mcp-slides-tokens-${Date.now()}.enc`);

const cfg = {
  TOKEN_STORE: "file",
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  TOKEN_STORE_PATH: path,
} as AppConfig;

function tokens(refresh: string): StoredTokens {
  return { refresh_token: refresh, updated_at: new Date().toISOString() };
}

afterAll(async () => {
  await rm(path, { force: true });
  __setTokenStoreForTests(null);
});

describe("EncryptedFileStore", () => {
  it("set/get/list/delete cifrando en disco", async () => {
    __setTokenStoreForTests(null);
    const store = getTokenStore(cfg);

    expect(await store.get("default")).toBeNull();

    await store.set("default", tokens("REFRESH_ABC"));
    const got = await store.get("default");
    expect(got?.refresh_token).toBe("REFRESH_ABC");

    // El archivo en disco NO debe contener el refresh en claro.
    const onDisk = await readFile(path, "utf8");
    expect(onDisk).not.toContain("REFRESH_ABC");
    expect(JSON.parse(onDisk).v).toBe(1);

    await store.set("planta-2", tokens("REFRESH_XYZ"));
    expect((await store.list()).sort()).toEqual(["default", "planta-2"]);

    await store.delete("default");
    expect(await store.get("default")).toBeNull();
    expect(await store.list()).toEqual(["planta-2"]);
  });
});
