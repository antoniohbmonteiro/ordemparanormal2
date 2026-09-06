import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishPoiRevealNotice } from "./publish-poi-reveal-notice";

const create = vi.fn();

beforeEach(() => {
  create.mockReset().mockResolvedValue({});
  vi.stubGlobal("ChatMessage", { create });
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
});
afterEach(() => vi.unstubAllGlobals());

describe("publishPoiRevealNotice", () => {
  it("does nothing for an empty recipient list", async () => {
    await publishPoiRevealNotice([]);
    expect(create).not.toHaveBeenCalled();
  });

  it("whispers one generic system message per user", async () => {
    await publishPoiRevealNotice(["u1", "u2"]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toEqual({
      content: "<p>ORDEMPARANORMAL2.PointOfInterest.Reveal.Notice</p>",
      whisper: ["u1"],
      flags: { ordemparanormal2: { poiRevealNotice: true } },
    });
    expect(create.mock.calls[1][0].whisper).toEqual(["u2"]);
  });

  it("keeps going and logs when one message fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    create.mockRejectedValueOnce(new Error("nope"));
    await expect(publishPoiRevealNotice(["u1", "u2"])).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
