# Ordem Paranormal 2 — v0.4.0

Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.

**Contém material gerado por inteligência artificial.**

![Importador de Aventura](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.4.0/docs/release-assets/v0.4.0/adventure-import.png)

## Destaques

- Novo **Importador de Aventura** nas Ferramentas do Mestre, com reconhecimento do PDF Playtest Alpha v1.0 ou v1.1 e dos ZIPs de extras dos Atos I e II fornecidos pelo usuário.
- Preparação de **Agentes, Handouts, Pontos de Interesse e Scenes** no próprio Mundo, com uma prévia do conteúdo detectado antes da importação.
- **Controles interativos de Tile** para abrir ou fechar portas e mostrar ou ocultar Tiles associados.

## Importador de Aventura

O Mestre seleciona seus próprios arquivos legalmente obtidos. O sistema analisa os materiais reconhecidos e processa os arquivos localmente para preparar o conteúdo no Mundo. **O sistema não inclui nem distribui PDFs, mapas, tokens, handouts ou outros arquivos oficiais.** É possível importar um ato ou ambos.

| Conteúdo detectado | Ato I | Ato II |
| --- | ---: | ---: |
| Agentes | 5 | 5 |
| Handouts | 18 | 8 |
| Pontos de Interesse | 29 | 25 |
| Scenes | 1 | 1 |

## Importação segura e reexecutável

A importação organiza o conteúdo em pastas próprias e pode ser executada novamente sem duplicar os documentos que já reconhece. Ao encontrar alterações do Mestre em Agentes, Pontos de Interesse ou Scenes gerenciados pelo importador, o fluxo apresenta o conflito antes de substituir esse conteúdo. Alterações pertencentes ao Mestre são preservadas quando ele escolhe mantê-las.

O **Importador de Aventura é opcional**: nenhum conteúdo de aventura é criado ao atualizar ou abrir o sistema. A criação ocorre somente quando o Mestre aciona a importação.

## Pontos de Interesse

Os 54 Pontos de Interesse são criados como Items estruturados. Quando apropriado, alguns recebem automaticamente imagens públicas dos arquivos fornecidos pelo usuário.

O importador **não cria nem associa Regions automaticamente**. O Mestre posiciona os Pontos de Interesse na Scene e faz as associações desejadas pela aba **Ponto de Interesse** da configuração de Region.

## Scenes dos Atos I e II

O importador prepara as Scenes dos porões dos Atos I e II com os mapas fornecidos. No Ato I, um detalhe visual da estante pode usar um overlay gerado localmente quando o arquivo necessário estiver disponível.

## Controles interativos de Tile

O Mestre pode configurar um Tile para, ao ser acionado, **abrir ou fechar portas** e **mostrar ou ocultar Tiles associados** na mesma Scene. A configuração fica na aba de interação do Tile.

## Outras melhorias

- A configuração atual de Region ganhou uma aba dedicada para associar ou remover um Ponto de Interesse.
- A prévia do importador apresenta as quantidades por ato e tipo de conteúdo antes da criação no Mundo.

## Compatibilidade e atualização

- Compatível com **Foundry VTT v14**.
- Atualização direta a partir da **v0.3.0**. Não há nova migração de dados do Mundo nesta versão.
- O Importador de Aventura só cria conteúdo quando acionado pelo Mestre com os arquivos fornecidos por ele.

O projeto continua **source-available** sob a PolyForm Strict License 1.0.0. Releases públicas até v0.0.22 permanecem sob os termos MIT aplicáveis às cópias já distribuídas.

## Instalação

Manifest:

```text
https://github.com/antoniohbmonteiro/ordemparanormal2/releases/latest/download/system.json
```

Pacote:

```text
ordemparanormal2-v0.4.0.zip
```

**Comparar alterações**: https://github.com/antoniohbmonteiro/ordemparanormal2/compare/v0.3.0...v0.4.0
