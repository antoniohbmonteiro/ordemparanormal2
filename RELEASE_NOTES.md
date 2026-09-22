# Ordem Paranormal 2 — v0.4.3

Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.

**Contém material gerado por inteligência artificial.**

![Importador de Aventura](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.4.3/docs/release-assets/v0.4.0/adventure-import.png)

## Destaques

- Corrige a etapa final de preparação de Scenes do **Importador de Aventura** em ambientes hospedados como o Forge.
- Assets de aventura já confirmados durante a materialização não são mais validados novamente pelo FilePicker.
- Backgrounds, Tiles e Tokens da Scene usam diretamente os caminhos já confirmados pelo provider.

## Correção do Importador de Aventura

Na v0.4.2, o envio de arquivos, os Handouts, os Pontos de Interesse e os Agentes já funcionavam no Forge. A preparação das Scenes, porém, ainda fazia uma confirmação redundante via `FilePicker.browse()` usando o caminho retornado pelo envio. Quando esse caminho era uma URL absoluta ou de CDN do Forge, ele era tratado incorretamente como um diretório do FilePicker, e a importação era interrompida na etapa de Scenes.

A v0.4.3 remove essa validação redundante apenas para os assets de aventura já materializados. Os assets do próprio sistema continuam usando a validação existente. Instalações self-hosted continuam funcionando.

O Mestre continua selecionando seus próprios arquivos legalmente obtidos. **O sistema não inclui nem distribui PDFs, mapas, tokens, handouts ou outros arquivos oficiais.**

## Compatibilidade e atualização

- Compatível com **Foundry VTT v14** e atualização direta da **v0.4.0, v0.4.1 ou v0.4.2**.
- Não há migração de dados do Mundo.
- Quem teve a importação interrompida pode simplesmente executar o importador novamente após atualizar. Handouts, Pontos de Interesse e Agentes já criados são preservados pela reconciliação existente, sem duplicação.

O projeto continua **source-available** sob a PolyForm Strict License 1.0.0. Releases públicas até v0.0.22 permanecem sob os termos MIT aplicáveis às cópias já distribuídas.

## Instalação

Manifest:

```text
https://github.com/antoniohbmonteiro/ordemparanormal2/releases/latest/download/system.json
```

Pacote:

```text
ordemparanormal2-v0.4.3.zip
```

**Comparar alterações**: https://github.com/antoniohbmonteiro/ordemparanormal2/compare/v0.4.2...v0.4.3
