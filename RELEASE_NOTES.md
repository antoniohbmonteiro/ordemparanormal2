# Ordem Paranormal 2 — v0.4.4

Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.

**Contém material gerado por inteligência artificial.**

![Importador de Aventura](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.4.4/docs/release-assets/v0.4.0/adventure-import.png)

## Destaques

- Corrige a validação restante na preparação de Scenes do **Importador de Aventura** em ambientes hospedados como o Forge.
- O ícone de controle do Mestre, empacotado com o próprio sistema, não é mais procurado no armazenamento de arquivos do Mundo.
- Nenhuma migração é necessária, e importações interrompidas podem ser executadas novamente com segurança.

## Correção do Importador de Aventura

Após a v0.4.3, a preparação da Scene ainda validava um asset do próprio sistema, o ícone `systems/ordemparanormal2/assets/scene-controls/gm-control-button.png`, pelo FilePicker do armazenamento `data` do Mundo. Esse caminho não é um diretório desse armazenamento, e no Forge a importação parava com:

```text
Falha na etapa Scene (validação):
Directory systems/ordemparanormal2/assets/scene-controls
does not exist or is not accessible in this storage location
```

A v0.4.4 remove essa validação. O asset é distribuído junto com o sistema e usado diretamente pela Scene. Os assets da aventura continuam usando os caminhos já confirmados durante a materialização. Instalações self-hosted continuam funcionando.

O Mestre continua selecionando seus próprios arquivos legalmente obtidos. **O sistema não inclui nem distribui PDFs, mapas, tokens, handouts ou outros arquivos oficiais.**

## Compatibilidade e atualização

- Compatível com **Foundry VTT v14** e atualização direta da **v0.4.0 a v0.4.3**.
- Não há migração de dados do Mundo.
- Quem teve a importação interrompida pode executar o importador novamente após atualizar. Handouts, Pontos de Interesse e Agentes já criados são preservados pela reconciliação existente, sem duplicação.

O projeto continua **source-available** sob a PolyForm Strict License 1.0.0. Releases públicas até v0.0.22 permanecem sob os termos MIT aplicáveis às cópias já distribuídas.

## Instalação

Manifest:

```text
https://github.com/antoniohbmonteiro/ordemparanormal2/releases/latest/download/system.json
```

Pacote:

```text
ordemparanormal2-v0.4.4.zip
```

**Comparar alterações**: https://github.com/antoniohbmonteiro/ordemparanormal2/compare/v0.4.3...v0.4.4
