import type { ZipSupplementalFile } from "../../core/adventure-import/known-adventure-sources";

export const AS09_IMAGE_ROOT = "Presentinho-imagens-AS08-pedidas-pelos-elites/";
export interface As09ImageSource extends ZipSupplementalFile {
  readonly basename: string;
  readonly outputBasename: string;
  readonly convertTiff: boolean;
}

// Measured technical metadata only; image bytes remain in the user-supplied ZIP.
const IMAGE_METADATA = [
  {
    "basename": "ALTAR.jpg",
    "uncompressedSize": 29278519,
    "crc32": 27714351,
    "contentSha256": "501f0403d436f03f735a4e9f5aa4d63609c093a4c4cace4db7f23d0a3d88af23"
  },
  {
    "basename": "CELULAR.jpg",
    "uncompressedSize": 26206320,
    "crc32": 790403534,
    "contentSha256": "31f53262ae3208e1fdb38dab3ebc0155f1e1523b600cf56c0dd44005f54420e5"
  },
  {
    "basename": "CÂMERA MODIFICADA.tif",
    "uncompressedSize": 3411712,
    "crc32": 3422809814,
    "contentSha256": "17a1e27ee5988f15c3d9a8004916b3fa048c9876439a711efdc1ee1b66fb0f2a"
  },
  {
    "basename": "ESTEANTE_ABERTA.jpg",
    "uncompressedSize": 24009618,
    "crc32": 668188384,
    "contentSha256": "87a4db5d6c680aad2ff0625fe756dca2c96fc3cada5575c2aa3d8475707d0385"
  },
  {
    "basename": "ESTEANTE_ABERTA_1.jpg",
    "uncompressedSize": 23604265,
    "crc32": 4134833535,
    "contentSha256": "56276e0bfe85081ca0c4a82fffff254363415c8910a1c6f8e11b9db789ba68de"
  },
  {
    "basename": "ESTEANTE_ABERTAz.jpg",
    "uncompressedSize": 23604265,
    "crc32": 4134833535,
    "contentSha256": "56276e0bfe85081ca0c4a82fffff254363415c8910a1c6f8e11b9db789ba68de"
  },
  {
    "basename": "Fundo.jpg",
    "uncompressedSize": 22634706,
    "crc32": 1235434316,
    "contentSha256": "2961c1581ab1719540a747db0b3e064bef22d90a0989bfb6fa5afb2cb4c9be3b"
  },
  {
    "basename": "Gustavo Freezer.png",
    "uncompressedSize": 23003609,
    "crc32": 4223281306,
    "contentSha256": "a599ed46c11404f2d5f857ea5e05ba4770fc593f0e691b815337e21186faf3a6"
  },
  {
    "basename": "IDOLO_COM_MEDO.jpg",
    "uncompressedSize": 27909434,
    "crc32": 587721431,
    "contentSha256": "4b6dd3987c6f2494daf469d19bac18f1f3d4204be36982fdbcb49e803f54d613"
  },
  {
    "basename": "IDOLO_SORRINDO.jpg",
    "uncompressedSize": 27903527,
    "crc32": 374890920,
    "contentSha256": "c7d2e0a6a813677ad3fd9998b33d5b8eab4cc352816c354c27b3c17b32d22ffe"
  },
  {
    "basename": "LABORATÓRIO PORTÁTIL.tif",
    "uncompressedSize": 4074812,
    "crc32": 3103173011,
    "contentSha256": "3af7a6a26593886c1c12e1b654bedf6c1d505caf2da870a911fc2dc1d17d2c85"
  },
  {
    "basename": "LASER TRIANGULAÇÃO.tif",
    "uncompressedSize": 3786424,
    "crc32": 120760226,
    "contentSha256": "2dac7b109bbdfcd7a78d9b680bc4caf4a81e085fc95b2cb492f8bba83bfd0229"
  },
  {
    "basename": "LEITOR INFRAVERMELHO.tif",
    "uncompressedSize": 2324680,
    "crc32": 2063081604,
    "contentSha256": "65508d2f0100e87458b65621fd8e0522d9c42c9956a7215ff9976db26dd7eb62"
  },
  {
    "basename": "LIVRO_ESTANTE.jpg",
    "uncompressedSize": 19955613,
    "crc32": 2767786758,
    "contentSha256": "dea6af4e7be9e602e5ff506cf77f00294b774f273d7f78a0ee14cc3d2ea66322"
  },
  {
    "basename": "LUZ UV.tif",
    "uncompressedSize": 3280612,
    "crc32": 1785448518,
    "contentSha256": "678ae3573a652b5b947c41bb878c2a9a7e4f71cca677e408a5bc23d23562fb5d"
  },
  {
    "basename": "Low Alan.png",
    "uncompressedSize": 934499,
    "crc32": 2955172070,
    "contentSha256": "d5b229ade1b68011aa64e375195a2ba598a2eb6df73e9697a18dde8cc3abc673"
  },
  {
    "basename": "Low Amanda.png",
    "uncompressedSize": 737940,
    "crc32": 1719854843,
    "contentSha256": "80b5dba2fd3a2e835c1e34695205093d11655cf3e72df3ce229c9006297551ba"
  },
  {
    "basename": "Low Antônio.png",
    "uncompressedSize": 909004,
    "crc32": 1638706292,
    "contentSha256": "cff8c051cf881e18afad1f08dbe6cce3248cc2861d7e079cd2536be50e7aa130"
  },
  {
    "basename": "Low Edgar.png",
    "uncompressedSize": 1177870,
    "crc32": 3536367208,
    "contentSha256": "0e0f0bad72d0d3d2ccce8e758cd8d719c8c2e4338b413f64e45c3483305d741e"
  },
  {
    "basename": "Low Eloísa.png",
    "uncompressedSize": 748017,
    "crc32": 571200831,
    "contentSha256": "40c9ad3f3f347d35945d4082749269324cc4e715cd8a983ddd1abc3bdc16f673"
  },
  {
    "basename": "Low Heitor.png",
    "uncompressedSize": 1063713,
    "crc32": 1049844495,
    "contentSha256": "a9a36eb621dd32e46a82afb02b29c9e680ac3be896c7e83a2082729880f6d391"
  },
  {
    "basename": "Low Kênia.png",
    "uncompressedSize": 830369,
    "crc32": 1654122011,
    "contentSha256": "a6933a2977e6e43655a628c40adc130acf541a464a4065818caf7f5e95408dc5"
  },
  {
    "basename": "Low Raven.png",
    "uncompressedSize": 1120792,
    "crc32": 3375254957,
    "contentSha256": "f89de79c3ddb51a8279d275dafbea9e70b143b28a35ce5441d8cffc454d10cd8"
  },
  {
    "basename": "Low Val.png",
    "uncompressedSize": 879244,
    "crc32": 906447555,
    "contentSha256": "0303d68369711ff24388784bfbe27fa251fe51b3b7beb92ea744889ad6a9ff8d"
  },
  {
    "basename": "Low Victor.png",
    "uncompressedSize": 910601,
    "crc32": 3834757223,
    "contentSha256": "a5a712ebddb98490d2bf54934d3f74c80856f0fc3f16ef9d0e8ca172d8acb279"
  },
  {
    "basename": "MEDIDOR EMF.tif",
    "uncompressedSize": 2327268,
    "crc32": 709318463,
    "contentSha256": "feb13ccf14971efa37fe8cba2fe509339a442db1731b80c3d3dffbb78bff2f1c"
  },
  {
    "basename": "Mockup Compendio.png",
    "uncompressedSize": 15768742,
    "crc32": 2711246351,
    "contentSha256": "49b63706ba38e1d7246f3988fb81f594542e20768f75a3e3c70f4fce56f66a3c"
  },
  {
    "basename": "PC.jpg",
    "uncompressedSize": 27455850,
    "crc32": 1704760330,
    "contentSha256": "1b8daf0022f6ea88379942017e8b3a9c58c235fda47af7e928e7eafdeb029524"
  },
  {
    "basename": "PORTA DE FERRO.jpg",
    "uncompressedSize": 24584781,
    "crc32": 482729620,
    "contentSha256": "c2b06a06d0a44204e888ab21cbd6e7996988a02135c04b485ec4673e28a8f0e2"
  },
  {
    "basename": "POSTER1.jpg",
    "uncompressedSize": 5567990,
    "crc32": 358508241,
    "contentSha256": "13696917dfe26f1a5cec4f4f29c0805306d70029d2abc79ff193eccc9890fb05"
  },
  {
    "basename": "POSTER2.jpg",
    "uncompressedSize": 6405267,
    "crc32": 2771572105,
    "contentSha256": "6d9bc4b92a470e4e942d9875cd70bb56051c7ddaf6268fb475b0014d13a23a08"
  },
  {
    "basename": "POSTER3.jpg",
    "uncompressedSize": 9259421,
    "crc32": 2141418631,
    "contentSha256": "531196a9b442054671e6ae4527ba4e18cc06bf43fb3cbc4cc444618d0c77666a"
  },
  {
    "basename": "POSTER4.jpg",
    "uncompressedSize": 7422282,
    "crc32": 3827542177,
    "contentSha256": "a9db96c8daad18619992e0b24af22224e65392e49afa1946f8e73506b2288383"
  },
  {
    "basename": "PÓ REVELADOR.tif",
    "uncompressedSize": 2189184,
    "crc32": 1628981182,
    "contentSha256": "a64a0820d99f3703a78e1ac53a76abb399766af9d9d04ad1ce126a68d0adaf89"
  },
  {
    "basename": "RÁDIO MODIFICADO.tif",
    "uncompressedSize": 3220868,
    "crc32": 2657951897,
    "contentSha256": "3f0d19eb6bb1043f0c50eab39dbb3ba09a2051c0e95a301c64eb89f85ff87c6f"
  },
  {
    "basename": "SALA_AB.jpg",
    "uncompressedSize": 26297205,
    "crc32": 2778060463,
    "contentSha256": "462e2ff2352c952e5fc213ee8b0890a3e962d7dec27a74872b20675afb6bfc73"
  },
  {
    "basename": "SALA_AB_1.jpg",
    "uncompressedSize": 26297205,
    "crc32": 2778060463,
    "contentSha256": "462e2ff2352c952e5fc213ee8b0890a3e962d7dec27a74872b20675afb6bfc73"
  },
  {
    "basename": "SIGILO NO TETO.jpg",
    "uncompressedSize": 7346458,
    "crc32": 1704478071,
    "contentSha256": "d2f7193df2a412e63aebd80ca8c90d7e231f71a15651001af91d596769fb50d7"
  },
  {
    "basename": "TERMÔMETRO DIFERENCIAL.tif",
    "uncompressedSize": 1700348,
    "crc32": 3688476362,
    "contentSha256": "0a9d3c7475cd6125a69c72ed61aceb1bd769101da6320877023e2f7389c7b18a"
  }
] as const;

