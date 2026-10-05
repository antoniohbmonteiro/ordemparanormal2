# Ferramentas nos POIs do Ato II — smoke manual

**Status: smoke principal APROVADO pelo usuário no Foundry. Checks avançados sem confirmação individual permanecem PENDENTES.**

## Registro da validação

Confirmação registrada em **2026-10-05** para a branch `feat/poi-investigation`. O usuário executou o smoke e informou aprovação dos fluxos abaixo. O Codex não abriu Foundry nem executou o smoke.

- [x] Importação do Ato II.
- [x] Ferramentas padrão.
- [x] Laboratório.
- [x] Rádio.
- [x] Fallbacks manuais.
- [x] Respostas situational relevantes.
- [x] Consumo de usos.
- [x] Pesquisa de POIs.
- [x] Reimportação do Ato II sem duplicação ou conflito inesperado.

A data exata de execução, versões do Foundry/sistema, composição dos clientes e evidências por cenário não foram informadas. A aprovação acima registra os fluxos confirmados, sem afirmar que cada passo detalhado deste documento foi executado.

**Checks avançados ainda sem confirmação:** contagens/configurações individuais de todos os POIs; authoring inválido e alterações durante sessão; todos os message modes e inspeção de payload blind; concorrência, timeout/retry e falhas parciais; ausência de GM e perda de permissão; isolamento/compartilhamento e run inativo; preservar/restaurar edições; teclado/foco, redimensionamento/scroll e regressões de Ato I/v1.0/Sobreviventes. Os passos abaixo permanecem como roteiro dessas conferências, sem aprovação individual presumida.

## Preparação

- Usar Foundry v14 e o PDF Agentes Playtest Alpha v1.1 reconhecido pelo importer, com os arquivos de aventura necessários.
- Manter os World POIs privados para o GM, associar os POIs de teste à Scene e torná-los visíveis pela Investigation.
- Usar um Agent participante, controlado pelo jogador com OWNER. Adicionar as ferramentas das fontes atuais do compêndio; cópias antigas não recebem mecânicas/origem automaticamente.
- Anotar Knowledge, Discovery, quantidade, PD e usos antes dos testes. Preparar uma cópia da campanha para conferir preservar/restaurar.

## 1. Importação e authoring

- Importar Ato II. Conferir os 12 POIs: Pertences de Eloísa/Victor, Faca, Ídolo, Altar, Símbolo no Teto, Molho de Chaves, Depósito B, Rabiscos, Armário, Computador e Freezer.
- Esperar 32 vínculos, 34 novas Informations (29 always, 5 situational), depois das Informations antigas. Freezer continua `actTwo.map.25`.
- Conferir Laboratório: Faca e Chaves **4**; Eloísa, Altar e Freezer **5**; Ídolo **6**, com resposta manual após quebra.
- Conferir os três Rádios: Altar **8 verdadeiras/7 falsas**, Depósito B **6/7**, Computador **7/5**. No Altar, a peça correta é `SUA FILHA,`. Armário/Laboratório e Ídolo/Rádio não possuem vínculo especial.
- Conferir resumos curtos, condições privadas e referências de handout/áudio no contexto GM. Não deve haver entrega automática de mídia, Laser ou Informations paranormais para leituras normais.

## 2. Uso padrão e descoberta

- Usar Câmera no Altar, Infravermelho no Armário e EMF no Ídolo/Freezer. Esperar as respectivas respostas resumidas; os padrões EMF são textuais `1–1–3`/`1–1–1`.
- Usar UV em Victor/Rabiscos/Freezer e Pó nos Rabiscos. Esperar uma unidade a menos quando a forma consumível tiver usos, com descoberta automática apenas das respostas always.
- Usar `illuminate` nos mesmos POIs. Não deve conceder a resposta de `ultraviolet-burst`.
- Conferir feedback, DESCOBERTAS e usos atualizados; somente o Agent usuário aprende. Repetir uma resposta conhecida não cria Discovery duplicada. Quantidade, PD e rodada não mudam por si mesmos.

## 3. Fallback contextual

- Usar Laboratório no Armário, Rádio no Ídolo e ambos em um POI sem resposta especial.
- Esperar apenas o card normal com a forma usada e o status **“Equipamento utilizado. A resposta contextual pode ser resolvida pelo mestre.”** Não há janela de desafio, Check de Tecnologia, aviso de falsos removidos, conclusão especial ou Knowledge novo. As formas das fontes atuais não consomem usos.
- Conferir o bloqueio pelo Inventário e sem GM ativo. Uma forma explicitamente consumível continua cobrando somente um uso normal.

## 4. Minigames, erros e privacidade

- Resolver Laboratório na Faca e Rádio no Computador: esperar os desafios existentes, sucesso concedendo somente respostas always, falha sem pistas e cancelamento preservando as regras de custo atuais.
- Usar Check blind no Rádio. A janela/aviso/conclusão exibem somente a quantidade removida e o estado permitido; o Check mantém seu message mode, sem total/dados/snapshot vazando para OWNERS.
- Configurar um vínculo especial sem configuração, com comprimento inválido ou conflitante. Esperar erro antes de uso/publicação; não deve cair em fallback.
- Remover configuração durante uma sessão, tentar retry e abrir duas janelas: a sessão existente deve invalidar ou retomar conforme seu estado, sem virar uso manual nem pagar/publicar novamente. Conferir teclado/foco e scroll nos desafios existentes.

## 5. Respostas manuais e compartilhamento

- Faca: sangue de Edgar apenas na variante de três jogadores; Ídolo: análise após quebra, escurecimento com interior visível e termômetro dirigido ao interior; Freezer: frio somente após desligar e verificar persistência. O GM deve revelar essas cinco Informations manualmente.
- Percepção com Câmera no Depósito B e Ocultismo com Pó nos Rabiscos mantêm suas Informations situacionais de perícia.
- Conferir que condições/configurações e conteúdo desconhecido não aparecem ao jogador. Compartilhar uma descoberta no fluxo atual: somente o receptor passa a conhecê-la; demais Agents permanecem isolados. Sem run ativo, apenas Knowledge é registrado.

## 6. Reimportação e regressão

- Reimportar sem editar: esperar idempotência, mesmo World Item e nenhum conflito falso.
- Editar um resumo/puzzle e testar **Preservar** e depois **Restaurar**: preservar mantém a edição; restaurar aplica a revisão 6. Knowledge, Discovery, visibilidade, associações e alterações de nome/imagem/organização continuam preservados.
- Conferir Ato I, Agentes v1.0, Sobreviventes, perícias e DT alternativa; essas fontes e fluxos mantêm o comportamento anterior.

## 7. Pesquisa de POIs

- Como GM e jogador, pesquisar pelo nome na lista principal; `idolo` deve encontrar `Ídolo`. Conferir ausência de resultado com estado específico de pesquisa e limpar para restaurar a lista.
- Conferir ordem, expansão e foco durante digitação/rerender; redimensionar e rolar o painel. A aprovação geral da pesquisa não confirma individualmente essas variações.

Nas próximas conferências, registrar data, versão do Foundry/sistema, cenários efetivamente executados e divergências. Manter os checks avançados como pendentes até confirmação específica.
