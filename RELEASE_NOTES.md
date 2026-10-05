# Ordem Paranormal 2 — v0.5.0

Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.

**Contém material gerado por inteligência artificial.**

![Investigação do jogador no POI](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.5.0/docs/release-assets/v0.5.0/investigation-player.webp)

## Destaques

- **Investigação em cena:** POIs, conhecimento individual dos Agentes, descobertas por investigação, revelação e compartilhamento de pistas com controle do Mestre.
- **Painel de POIs:** reúna os pontos da Scene, consulte pistas conhecidas e encontre pontos com pesquisa local por nome.
- **Ferramentas em jogo:** use equipamentos na investigação para obter respostas contextuais, com formas de uso e consumo de usos quando configurado.
- **Laboratório Portátil e Rádio Modificado:** desafio de análise e puzzle de sintonia, com descobertas ligadas ao POI.
- **Ato II preparado:** a importação configura as interações de ferramentas suportadas pelo playtest, com reimportação e preservação dos dados da mesa.
- **Inventário mais prático:** equipamentos agrupados, descrições expansíveis e quantidade opcional com ajuste manual.

## Investigar, descobrir e compartilhar

A v0.5.0 é um marco funcional da investigação. O Mestre inicia uma investigação na Scene, acompanha rodadas e Agentes que agiram e decide quais POIs ficam visíveis. O painel reúne os pontos da cena, permite localizar suas Regions no mapa, consultar pistas conhecidas e pesquisar os pontos disponíveis por nome.

![Painel de Pontos de Interesse com pesquisa](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.5.0/docs/release-assets/v0.5.0/poi-scene-panel.webp)

Cada Agente mantém seu próprio conhecimento (**Knowledge**). As descobertas feitas em uma investigação também registram sua origem por Agente e investigação (**Discovery**). Encerrar a investigação preserva o conhecimento e as pistas. A janela de cada POI mostra ao jogador as informações que seu Agente conhece; conteúdo privado do Mestre e pistas desconhecidas permanecem protegidos.

**Examinar** usa o fluxo normal de testes para descobrir informações permanentes, com investigação passiva e o custo de 1 PD quando o exame ativo não encontra informação nova. O Mestre pode revelar informações a Agentes escolhidos e registrar pistas narrativas. **Recapitular** e **Compartilhar** integram pedidos de teste e decisões do Mestre; uma pista compartilhada passa a ser conhecida pelo destinatário sem virar uma descoberta própria dele.

## Ferramentas e respostas contextuais

As ferramentas do Inventário aparecem na investigação com suas formas de uso e contadores. Formas consumíveis gastam um uso; formas gratuitas continuam disponíveis mesmo com o contador zerado. Quantidade e usos são controles distintos.

O Mestre pode vincular uma informação a uma ferramenta e a uma forma específica. Quando há uma resposta automática configurada, o uso pode revelar essa informação ao Agente que utilizou o equipamento. Informações obtidas somente por ferramentas aparecem em **Descobertas** e continuam conhecidas depois que o equipamento sai do Inventário.

**Respostas situacionais continuam sob julgamento e revelação do Mestre.** Ferramentas sem resposta automática não inventam pistas: o fluxo distingue a ausência de informação nova de uma resposta contextual que depende do Mestre.

## Laboratório Portátil e Rádio Modificado

O **Laboratório Portátil** oferece um desafio de análise com sequências de quatro, cinco ou seis dados e um limite de rerrolagens. A configuração do POI determina o desafio, e o sucesso pode revelar as respostas permanentes vinculadas.

![Laboratório Portátil em execução](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.5.0/docs/release-assets/v0.5.0/laboratory.webp)

O **Rádio Modificado** começa com um teste normal de Tecnologia, cujo resultado remove fragmentos falsos. O jogador organiza a mensagem, descarta trechos e pode restaurá-los antes de concluir. O sucesso exige a mensagem correta e pode revelar as informações vinculadas, mantendo a solução privada.

![Rádio Modificado em execução](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.5.0/docs/release-assets/v0.5.0/radio.webp)

Essas mecânicas exigem a investigação e um Mestre ativo. Quando o POI não tem uma interação especial vinculada, o uso contextual segue para interpretação manual do Mestre.

## Ato II e preparação da mesa

Com o PDF **Agentes Playtest Alpha v1.1** fornecido pelo usuário, o importador configura interações de ferramentas em 12 POIs do Ato II, incluindo os desafios de Laboratório e puzzles de Rádio suportados pelo playtest. Respostas situacionais e casos sem desafio definido permanecem manuais.

O conteúdo dos POIs é extraído do PDF selecionado. A reimportação atualiza pontos gerenciados em lugar, preserva conhecimento, descobertas e associações e permite escolher entre preservar edições do Mestre ou restaurar dados gerenciados. O editor de POIs permite combinar perícias e ferramentas, configurar condições privadas e DTs alternativas.

O Mestre continua selecionando seus próprios arquivos legalmente obtidos. **O sistema não inclui nem distribui PDFs, mapas, tokens, handouts ou outros arquivos oficiais da aventura.**

## Compatibilidade e atualização

- Compatível com **Foundry VTT v14** e atualização direta da **v0.4.5**.
- **Não há nova migração de Mundo nesta release.**
- Cópias de equipamentos já existentes no Inventário não recebem automaticamente as novas formas ou mecânicas das fontes do compêndio; confira suas configurações ao preparar a mesa.

O smoke principal no Foundry foi aprovado pelo usuário, incluindo importação do Ato II, ferramentas padrão, Laboratório, Rádio, respostas manuais e situacionais, consumo, pesquisa e reimportação. Os cenários avançados dos checklists não têm confirmação individual de execução.

O projeto continua **source-available** sob a PolyForm Strict License 1.0.0. Releases públicas até v0.0.22 permanecem sob os termos MIT aplicáveis às cópias já distribuídas.

## Instalação

**Manifest estável:** [system.json](https://github.com/antoniohbmonteiro/ordemparanormal2/releases/latest/download/system.json)

**Pacote:** [ordemparanormal2-v0.5.0.zip](https://github.com/antoniohbmonteiro/ordemparanormal2/releases/download/v0.5.0/ordemparanormal2-v0.5.0.zip)

**Comparar alterações:** [v0.4.5...v0.5.0](https://github.com/antoniohbmonteiro/ordemparanormal2/compare/v0.4.5...v0.5.0)
