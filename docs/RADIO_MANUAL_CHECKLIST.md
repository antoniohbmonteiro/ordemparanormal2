# Rádio Modificado — smoke test manual

**Status: smoke principal APROVADO pelo usuário**, conforme [o registro do Ato II](ACT_TWO_TOOLS_MANUAL_CHECKLIST.md). Os cenários detalhados abaixo permanecem sem confirmação individual. O Codex não abriu Foundry nem executou o smoke. Os testes nativos automatizados apenas carregam o módulo common instalado.

## Preparação

- [ ] Fazer backup do mundo de teste, instalar o build desta branch e recarregar os clientes.
- [ ] Criar Agents A e B com Tokens vinculados na mesma Scene. Dar ao jogador OWNER de A, sem acesso ao Item POI privado. Preparar outro proprietário de A e um terceiro jogador sem OWNER.
- [ ] Anotar PV, PD, quantidade e usos de A; preparar Tecnologia e atributos válidos. Para o teste com quatro dados, usar extras situacionais e/ou uma Habilidade já permitida pelo sistema.
- [ ] Criar um POI privado vinculado à Scene, visível ao jogador; iniciar Investigation. Abrir a janela com A controlado pelo mecanismo atual.
- [ ] Importar uma cópia nova do Rádio Modificado: a forma `tune` deve ter Mecânica **Rádio**, mesmo ID e `consumesUse: false`. Uma cópia antiga sem esse campo permanece **Padrão**.
- [ ] Preparar uma fonte World Equipment independente, categoria Ferramenta, com forma Rádio consumível, usos `2 / 3`, e outra forma Padrão. Fazer drops compêndio → Agent, compêndio → World → Agent e World independente → Agent; configurar os approaches com as respectivas fontes canônicas.
- [ ] Criar duas Informations `always` para o mesmo par fonte/forma, uma delas também com Perícia; criar uma Situacional com condição privada. Usar textos de teste originais, sem conteúdo de aventura.

## Authoring — GM

- [ ] Selecionar fonte e forma Rádio: salvar deve exigir configuração. Definir mensagem verdadeira em peças ordenadas e conjuntos falsos. Cada peça pode ser uma palavra, várias palavras ou uma frase inteira.
- [ ] Adicionar/editar/mover/remover peças; conferir prévia e espaços de borda normalizados. Vazio ou somente espaços é inválido; zero falsos é válido; pelo menos uma verdadeira é obrigatória.
- [ ] Repetir uma verdadeira: válido. Repetir seu texto na lista de falsos: inválido, inclusive com espaços de borda. Inserir texto como `<teste>`: deve aparecer como texto escapado.
- [ ] Adicionar outro vínculo do mesmo par: reutilizar o puzzle existente. Editá-lo, cancelar a confirmação e conferir preservação; confirmar e conferir todos os vínculos atualizados juntos.
- [ ] Abrir dois editores do mesmo POI e tentar salvar uma edição antiga depois da outra: impedir sobrescrita de configuração concorrente.
- [ ] Usar o mesmo par em outro POI com outra mensagem: configurações independentes. Trocar Equipment limpa a seleção local da forma; cancelar o editor não salva rascunhos.
- [ ] Renomear Item/forma sem mudar IDs: manter vínculo. Remover/recriar a forma, indisponibilizar fonte ou trocar mecânica: referência inválida visível ao GM, preservando Information/configuração até correção explícita.
- [ ] Reimportar POI gerenciado editado: conferir decisão preservar/restaurar e ausência de falsos conflitos em POIs intactos.

## Início, Tecnologia e recursos — jogador e GM

