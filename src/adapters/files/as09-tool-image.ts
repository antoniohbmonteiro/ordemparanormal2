import UTIF from "utif";

export interface As09ToolImagePort {
  convert(blob: Blob): Promise<Blob>;
  inspect(path: string): Promise<boolean>;
}

export function decodeAs09ToolImage(buffer: ArrayBuffer): Uint8ClampedArray<ArrayBuffer> {
  const images = UTIF.decode(buffer);
  const image = images[0];
  if (images.length !== 1 || image?.t256?.[0] !== 3000 || image.t257?.[0] !== 3000
    || image.t262?.[0] !== 2 || image.t277?.[0] !== 4 || image.t258?.some(bits => bits !== 8)
    || image.t258?.length !== 4 || image.t274?.[0] !== 1 || image.t338?.[0] !== 1)
    throw new Error("Formato da imagem de ferramenta AS09 incompatível.");
  UTIF.decodeImage(buffer, image);
  const rgba = new Uint8ClampedArray(UTIF.toRGBA8(image));
  if (rgba.length !== 3000 * 3000 * 4) throw new Error("Pixels da ferramenta AS09 incompatíveis.");
  // UTIF returns associated RGB samples; Canvas ImageData requires straight alpha.
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3];
    for (let channel = 0; channel < 3; channel++) rgba[i + channel] = alpha ? rgba[i + channel] * 255 / alpha : 0;
  }
  return rgba;
}

export function createAs09ToolImagePort(): As09ToolImagePort {
  return {
    async convert(blob) {
      const pixels = decodeAs09ToolImage(await blob.arrayBuffer());
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 3000;
      try {
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 2D indisponível.");
        context.putImageData(new ImageData(pixels, 3000, 3000), 0, 0);
        const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => {
          if (value?.type === "image/png") resolve(value); else reject(new Error("Falha ao converter a ferramenta para PNG."));
        }, "image/png"));
        return png;
      } finally { canvas.width = canvas.height = 0; }
    },
    async inspect(path) {
      const utils = foundry.utils as typeof foundry.utils & { fetchResource(src: string): Promise<Blob> };
      const blob = await utils.fetchResource(path);
      const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
      if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte)) return false;
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(blob); }
      catch (error) {
        if (error instanceof DOMException && ["InvalidStateError", "EncodingError"].includes(error.name)) return false;
        throw error;
      }
      try { return bitmap.width === 3000 && bitmap.height === 3000; }
      finally { bitmap.close(); }
    },
  };
}
