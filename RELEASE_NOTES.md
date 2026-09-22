# Ordem Paranormal 2 — v0.4.1

Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.

**Contém material gerado por inteligência artificial.**

![Importador de Aventura](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.4.1/docs/release-assets/v0.4.0/adventure-import.png)

## Destaques

- Corrige a importação de assets do Importador de Aventura em ambientes hospedados como o Forge.
- Mantém a compatibilidade com instalações self-hosted.
- Não altera o conteúdo da aventura nem exige migração de dados do Mundo.

## Correção

Providers hospedados podem representar arquivos enviados como URLs absolutas de CDN. Na v0.4.0, a confirmação do upload exigia um caminho relativo exato e podia interromper a importação mesmo após o provider aceitar o arquivo. A confirmação agora reconhece o caminho completo dentro da URL e preserva o endereço fornecido pelo provider.

O Mestre continua selecionando seus próprios arquivos legalmente obtidos. **O sistema não inclui nem distribui PDFs, mapas, tokens, handouts ou outros arquivos oficiais.**

## Compatibilidade e atualização

- Compatível com **Foundry VTT v14** e atualização direta da **v0.4.0**.
- Não há migração de dados do Mundo.
- Quem não encontrou o problema não precisa recriar conteúdo.
- Quem teve a importação interrompida pode executar o importador novamente após atualizar.

O projeto continua **source-available** sob a PolyForm Strict License 1.0.0. Releases públicas até v0.0.22 permanecem sob os termos MIT aplicáveis às cópias já distribuídas.

## Instalação

Manifest:

```text
https://github.com/antoniohbmonteiro/ordemparanormal2/releases/latest/download/system.json
```

Pacote:

```text
ordemparanormal2-v0.4.1.zip
```

**Comparar alterações**: https://github.com/antoniohbmonteiro/ordemparanormal2/compare/v0.4.0...v0.4.1