- [ ] Pelo Inventário, escolher Rádio: bloquear sem consumo, Equipment card, Check ou puzzle. A forma Padrão do mesmo Item continua funcionando.
- [ ] Na Investigation, cancelar escolha de Forma de Uso: nenhum efeito. Escolher Rádio e cancelar o diálogo normal de Tecnologia: nenhum consumo, card, Check, Knowledge ou feedback de sucesso.
- [ ] Confirmar o diálogo: um uso consumível desconta exatamente 1 e publica um Equipment card e um Check normal. Forma gratuita funciona com zero usos. Quantidade, PV e PD permanecem iguais, exceto custos normais de Habilidades explicitamente escolhidas; não marcar rodada.
- [ ] Assim que o puzzle abrir, antes de mover qualquer peça, conferir a faixa de Tecnologia acima da mensagem: `Nenhum conjunto falso foi removido`, `1 conjunto falso removido` ou `N conjuntos falsos removidos`. Repetir usando a ferramenta como GM e como jogador; rerender/retomada conserva uma única faixa com a mesma quantidade, inclusive em blind, sem total ou identificação das peças falsas.
- [ ] Antes de começar o puzzle, conferir também um único aviso curto no chat para GM + OWNERs do Agent, com a quantidade eliminada pela sintonia. Blind roll permite ler esse aviso sem revelar total/dados/snapshot ou quais peças foram removidas. Outro jogador não o recebe; retry/retomada não publica novamente. A faixa da janela e a conclusão privada final continuam presentes.
- [ ] Confirmar Tecnologia fixada e DT ausente; escolher outro atributo, ajustes transitórios e extras/Habilidades permitidos. Conferir total normal com quatro dados, contando somente os três maiores. Não aplicar efeito adicional por crítico, RA ou RB.
- [ ] Com pelo menos cinco falsos, obter/repetir novas tentativas explícitas até conferir os limites: total 6 remove 0; 7 e 9 removem exatamente 2; 10 e 12 removem exatamente 3; 13 remove todos. Registrar o total no card do Check e a quantidade na janela.
- [ ] Repetir com 0, 1 e 2 falsos: faixas 7–9 e 10–12 removem `min(2, n)` e `min(3, n)`; 13+ remove todos. Em remoções parciais, só falsos devem ser retirados e não deve haver reposição.
- [ ] Sem GM ativo: Rádio bloqueado sem fallback local; uso Padrão permanece autorizado normalmente.
- [ ] Zerar usos consumíveis, perder OWNER ou remover a forma durante o diálogo: impedir execução com erro apropriado, sem mensagem de zero descobertas.

## Message modes e privacidade

- [ ] Repetir em público, GM, blind e self, e em modo adicional registrado quando disponível. O Check deve seguir o mesmo comportamento dos Checks normais; self deve chegar ao solicitante, não apenas ao GM executor.
- [ ] Em blind roll, o jogador não vê o resultado pelo card normal. A janela informa apenas Tecnologia e quantidade realmente removida, sem total/dados/snapshot. Consultar/retomar não pode expor esse resultado.
- [ ] Conferir que o aviso da sintonia e a conclusão do puzzle são privados para GM/OWNERS. Um jogador estranho não deve recebê-los. O Equipment card e o Check mantêm seus comportamentos normais.
- [ ] Inspecionar DTOs recebidos/flags da conclusão: sem solução, classificação verdadeiro/falso, índices de authoring, fonte configurada, textos removidos automaticamente, contagem de falsos restantes, IDs de Information ou Check total/dados/snapshot.

## Puzzle e estados A–D

- [ ] A: peças embaralhadas, posições sequenciais, subir/descer/descartar disponíveis nos limites corretos. Não embaralhar palavras dentro de uma frase. Uma ordem correta por acaso é permitida.
- [ ] B: mover troca somente vizinhas. Descartar envia ao final da lista de descartadas; restaurar envia ao fim da mensagem. Peças retiradas pela Tecnologia não aparecem nem podem ser restauradas.
- [ ] Operações intermediárias não consomem, não rolam e não indicam quais peças são corretas. Finalizar vazio/incompleto deve ser permitido e falhar.
- [ ] C: conservar todas as verdadeiras, nenhum falso e ordem certa; conferir sucesso, mensagem reconstruída, comandos bloqueados e somente Fechar. Verdadeiras idênticas devem ser intercambiáveis.
- [ ] D: manter um falso ou errar a ordem; conferir falha, comandos bloqueados e somente Fechar, sem solução nem indicação de quais peças estavam erradas.
- [ ] Após falha, iniciar novo uso explícito: novo Check e novo puzzle. Fechar/consultar/retomar uma tentativa não gera nova rolagem ou novo consumo.

## Knowledge, feedback e histórico

