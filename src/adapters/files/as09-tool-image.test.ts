import { afterEach, describe, expect, it, vi } from "vitest";
import { createAs09ToolImagePort, decodeAs09ToolImage } from "./as09-tool-image";

function syntheticLzwTiff(): ArrayBuffer {
  const codes: number[] = [256, 64, 32, 16, 128, 50, 60, 70, 0, 1, 2, 3, 255];
  let remaining = 3000 * 3000 * 4 - 12;
  while (remaining) {
    codes.push(256, 0); remaining--;
    for (let code = 258, length = 2; code < 480 && length <= remaining; code++, length++) {
      codes.push(code); remaining -= length;
    }
  }
  codes.push(257);
  const encoded: number[] = []; let accumulator = 0, bits = 0;
  for (const code of codes) {
    accumulator = (accumulator << 9) | code; bits += 9;
    while (bits >= 8) { bits -= 8; encoded.push((accumulator >>> bits) & 255); }
  }
  if (bits) encoded.push((accumulator << (8 - bits)) & 255);
  const tags = [[256, 4, 1, 3000], [257, 4, 1, 3000], [258, 3, 4, 0], [259, 3, 1, 5], [262, 3, 1, 2],
    [273, 4, 1, 0], [274, 3, 1, 1], [277, 3, 1, 4], [278, 4, 1, 3000], [279, 4, 1, encoded.length],
    [284, 3, 1, 1], [338, 3, 1, 1]];
  const bitsOffset = 8 + 2 + tags.length * 12 + 4, dataOffset = bitsOffset + 8;
  tags[2][3] = bitsOffset; tags[5][3] = dataOffset;
  const buffer = new ArrayBuffer(dataOffset + encoded.length); const view = new DataView(buffer);
  view.setUint16(0, 0x4949); view.setUint16(2, 42, true); view.setUint32(4, 8, true); view.setUint16(8, tags.length, true);
  for (const [index, [tag, type, count, value]] of tags.entries()) {
    const offset = 10 + index * 12; view.setUint16(offset, tag, true); view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true); view.setUint32(offset + 8, value, true);
  }
  for (let i = 0; i < 4; i++) view.setUint16(bitsOffset + i * 2, 8, true);
  new Uint8Array(buffer).set(encoded, dataOffset); return buffer;
}
afterEach(() => vi.unstubAllGlobals());
describe("AS09 local tool-image conversion", () => {
  it("decodes real LZW RGB samples and converts associated alpha to straight RGBA", () => {
    const pixels = decodeAs09ToolImage(syntheticLzwTiff());
    expect(pixels).toHaveLength(3000 * 3000 * 4);
    expect([...pixels.slice(0, 12)]).toEqual([128, 64, 32, 128, 0, 0, 0, 0, 1, 2, 3, 255]);
    expect(pixels.at(-1)).toBe(0);
  });
  it("rejects malformed or differently sized TIFFs before decoding pixels", () => {
    expect(() => decodeAs09ToolImage(new ArrayBuffer(4))).toThrow();
    const buffer = syntheticLzwTiff(); new DataView(buffer).setUint32(18, 2999, true);
    expect(() => decodeAs09ToolImage(buffer)).toThrow("incompatível");
  });
  it("serializes a transparent PNG and releases the Canvas after encoding", async () => {
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ putImageData: vi.fn() })),
      toBlob: (callback: (blob: Blob | null) => void, mime: string) => callback(new Blob(["png"], { type: mime })) };
    vi.stubGlobal("document", { createElement: () => canvas });
    vi.stubGlobal("ImageData", class { constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {} });
    expect((await createAs09ToolImagePort().convert(new Blob([syntheticLzwTiff()]))).type).toBe("image/png");
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });
  it("inspects existing PNG dimensions and closes its ImageBitmap", async () => {
    const close = vi.fn();
    vi.stubGlobal("foundry", { utils: { fetchResource: async () => new Blob([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)], { type: "application/octet-stream" }) } });
    const bitmap = vi.fn(async () => ({ width: 3000, height: 3000, close })); vi.stubGlobal("createImageBitmap", bitmap);
    expect(await createAs09ToolImagePort().inspect("worlds/test/tool.png")).toBe(true);
    bitmap.mockResolvedValueOnce({ width: 1, height: 1, close });
    expect(await createAs09ToolImagePort().inspect("worlds/test/tool.png")).toBe(false);
    expect(close).toHaveBeenCalledTimes(2);
  });
});
