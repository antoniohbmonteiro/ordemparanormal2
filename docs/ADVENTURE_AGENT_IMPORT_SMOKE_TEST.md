# Smoke test — Adventure Importer de agentes

Use Foundry v14 em um World de teste com o sistema atualizado. O teste manual de importação ainda precisa ser executado; a sessão local v14.367 abriu a aplicação, mas a seleção dos arquivos foi bloqueada pela permissão da extensão do navegador. Os testes automatizados não substituem este roteiro.

## Preparação

1. Feche o Foundry antes de compilar. Execute `npm run check` no repositório e abra o Foundry novamente.
2. Use o World `Teste Import Mundo Ordem 2`, ou outro World descartável de teste, com o sistema `ordemparanormal2`. Entre como GM ativo.
3. Abra **Importar Aventura** nas Ferramentas do Mestre. Selecione seus arquivos licenciados em `D:/Downloads/import-assets-ordem2/` pelo navegador normal. O PDF e a senha ficam apenas na memória; a senha é solicitada quando necessária.
4. Faça a sequência abaixo em um World inicialmente sem os agentes importados. Assets e handouts anteriores podem existir.

## Scope e reconhecimento

1. Selecione o PDF v1.1 e somente o ZIP do Ato I, analise e clique em **Importar para este Mundo**. Devem existir cinco Actors `agent`: Kênia, Edgar, Alan, Eloisa e Victor.
2. Selecione somente o ZIP do Ato II e importe. Devem ser criados outros cinco: Val, Raven, Antônio, Amanda e Heitor. Os cinco do Ato I permanecem intactos.
3. Selecione ambos os ZIPs e importe. O lote deve ter dez agentes elegíveis e nenhuma duplicação. Repita para verificar rerun sem alterações.
4. Faça também a importação com o PDF v1.0 e a senha fornecida para ele. O mesmo conjunto de presets deve ser usado. Senha incorreta, PDF desconhecido ou leitura malsucedida devem impedir a execução, mesmo com um ZIP válido.
5. Para confirmar que assets antigos não ampliam o scope, deixe ambos os atos armazenados no World e reimporte com apenas um ZIP. Altere antes um agente do outro ato: ele não deve aparecer no diálogo nem sofrer alterações.

## Sheets, imagens e mecânica

Abra as dez sheets. Compare level, máximos de PV/PD, atributos, todas as perícias e as seis especializações com os JSONs em `src/config/adventure-agent-presets/playtest-alpha/`. Na primeira criação, PV/PD atuais devem ser iguais aos máximos. O nome `Eloisa` é intencional, conforme o preset.

Confira o retrato e a textura do prototype token, sem colocar Tokens em Scene. Deve haver exatamente um Profile e uma Occupation por Actor, com as Abilities na ordem do preset. Abra as sheets de Items e faça um Check existente para confirmar que os dados funcionam com a interface normal.

Confira especialmente:

- **Amanda:** uma Avaliação, Olhar Infalível e Foco Mental (Aprimorado). Avaliação usa `flags.ordemparanormal2.profileGrant`, vinculada ao Profile Analista importado; as outras duas usam a marcação direta da importação.
- **Heitor:** o Executor embedded tem apenas o grant `Compendium.ordemparanormal2.abilities.Item.ability000000018`. Há uma Ímpeto (Aprimorado), Incansável e Linha de Tiro; não há Ímpeto base criado pelo importer. O grant da Ability aponta para o mesmo UUID aprimorado, com recurso inicial `0/5`.
- Abra o **Executor no compêndio**, sem alterá-lo: ele continua concedendo o UUID base `Compendium.ordemparanormal2.abilities.Item.ability000000008`. Uma seleção normal desse Executor em um Agent manual deve continuar concedendo Ímpeto base.

Para conferir flags sem alterar documentos, use a inspeção do navegador ou exporte o Actor localmente para leitura. Não publique esses exports.

## Idempotência e campos preservados

1. Renomeie um agente, mude pasta, ownership, sort, accent e configurações do prototype token (nome, vínculo, visão, barras, escala e tint). Consuma PV/PD e um recurso de Ability. Reimporte: esses dados devem permanecer, sem diálogo causado por essas alterações.
2. Adicione Equipment, uma Ability manual e um efeito. Reimporte e verifique que todos permanecem. Uma Ability manual com o mesmo UUID canônico deve satisfazer a referência sem duplicação, marcação de importação ou alteração de seu payload.
3. Em Heitor, adicione manualmente Ímpeto base. Ela deve permanecer e não satisfazer o grant aprimorado.
4. Crie um Actor manual homônimo. Reimporte: ele permanece manual e não é adotado.
5. Exclua apenas um agente importado descartável deste teste e reimporte o ato correspondente: ele deve ser recriado uma única vez.

## Diálogo único do lote

1. Altere dados gerenciados em dois agentes: level/perícia/máximo, retrato, dados de Ability ou seleção de Profile/Occupation. Reimporte seus atos: deve aparecer **um único diálogo**, listando os agentes divergentes.
2. Escolha **Preservar agentes modificados**. Os agentes listados devem permanecer inteiros, inclusive flags e baseline; os demais agentes elegíveis continuam normalmente.
3. Reimporte e escolha **Restaurar dados importados**. Os gerenciados voltam aos presets/fontes atuais; nome, recursos atuais, pasta, ownership, accent, outras configurações de token e Items manuais permanecem. Não há clamp de valores atuais acima do máximo.
4. Altere a presença do recurso opcional de uma Ability gerenciada. Restaurar deve recuperar a estrutura canônica. Se o recurso existir antes e depois, preserve seu atual; se for recriado, use seu inicial canônico.
5. Substitua Profile/Occupation manualmente. Restaurar deve recuperar a seleção importada, sem adotar a provenance da seleção manual. Grants pertencentes a um Profile alheio permanecem preservados.
6. Altere um campo gerenciado e feche o diálogo na próxima execução. Nenhum Actor deve ser escrito nessa etapa; assets e handouts anteriores permanecem.

## Interrupção e recuperação

Em ambiente descartável, interrompa a conexão durante a escrita de Items de um agente. A etapa deve parar, mostrar agente/ato/etapa/progresso confirmado e manter os anteriores completos. O agente iniciado deve ter estado `incomplete`, sem ser apresentado como concluído.

Reconecte e reexecute. O agente incompleto deve entrar no mesmo diálogo único; escolha restaurar e confira recuperação sem duplicação. Para uma falha previsível de preflight, torne um pack canônico indisponível temporariamente no ambiente de teste: devem ocorrer zero escritas de Actors/Items, e a mensagem deve identificar a etapa de agentes.

Com um segundo cliente, altere dados gerenciados de um agente enquanto o primeiro aguarda a decisão do lote. Restaurar a decisão antiga deve parar e exigir rerun. Teste também uma troca do GM ativo e um segundo clique concorrente: nenhuma escrita deve prosseguir sem a autorização atual.

## Aceite

- Nenhuma duplicação ou adoção de homônimo manual.
- Nenhum agente de ato fora do scope atual.
- Nenhuma escrita de Actors/Items por erro previsível do lote.
- Nenhuma escrita em agente que foi preservado.
- Amanda e Heitor com grants/provenance corretos, Executor canônico intacto.
- Estado de jogo, configurações preservadas e Items manuais mantidos.
- Rerun e recuperação de estado incompleto funcionando.
