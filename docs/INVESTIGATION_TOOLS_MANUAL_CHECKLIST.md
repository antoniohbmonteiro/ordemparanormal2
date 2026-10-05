# Ferramentas e Investigation — checklist manual

**Smoke principal: APROVADO pelo usuário**, conforme [o registro do Ato II](ACT_TWO_TOOLS_MANUAL_CHECKLIST.md). Os cenários detalhados abaixo não receberam confirmação individual e permanecem pendentes. O Codex não abriu Foundry nem executou smoke test. Os testes nativos automatizados usam somente o módulo comum instalado e não substituem esta validação.

Registrar a versão do Foundry/sistema, data, navegadores e resultado de cada item. Usar um mundo de teste ou cópia de segurança. Não testar falhas deliberadas em uma sessão de jogo em andamento.

## Preparação

- [ ] Abrir Foundry v14+ com o sistema atualizado, um GM ativo e dois jogadores em sessões separadas.
- [ ] Criar três World Agents A, B e C, com Tokens vinculados na mesma Scene. Jogador 1 é OWNER de A; jogador 2 é OWNER de B. C permite conferir isolamento. Anotar PV, PD e estado “agiu”.
- [ ] Criar um World POI de teste, privado para o GM, associá-lo à Scene/Region pelo fluxo existente e permitir sua visibilidade aos dois jogadores.
- [ ] Criar uma ferramenta independente de teste com categoria Ferramenta, quantidade 2, usos 3/3 e formas “Observar” (não consumível) e “Analisar” (consumível). Criar outra ferramenta sem contador e com forma não consumível; uma terceira sem formas conserva o comportamento legado.
- [ ] Configurar Informations: I1 tool-only always; I2 mista (Percepção e a mesma ferramenta/forma de I1); I3 always com o mesmo par; I4 situacional com condição privada; I5 ligada à outra forma; I6 sem resposta para a ferramenta usada. Usar textos originais de teste.
- [ ] Iniciar uma Investigation. Jogador 1 controla somente o Token A; jogador 2 controla B. Confirmar que ambos veem a descrição pública, sem conteúdo desconhecido ou condição privada.

## Authoring do GM

- [ ] Adicionar uma Information de perícia e configurar Aptidão, especialização, DT pública/oculta e DT alternativa. Salvar e reabrir. Esperado: valores, ordem e IDs preservados.
- [ ] Adicionar uma forma de descobrir de tipo Ferramenta. Escolher fonte do Mundo e forma válida. Esperado: origem visível para desambiguar nomes, ausência de campos de DT e nenhum consumo configurado no POI.
- [ ] Configurar uma fonte acessível de compêndio e outro World Item com o mesmo nome. Esperado: fontes independentes distinguíveis; o nome não decide correspondência.
- [ ] Trocar a ferramenta no diálogo. Esperado: forma anterior limpa e confirmação indisponível até selecionar uma forma da nova fonte.
- [ ] Trocar tipo Perícia/Ferramenta e cancelar. Esperado: approach armazenado intacto. Confirmar uma troca válida. Esperado: substituição completa do ramo, sem DT em ferramenta.
- [ ] Tentar repetir o mesmo par dentro de I1. Esperado: duplicidade impedida. Repeti-lo em I3. Esperado: permitido.
- [ ] Adicionar/remover approaches mistos. Esperado: último approach não pode ser removido; não existe limite baseado na quantidade de perícias.
- [ ] Renomear fonte e forma sem trocar IDs. Esperado: vínculo preservado. Excluir/recriar a forma. Esperado: referência antiga inválida para o GM, sem apagar Information ou valores armazenados; corrigir explicitamente.
- [ ] Remover/tornar inacessível uma fonte. Esperado: indicação de referência inválida no editor e Investigation GM, sem ocultar a ferramenta embedded do jogador.
- [ ] Usar Revelar em Information tool-only e situacional para A. Esperado: revelação manual funciona e apenas A aprende; nenhum jogador recebe a condição.

## Drops reais e identidade

- [ ] Arrastar compêndio → A e usar a forma configurada. Esperado: correspondência por origem nativa e ID da forma.
- [ ] Arrastar compêndio → Mundo → A. Esperado: mesma identidade canônica do compêndio.
- [ ] Arrastar ferramenta World independente → A. Esperado: descoberta pelo vínculo desse World Item; fonte original intacta.
- [ ] Copiar a ferramenta embedded de A → B. Esperado: origem existente preservada, sem substituição por UUID de A.
- [ ] Renomear ferramenta embedded e forma mantendo IDs. Esperado: descoberta continua correta; card usa apresentação atual.
- [ ] Usar outra ferramenta World independente com nome/dados iguais. Esperado: nenhuma correspondência por aproximação.
- [ ] Usar Equipment antigo sem origem recuperável. Esperado: uso normal e consumo aplicável; descoberta automática ausente, interpretação manual.
- [ ] Reordenar cópias no Inventário em Edit Mode. Esperado: ordem nativa preservada na Investigation; cópias permanecem separadas.

## Escolha, cancelamento e consumo

