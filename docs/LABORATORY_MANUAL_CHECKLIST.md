# Laboratório Portátil — smoke test manual

**Status: PENDENTE.** Executar pessoalmente no Foundry v14 com GM e jogador em clientes separados. O Codex não abriu Foundry nem executou este checklist. Os testes nativos automatizados carregam somente o módulo common instalado.

## Preparação

- [ ] Fazer backup do mundo de teste; usar a versão compilada desta branch e recarregar ambos os clientes.
- [ ] Criar dois Agents distintos com Tokens vinculados na mesma Scene. O jogador deve ser OWNER somente do Agent A. Preparar um segundo proprietário de A para concorrência.
- [ ] Em A, configurar Mente d6 e Aptidão/Exatas d8. Manter PV, PD e quantidade anotados para comparação.
- [ ] Importar uma cópia nova da fonte Laboratório Portátil. Conferir forma `analyze`, Mecânica **Laboratório**, `consumesUse: false`. Uma cópia antiga sem o campo deve continuar **Padrão** até edição explícita.
- [ ] Criar também uma fonte World Equipment independente, categoria **Ferramenta**, com forma Laboratório consumível e contador `2 / 3`. Adicionar uma segunda forma padrão não consumível para testar escolha/cancelamento.
- [ ] Criar um World POI privado, vincular à Scene e torná-lo visível ao jogador. Iniciar Investigation e abrir sua janela pelo jogador com A controlado.
- [ ] No POI, criar duas Informations `always` com o mesmo par fonte + forma Laboratório, uma delas também com approach de Perícia. Criar uma terceira Information Situacional com o mesmo par. Usar textos de teste curtos como “Resultado A/B/C”.

## Authoring e referências — GM

- [ ] Selecionar a fonte e forma Laboratório no approach: **Salvar** deve ficar indisponível até escolher 4, 5 ou 6 dados. Não deve surgir DT no ramo ferramenta.
- [ ] Adicionar o mesmo par em outra Information: reutilizar o comprimento configurado. Editar para outro comprimento, cancelar a confirmação e conferir que nada mudou; confirmar e conferir atualização de todos os vínculos daquele par em uma escrita.
- [ ] Configurar outro POI com outro comprimento para o mesmo par: os POIs devem permanecer independentes.
- [ ] Alternar Perícia/Ferramenta e fonte/forma. Trocar fonte limpa a forma local; salvar só funciona com par válido. Perícia mantém os controles anteriores.
- [ ] Renomear a fonte e forma, preservando IDs: vínculo válido. Remover/recriar a forma com outro ID: referência inválida visível ao GM, sem apagar a Information.
- [ ] Trocar a mecânica da fonte para Padrão: referência Laboratório deve ficar inválida. Trocar somente o embedded para Padrão: uso padrão não descobre as Informations configuradas como Laboratório.
- [ ] Mudar a categoria do Equipment: o seletor Mecânica continua visível; uma execução Laboratório fora de categoria ferramenta é bloqueada antes do consumo.
- [ ] Reimportar o POI gerenciado após edição manual de configuração: confirmar decisão preservar/restaurar, sem conflito em POIs intactos.

## Drops e execução — GM e jogador

- [ ] Conferir drops reais compêndio → Agent, compêndio → World → Agent e World independente → Agent. A forma atual do embedded governa a execução; renomeações não rompem origem/ID.
- [ ] Pelo Inventário, selecionar Laboratório: receber orientação para usar Investigation, sem consumo, card ou sessão. Uma forma padrão do mesmo Item continua com seu fluxo normal.
- [ ] Na Investigation, abrir escolha de formas e cancelar: sem consumo, card, descoberta ou feedback de sucesso. Escolher Laboratório e conferir abertura da janela nativa de aproximadamente 520 px.
- [ ] Com comprimento 4, Exatas d8 e Mente d6, conferir dados d4/d6/d8/d8 e saldo inicial 3. Repetir comprimentos 5/6 e tetos d4/d6/d10/d12: a escala começa em d4 e repete o teto; nunca aparece d20 na sequência.
- [ ] Consumível: iniciar uma análise paga exatamente um uso e publica o card normal uma vez. Forma gratuita continua disponível com saldo de usos zero. Com zero usos consumíveis, recurso ausente ou forma removida antes do início, receber erro sem execução.
- [ ] Fechar uma janela antes do comando de início concluir, em condição de rede lenta, e conferir com o GM a ordem aceita: cancelamento anterior ao início não paga; início anterior ao cancelamento mantém o pagamento. Não presumir reembolso por uma resposta atrasada.

## Sequência e janela — jogador

