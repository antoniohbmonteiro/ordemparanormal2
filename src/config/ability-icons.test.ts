import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ICONS = [
  ["amor-pela-descoberta.svg", "DC6C5B2C62707C124751D3BC10FC523E4C2D902AC992798C37302DF2BCF0C773", "#4176ba"],
  ["avaliacao.svg", "4DB76B3C8FC858A778D6543403EA09611516822BEFDCD2528798F6C1961134C3", "#4176ba"],
  ["conhecimento-tecnico.svg", "661CA798A30E9E27775D424053CD3418733511E0F9A27ADC25AD1982C5E52301", "#4176ba"],
  ["esforco-e-suor.svg", "C901A5177613DCA77BCD5F8ED3E053B20C5824AC8E63BF9C14FA0BE3E74D9D1E", "#ae2c12"],
  ["estoico.svg", "94252B2A78384F1C81509C95DD35FC6A36D350FC5D780E0B0A29425A19211F4B", "#ae2c12"],
  ["foco-emocional.svg", "DC4848C00D9552B606E085D49B0BD90D121C16BB764A3D496F251F73F16BC48B", "#4b7e2f"],
  ["foco-mental.svg", "266968A7974E8D09AEBF240B95EE772374225CFCB400A7286D1C7A799C74BEE9", "#4176ba"],
  ["impeto.svg", "2C12EA66E7FEBC057007FADF8804B73EAE3BA57641D02FDA54A606B04E117FB2", "#ae2c12"],
  ["incansavel.svg", "4955CC5C2940CD6812D97644807462F0519DBB43DF785DA30C7D4403908A8419", "#ae2c12"],
  ["linha-de-tiro.svg", "347AC631FC269D4B3798EFA2581A00A444630D901CA64C0E4F60B0DB7B40090C", "#ae2c12"],
  ["mentoria.svg", "9BD3459931C710CE8BFAD8E61C855D119AFD246167267860CF3936A117835623", "#4b7e2f"],
  ["olhar-infalivel.svg", "27F694E8F5530B4DE64B88FFF9BCED20B9A61343B1406D461EA93D9E9A88D0F6", "#4176ba"],
  ["para-bellum.svg", "5B23CE8B1E95D9FDA955B599428D48C372EF84953C44A244B62F2F06B4A4902C", "#ae2c12"],
  ["prontidao.svg", "04C50BA19AA11124B22DC8892352204E95E218998D9093EAFD403857A587D7A7", "#4b7e2f"],
  ["tecnica-medicinal.svg", "920988F26830DBEC06F999F91E93E00749C5420599BC4F3173B16023F661D9A1", "#4b7e2f"],
  ["varredura-ampla.svg", "A60C881CB4863CF7E937AD951B6F1A2F2679D1A81A5E5C7B794A4DFB943DDDE7", "#4b7e2f"],
] as const;

describe("Ability icon assets", () => {
  it.each(ICONS)("preserves the supplied %s bytes and palette", async (name, sha256, color) => {
    const filePath = fileURLToPath(
      new URL(`../../assets/icons/abilities/${name}`, import.meta.url),
    );
    const content = await readFile(filePath);
    const svg = content.toString("utf8");

    expect(createHash("sha256").update(content).digest("hex").toUpperCase()).toBe(
      sha256,
    );
    expect(svg).toContain('viewBox="0 0 512 512"');
    expect(svg).toContain(`stop-color="${color}"`);
    expect(svg).toContain('stop-color="#000000"');
    expect(svg).toContain('fill="#fff"');
  });
});
