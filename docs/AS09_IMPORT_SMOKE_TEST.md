# AS09 — smoke test do Adventure Importer no Foundry v14

## Verificações técnicas em 2026-10-05

- [x] ZIP temporário com 88 arquivos, 40 na pasta permitida e um PSD excluído.
- [x] Código de produção reconhece o ZIP renomeado pelo fast path de metadados.
- [x] SHA-256 do catálogo confere com as 39 imagens reais, extraídas com verificação CRC32; nenhum arquivo protegido foi gravado localmente.
- [x] Adapter local UTIF decodifica os nove TIFFs reais LZW de 3000×3000 para RGBA.
- [x] Testes sintéticos cobrem alfa associado, serialização PNG, materialização/retry, preservação de POIs, origem canônica e coordenação da Application.

## Smoke em World nativo — pendente

Não havia processo Foundry ativo durante a implementação. Os cenários abaixo precisam de World descartável, arquivos fornecidos legalmente e GM ativo. Testes com shims não confirmam estes cenários nativos.

- [ ] Sem AS09: importar cada ato e conferir comportamento existente.
- [ ] Reconhecer `AS09-Extras-v1.0-Elite (1).zip`, separado dos ZIPs dos atos.
- [ ] AS09 inválido/desconhecido: manter atos válidos importáveis com aviso explícito.
- [ ] Remover/substituir AS09: invalidar análise preservando PDF e ZIPs dos atos.
- [ ] Apenas Ato I: 39 imagens manuais, mappings do Ato I e nenhuma ferramenta criada.
- [ ] Ato II/ambos: nove ferramentas em `A Maldição do Ídolo de Pedra > Ato II > Ferramentas`, irmã de `Pontos de Interesse`.
- [ ] FilePicker: 18 JPG e 21 PNG, incluindo POSTERs, Low*, Fundo, Mockup e variantes; nenhum PSD, TIF original ou arquivo externo à pasta.
- [ ] Abrir os nove PNGs convertidos; conferir 3000×3000, cores e bordas transparentes.
- [ ] Conferir todos os mappings: freezer só no Ato I; estante `_1` no Ato II; estante/pôsteres do Ato I mantêm referências atuais.
- [ ] Imagens exclusivamente manuais não criam POIs, Equipment, Journals ou associações.
- [ ] Alterar imagens/conteúdo de POI e Knowledge/Discovery/visibilidade; reimportar com Preserve e Restore e conferir preservação de imagens/runtime.
- [ ] Renomear ferramenta, editar usos/descrição/useForms/efeitos/ownership, mover e customizar imagem; reimport mantém alterações e IDs.
- [ ] Outro POI/ferramenta no fallback: reimport aplica somente sua imagem mapeada.
- [ ] Compendium intacto e `equipmentSourceUuid()` retorna a origem canônica de cada World Equipment.
- [ ] Arrastar manualmente ferramenta para Agent; conferir imagem, origem e integração de investigação existente.
- [ ] Provocar falha de upload/conversão; conferir contagens parciais e retry sem duplicações/associações incompletas.
- [ ] Conferir restrições para jogador/GM inativo, troca de autoridade, fechamento/reabertura, rerender, hover/focus, teclado, resize, scroll e controles nativos.

Fechar Foundry antes do gate final, que gera packs LevelDB. ZIP e imagens ficam fora do Git. Versão/tag/publicação exigem tarefa de release separada.

## Resultado automatizado da implementação em 2026-10-05

- `npm run check`: aprovado — typecheck, 267 arquivos de teste aprovados (4 ignorados), 1.943 testes aprovados (17 ignorados) e build Vite/packs.
- `git diff --check`: aprovado.
- Um primeiro gate teve timeout em teste existente de Scenes; os 32 testes da suíte passaram isoladamente e os gates completos subsequentes passaram.
- `npm audit`: um alerta high preexistente em `engine.io@6.6.9`, dependência de desenvolvimento que não foi alterada. Nenhum alerta em UTIF/pako foi reportado. A atualização de dependências não relacionadas fica fora desta tarefa.
- Manifests continuam em 0.5.0. Nenhum commit, push, tag ou release foi executado.