- [ ] Tab/Shift+Tab navegam entre dados e ações; Espaço seleciona/desmarca. Foco, seleção e quebra são estados visualmente distintos. Foco deve retornar após rerender.
- [ ] Selecionar dois dados e rerrolar: saldo reduz exatamente 2, somente esses resultados mudam e podem diminuir. Seleção é limpa após confirmação.
- [ ] Selecionar mais dados que o saldo: Rerrolar indisponível. Saldo zero bloqueia rerrolagem e mantém Finalizar disponível.
- [ ] Conferir igualdade como válida. Somente a posição posterior em cada comparação inválida fica marcada como quebra; resumo informa as posições corretas.
- [ ] Finalizar sequência válida: sucesso confirmado, dados bloqueados, somente Fechar. Finalizar sequência quebrada, mesmo com saldo restante: falha confirmada, quebras mantidas, somente Fechar.
- [ ] Durante carregamento/comando, controles bloqueados. Em falha parcial/timeout, Tentar novamente retoma a mesma etapa; não deve aparecer sucesso ou zero descobertas prematuramente.
- [ ] Redimensionar para largura estreita e altura pequena, incluindo seis dados. Conferir scroll, foco visível, legibilidade, controles de minimizar/fechar e ausência de recorte das ações.

## Knowledge, feedback e histórico — GM e jogador

- [ ] Em sucesso com duas Informations desconhecidas, conferir `2 novas informações descobertas.` no status existente. A Information mista aparece na tabela; a tool-only aparece em **DESCOBERTAS**; usos e demais projeções atualizam juntos.
- [ ] Revelar uma das pistas previamente e repetir sucesso: `1 nova informação descoberta.`. Repetir quando todas já conhecidas: `Nenhuma informação nova foi descoberta.`.
- [ ] Finalizar sequência quebrada: zero descobertas. Situacional continua desconhecida até revelação manual; não deve aparecer motivo técnico de configuração ou condição privada no jogador.
- [ ] Somente A aprende. B e outros Agents não recebem Knowledge; compartilhar uma pista pelo fluxo existente concede só ao receptor escolhido.
- [ ] Encerrar o run antes de preparar outra análise e testar sucesso com contexto sem run: apenas Knowledge, sem Discovery daquele run. Encerrar um run durante análise existente invalida a sessão e não concede novas pistas.
- [ ] Adicionar Information ao par durante o desafio: ela não entra na concessão da tentativa iniciada. Remover uma pista ou torná-la Situacional: ela não é concedida.
- [ ] Fechar depois do início: sem Knowledge, sem reembolso, um resultado de análise cancelada. Fechar após conclusão confirmada não desfaz a descoberta.
- [ ] Conferir um card normal e um único card de resultado por análise iniciada. Resultado é privado para GM/OWNERS, com dados, rerrolagens, desfecho e Rolls; não inclui conteúdo desconhecido, IDs privados nem fonte configurada.
- [ ] Alterar posteriormente nome, Mente, Exatas, forma e pistas: o card histórico mantém os valores registrados da análise.

## Concorrência, alterações e recuperação — GM e jogador

- [ ] Usar a mesma ferramenta em duas janelas/clientes/proprietários: uma sessão fica ativa; outra tentativa recebe ocupado. Com um último uso, somente uma execução paga.
- [ ] Ajustar usos manualmente durante a sessão: atualização serializada, sem segundo pagamento. Mudar Mente/Exatas depois do início não muda dados nem saldo capturados.
- [ ] Remover Equipment/forma, mudar mecânica/comprimento/origem, ocultar/desvincular POI ou revogar OWNER durante análise: próxima ação invalida/impede conclusão, sem pistas novas.
- [ ] Trocar Agent, contexto de Scene/POI ou fechar Investigation: sessão anterior é cancelada e respostas tardias não substituem o feedback do novo contexto.
- [ ] Provocar timeout/retry controlado: mesmo comando retorna resultado já confirmado, sem nova rolagem, consumo, card ou concessão. Não executar uma segunda tentativa local para substituir resposta perdida.
- [ ] Conferir cancelamento e Finalizar concorrentes: a ordem confirmada pelo GM prevalece; cancelamento anterior à concessão não descobre, conclusão confirmada não é desfeita.
- [ ] Em falhas parciais de publicação/descoberta, conferir recurso/chat/Knowledge com GM antes de retry. Resultado deve distinguir a etapa pendente e preservar contagem já concedida.
- [ ] Trocar GM ativo ou reiniciar durante uma tentativa inconclusiva: exigir conferência manual; nenhuma reconstrução pelo cliente. Reconexão com a mesma autoridade consulta a sessão existente.
- [ ] Sem GM ativo, Laboratório bloqueado. Ferramentas padrão mantêm fallback local autorizado, sem acessar POI privado.

Registrar data, versão instalada, casos executados e observações antes de mudar o status de **PENDENTE**.
