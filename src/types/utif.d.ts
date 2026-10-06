declare module "utif" {
  export interface TiffImage {
    t256?: number[];
    t257?: number[];
    t258?: number[];
    t259?: number[];
    t262?: number[];
    t274?: number[];
    t277?: number[];
    t338?: number[];
    width?: number;
    height?: number;
  }
  const UTIF: {
    decode(buffer: ArrayBuffer): TiffImage[];
    decodeImage(buffer: ArrayBuffer, image: TiffImage): void;
    toRGBA8(image: TiffImage): Uint8Array;
  };
  export default UTIF;
}