export const AS09_IMAGES: readonly As09ImageSource[] = IMAGE_METADATA.map(image => ({
  ...image, path: `${AS09_IMAGE_ROOT}${image.basename}`,
  outputBasename: image.basename.replace(/\.tif$/i, ".png"),
  convertTiff: image.basename.endsWith(".tif"),
}));

export const AS09_POI_IMAGES: Readonly<Record<string, string>> = {
  "actOne.map.06": "ALTAR.jpg", "actTwo.map.08": "ALTAR.jpg",
  "actOne.map.09": "CELULAR.jpg",
  "actOne.map.07": "SIGILO NO TETO.jpg", "actTwo.map.09": "SIGILO NO TETO.jpg",
  "actOne.map.16": "PORTA DE FERRO.jpg", "actTwo.map.19": "PORTA DE FERRO.jpg",
  "actOne.map.22": "PC.jpg", "actTwo.map.24": "PC.jpg",
  "actOne.map.24": "Gustavo Freezer.png",
  "actOne.map.17": "IDOLO_SORRINDO.jpg", "actTwo.map.07": "IDOLO_SORRINDO.jpg",
  "actTwo.map.16": "ESTEANTE_ABERTA_1.jpg",
};

export const AS09_TOOLS = [
  ["CÂMERA MODIFICADA.tif", "equipment0000002"],
  ["LABORATÓRIO PORTÁTIL.tif", "equipment0000003"],
  ["LUZ UV.tif", "equipment0000004"],
  ["LASER TRIANGULAÇÃO.tif", "equipment0000005"],
  ["LEITOR INFRAVERMELHO.tif", "equipment0000006"],
  ["MEDIDOR EMF.tif", "equipment0000007"],
  ["PÓ REVELADOR.tif", "equipment0000008"],
  ["RÁDIO MODIFICADO.tif", "equipment0000009"],
  ["TERMÔMETRO DIFERENCIAL.tif", "equipment0000010"],
].map(([basename, sourceId]) => ({ basename, sourceId,
  sourceUuid: `Compendium.ordemparanormal2.equipment.Item.${sourceId}`,
  documentId: `actTwo.tool.${sourceId}`,
}));