## Preparação da v0.5.1 em 2026-10-06

- Baseline: `main` em `a15b94b`, com AS09, thumbnails de POI e ícones de dados da Agent Sheet já implementados; Node `24.19.0`.
- Versões sincronizadas em `0.5.1`; `CURRENT_DATA_MIGRATION_VERSION` permanece `2`. Nenhuma nova migração de World.
- Foundry já estava fechado antes do gate; não foi necessário encerrar processos.
- `npm run check`: aprovado — typecheck, 271 arquivos de teste aprovados (4 ignorados), 1.972 testes aprovados (17 ignorados) e build Vite/packs. Nenhuma falha neste gate.
- `git diff --check`: aprovado.
- Metadados conferidos conforme o workflow: tag esperada `v0.5.1`, pacote `ordemparanormal2-v0.5.1.zip`, heading de release exato, download correto, manifest estável e oito URLs de media com arquivos existentes e rastreados.
- Parser Discord validado localmente: quatro destaques, 690 de 1.024 caracteres, sem imagem e sem envio de anúncio.
- Dependências, código funcional, versão de migração, fontes dos compêndios e workflow preservados. `.claude/` não rastreada permanece intacta.
- Nenhum smoke manual em World nativo foi executado nesta preparação; todos os cenários acima continuam pendentes. Os resultados de 2026-10-05 são registros históricos.
- Alterações de preparação permanecem sem commit. Nenhum push, tag, publicação ou execução remota do workflow foi realizado.

## Arquivos da implementação

- `.gitignore`
- `CHANGELOG.md`
- `THIRD_PARTY_LICENSES.md`
- `docs/ARCHITECTURE.md`
- `docs/DOMAIN_MODEL.md`
- `lang/pt-BR.json`
- `package-lock.json`
- `package.json`
- `src/adapters/files/read-zip-content-facts.ts`
- `src/applications/adventure-import/adventure-import-application.test.ts`
- `src/applications/adventure-import/adventure-import-application.ts`
- `src/core/adventure-import/known-adventure-sources.ts`
- `src/features/adventure-import/adventure-asset-layout.ts`
- `src/features/adventure-import/adventure-folders.test.ts`
- `src/features/adventure-import/adventure-folders.ts`
- `src/features/adventure-import/analyze-adventure-sources.integration.test.ts`
- `src/features/adventure-import/analyze-adventure-sources.test.ts`
- `src/features/adventure-import/analyze-adventure-sources.ts`
- `src/features/adventure-import/import-adventure-pois.test.ts`
- `src/features/adventure-import/import-adventure-pois.ts`
- `styles/adventure-import.css`
- `templates/applications/adventure-import.hbs`
- `docs/AS09_IMPORT_SMOKE_TEST.md`
- `src/adapters/files/as09-tool-image.test.ts`
- `src/adapters/files/as09-tool-image.ts`
- `src/adapters/foundry/adventure-tool-items.test.ts`
- `src/adapters/foundry/adventure-tool-items.ts`
- `src/config/adventure-definitions/playtest-alpha-as09.test.ts`
- `src/config/adventure-definitions/playtest-alpha-as09.ts`
- `src/core/adventure-import/recognize-as09-source.test.ts`
- `src/core/adventure-import/recognize-as09-source.ts`
- `src/features/adventure-import/analyze-as09-source.test.ts`
- `src/features/adventure-import/analyze-as09-source.ts`
- `src/features/adventure-import/as09-test-fixtures.ts`
- `src/features/adventure-import/import-adventure-tools.test.ts`
- `src/features/adventure-import/import-adventure-tools.ts`
- `src/features/adventure-import/materialize-as09-assets.test.ts`
- `src/features/adventure-import/materialize-as09-assets.ts`
- `src/types/utif.d.ts`