- [ ] Usar ferramenta sem formas pelo Inventário e Investigation. Esperado: um card legado; nenhum consumo ou descoberta automática.
- [ ] Usar Equipment com uma forma. Esperado: execução direta. Com várias, esperado: diálogo apresenta todas as formas atuais, mesmo sem vínculo com o POI.
- [ ] Cancelar pelo botão, fechar ou pressionar Escape. Esperado: nenhum card, consumo, Knowledge ou Discovery.
- [ ] Executar forma consumível com 3/3. Esperado: 2/3 e exatamente um card com a forma escolhida; quantidade, PV e PD intactos.
- [ ] Zerar usos. Esperado: consumível bloqueada; forma não consumível continua funcionando. Quando todas as formas estiverem bloqueadas, Usar fica indisponível na lista da Investigation.
- [ ] Usar forma consumível sem contador válido. Esperado: configuração inválida, sem pagamento ou card; nenhuma barra/contador artificial na lista.
- [ ] Abrir diálogo e, no GM, alterar/remover a forma ou zerar recurso antes de confirmar. Esperado: revalidação bloqueia execução inválida; nenhum estado antigo é reaplicado.
- [ ] Usar uma forma sem resposta no POI. Esperado: uso e consumo normais, um card, status “Nenhuma informação nova foi descoberta.” e nenhuma informação inventada.
- [ ] Usar pelo Inventário diante de um POI. Esperado: não escolhe contexto automaticamente e não revela Information.

## Feedback após uso na Investigation

- [ ] No GM, preparar um POI com somente uma Information always desconhecida para A vinculada à forma usada. No jogador, abrir a Investigation e usar a ferramenta. Esperado: “1 nova informação descoberta.” no mesmo status de Examinar, com `role="status"`; a pista aparece na tabela de perícias ou em DESCOBERTAS, conforme seus approaches.
- [ ] Preparar outro POI com três Informations always desconhecidas, todas vinculadas ao mesmo par, incluindo uma mista e duas tool-only. Usar com A. Esperado: “3 novas informações descobertas.”, a pista mista na tabela, as duas tool-only em DESCOBERTAS e o contador reduzido em um uso, sem precisar fechar a janela.
- [ ] Repetir o uso quando todas as respostas já forem conhecidas e não houver resposta situacional compatível pendente. Esperado: “Nenhuma informação nova foi descoberta.”; consumo/card normais, sem repetir conteúdo conhecido.
- [ ] Usar ferramenta padrão em POI sem ToolApproach correspondente: “Nenhuma informação nova foi descoberta.”. Com Information situacional compatível ainda desconhecida: “Equipamento utilizado. A resposta contextual pode ser resolvida pelo mestre.”, sem explicar condição ou motivo privado. Laboratório/Armário e Rádio/Ídolo mantêm essa mensagem manual no fallback especial.
- [ ] Em uma janela recém-aberta, cancelar a escolha de Forma de Uso. Esperado: nenhum feedback de sucesso, consumo, card ou descoberta. Confirmar também perda de OWNER, remoção da forma e usos zerados durante o diálogo: erro apropriado, sem substituir por mensagem de zero descobertas.
- [ ] Nas falhas parciais de publicação/descoberta previstas abaixo, conferir o status. Esperado: aviso de uso já executado e etapa não confirmada, sem apresentar sucesso ou “Nenhuma informação nova foi descoberta.”; contador atualizado após consumo. Retentar mantém a proteção contra consumo/card duplicados.
- [ ] Usar pelo Inventário, com a Investigation aberta, e conferir Examinar, rerender, teclado/foco, redimensionamento e scroll. Esperado: Inventário conserva seu feedback próprio, sem feedback contextual na Investigation; Examinar e o componente visual de status continuam funcionando.

## Knowledge, rodada e compartilhamento

- [ ] Usar o par correspondente a I1/I2/I3 com A. Esperado: todas as novas always aprendidas uma vez; I4 situacional não é aprendida automaticamente.
- [ ] Conferir jogador 2 e C. Esperado: Knowledge isolado; ninguém aprende por ser proprietário de outro Agent ou estar na Scene.
- [ ] Repetir o uso já conhecido. Esperado: novo uso normal e consumo aplicável, sem IDs duplicados ou novas descobertas falsas.
- [ ] Conferir PD e estado “agiu” antes/depois. Esperado: ferramenta não altera nenhum dos dois.
- [ ] Conferir I2 na tabela de perícias, sem repetição em DESCOBERTAS; I1/I3 uma vez em DESCOBERTAS, após FERRAMENTAS.
- [ ] Excluir de A a ferramenta usada. Esperado: Information continua conhecida e em DESCOBERTAS.
- [ ] Conferir painel de Scene: I2 sob a primeira SkillApproach; tool-only sob Informações descobertas, sem vínculo de ferramenta.
- [ ] Compartilhar I1 de A para B pelo fluxo existente. Esperado: candidato com referência existente, B aprende somente o conteúdo transferido, C intacto; B não ganha provenance de descoberta própria.
- [ ] Encerrar o run e usar em POI válido com outro Agent que ainda não conhece a resposta. Esperado: Knowledge registrado, sem Discovery de run inativo.
- [ ] Remover vínculo/ocultar POI ou trocar run durante a escolha de uma forma Padrão. Esperado: Equipment segue uso normal; contexto obsoleto impede somente descoberta automática. Laboratório/Rádio revalidam o contexto e podem invalidar a sessão especial.