- [ ] Acertar com uma e várias Informations elegíveis: A aprende, B e demais Agents permanecem isolados. Conferir status existente `1 nova informação descoberta.` / `N novas informações descobertas.` e atualização de perícias, DESCOBERTAS, usos e projeções.
- [ ] Acertar quando todas já são conhecidas e não há resposta situacional compatível pendente: `Nenhuma informação nova foi descoberta.`. Se ainda houver vínculo situacional compatível desconhecido, esperar `Equipamento utilizado. A resposta contextual pode ser resolvida pelo mestre.`, sem revelar condição privada. Errar produz zero descobertas.
- [ ] Vínculo especial presente com configuração ausente, inválida ou conflitante: impedir início antes do uso. Sem vínculo especial no contexto válido, esperar uso contextual manual sem Check/puzzle, como no Ídolo. Padrão no embedded nunca revela vínculo Rádio automaticamente.
- [ ] Compartilhar pelo fluxo atual: receptor aprende somente o que foi compartilhado; outros permanecem isolados. Situacionais continuam com Revelar manual do GM.
- [ ] Preparar sem run ativo: sucesso escreve Knowledge sem Discovery. Encerrar/trocar o run durante a tentativa invalida; não conceder novas pistas.
- [ ] Adicionar Information durante a tentativa: não entra na concessão congelada. Renomear Item/forma não altera dados; editar puzzle, origem, vínculo ou permissão invalida antes da concessão.
- [ ] Conferir um único Check e uma única conclusão por operação, inclusive cancelada depois de iniciada. Alterar posteriormente Actor, Item e POI: cards históricos mantêm snapshots; conclusão não replica Check blind nem solução.

## Cancelamento, concorrência e retomada

- [ ] Fechar antes da confirmação do Check: gratuito. Fechar depois: cancelar sem descoberta/refund; registrar conclusão cancelada. Fechar após sucesso não desfaz Knowledge.
- [ ] Fechar Investigation ou trocar Agent/contexto durante diálogo/puzzle: cancelar sessão anterior, fechar diálogo pendente e descartar respostas atrasadas.
- [ ] Com duas janelas/proprietários, disputar o último uso: uma sessão ativa e um pagamento; outra operação recebe ocupado. Conferir bloqueio também entre Rádio e Laboratório no mesmo Equipment.
- [ ] Ajustar manualmente usos durante início/puzzle: ajuste e consumo serializados, sem sobrescrita nem novo pagamento ao retentar.
- [ ] Simular perda transitória de resposta sem reiniciar o GM; retentar o mesmo comando: não repetir consumo, Check, sorteio, publicação nem concessão. Comandos divergentes/revisão antiga devem ser rejeitados.
- [ ] Recarregar somente o cliente durante puzzle: reabrir mesmo Agent/POI e recuperar tokens, ordem, descartes e remoções, sem novo Check. Etapa pendente recupera o mesmo comando.
- [ ] Falha parcial de publicação/concessão deve manter aviso distinto, sem feedback de zero nem repetição das etapas confirmadas. Pagamento/rolagem ambíguos exigem conferência manual.
- [ ] Reiniciar/substituir autoridade: não reconstruir do cliente/chat, não rerrolar nem executar fallback; conferir manualmente antes de uma nova tentativa.

## Interface e regressão

- [ ] Conferir os quatro frames aprovados, largura inicial aproximada de 520 px, cabeçalho/controles nativos, cores e espaçamento. Na linha de Tecnologia, omitir total ilustrativo do Figma.
- [ ] Tab/Shift+Tab navegam; Enter/Espaço acionam botões. Foco acompanha a peça após mover e passa ao controle correspondente após descartar/restaurar. Comandos em andamento ficam bloqueados.
- [ ] Testar frases longas, redimensionamento e scroll; controles não ficam inacessíveis. Confirmar Escape/fechamento nativo e ausência de listeners/janelas órfãs.
- [ ] Repetir Laboratório já validado (início/rerrolagem por posição/cancelamento/sucesso) e Equipment Padrão/Inventário; conferir Examinar, Aptidão, reveal manual e compartilhamento sem regressão.

Registrar versão/build, ambiente, clientes, passos executados e evidências antes de aprovar individualmente os cenários detalhados pendentes.
