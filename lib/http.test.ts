import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchJson } from "@/lib/http";

afterEach(() => vi.unstubAllGlobals());
describe("fetchJson", () => {
  it("returns successful data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [] })));
    expect(await fetchJson("/api/items")).toEqual({ data: [] });
  });
  it("never treats a server failure as an empty result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Indisponível" }, { status: 503 })));
    await expect(fetchJson("/api/items")).rejects.toMatchObject({ name: "ApiError", message: "Indisponível", status: 503 });
  });
  it("handles non-JSON errors and invalid successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("offline", { status: 502 })).mockResolvedValueOnce(new Response("invalid")));
    await expect(fetchJson("/api/items")).rejects.toBeInstanceOf(ApiError);
    await expect(fetchJson("/api/items")).rejects.toThrow("resposta inválida");
  });
  it("supports no-content responses and preserves network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockRejectedValueOnce(new Error("Network error")));
    expect(await fetchJson("/api/items", { method: "DELETE" })).toBeNull();
    await expect(fetchJson("/api/items")).rejects.toThrow("Network error");
  });
});