## Permissões e payload

- [ ] Retirar OWNER do Agent antes da confirmação. Esperado: execução negada, sem pagamento, card ou Knowledge.
- [ ] Usar Agent não participante, POI oculto e uma cópia Equipment pertencente a outro Actor. Esperado: autorização impede acesso indevido; contexto inválido não fornece resposta privada.
- [ ] No navegador do jogador, inspecionar a resposta da query de projeção com as ferramentas de desenvolvimento. Esperado: somente dados públicos, campos mínimos de inventário e conteúdo conhecido; nenhum ToolApproach, UUID configurado no POI, ID desconhecido, condição, contagem oculta ou flag de correspondência.
- [ ] Trocar controle de A para outro Agent elegível durante uma resposta lenta. Esperado: projeção anterior descartada, ferramentas/Knowledge do novo Agent atualizados; confirmação de escolha antiga não retargeta o uso.
- [ ] Sair do GM ativo. Esperado: usuário autorizado continua usando formas Padrão localmente, inclusive consumo; contexto é manual e POI privado não é carregado. Laboratório/Rádio continuam exigindo GM ativo.

## Concorrência e falhas

- [ ] Abrir Inventário e Investigation para A; clicar Usar rapidamente nas duas janelas. Esperado: uma operação em andamento compartilhada; sem pagamento/publicação duplicados.
- [ ] Com dois OWNERS em sessões distintas e último uso disponível, confirmar formas consumíveis simultaneamente. Esperado: somente uma consome/publica; a outra recebe usos insuficientes.
- [ ] Disputar uso e ajuste manual de usos. Esperado: alterações serializadas, sem restauração de valor antigo.
- [ ] Em ambiente de teste, atrasar a resposta até timeout. Retentar na mesma entrada/contexto/autoridade. Esperado: mesmo ID de operação; nenhuma execução local substituta.
- [ ] Simular falha de publicação após consumo. Esperado: aviso distingue uso já executado de falha do card; retentar não consome novamente.
- [ ] Simular falha de escrita do POI após publicação. Esperado: aviso de descoberta pendente; retentar não repete consumo/card.
- [ ] Se a autoridade mudar ou o executor reiniciar em operação inconclusiva, parar e conferir recurso, chat e Knowledge manualmente. Esperado: sem promessa de recuperação automática entre sessões. Após resolver e registrar o estado, recarregar o cliente para limpar a tentativa local pendente antes de um novo uso.

## UI nativa e regressões

- [ ] Nenhuma ferramenta: seção FERRAMENTAS inteira ausente. Várias/cópias: imagem, nome, contador opcional e Usar, sem agrupamento ou filtro por resposta/quantidade/origem.
- [ ] Criar, atualizar e excluir Equipment com a Investigation aberta. Esperado: lista atualiza sem precisar fechar; editar usos reflete o contador.
- [ ] Fechar/reabrir Investigation várias vezes e alterar Items. Esperado: sem listeners duplicados ou janelas fechadas reabrindo.
- [ ] Percorrer botões e diálogos com Tab/Shift+Tab, confirmar com teclado e cancelar. Esperado: foco visível, labels compreensíveis e nenhum clique acidental.
- [ ] Redimensionar, maximizar/restaurar, mover e rolar janelas estreitas/altas. Esperado: controles nativos preservados, listas sem sobreposição, texto quebra e scroll acessível.
- [ ] Testar hover/focus, permissões somente leitura, rerender durante uso e troca de Agent. Esperado: ações seguem autorização e busy state.
- [ ] Testar Examinar, Aptidão, DT pública/oculta/alternativa, revelação manual e Inventário (menu, detalhes, quantidade/uses). Esperado: fluxos existentes preservados.
- [ ] Alterar o Equipment depois de publicar e reabrir chat histórico. Esperado: card antigo mantém conteúdo/apresentação gravados.
- [ ] Reimportar POIs sem edição: sem falso conflito. Acrescentar ToolApproach manual e reimportar: decisão existente preservar/restaurar detecta edição; preservar mantém approach e restaurar repõe o preset atual da revisão 6.

## Registro final

| Campo | Resultado |
|---|---|
| Status | **Smoke principal APROVADO; cenários detalhados sem confirmação individual** |
| Responsável | Usuário |
| Data / Foundry / sistema | Confirmação registrada em 2026-10-05; data de execução e versões não informadas |
| Sessões GM/jogadores | A preencher |
| Itens aprovados/falhas | A preencher |
| Conferências manuais de operações inconclusivas | A preencher |

Somente marcar cada cenário detalhado como concluído depois de sua confirmação pessoal, registrando eventuais falhas.
