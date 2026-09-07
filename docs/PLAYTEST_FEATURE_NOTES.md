# Playtest Feature Notes

Notas de design baseadas no Playtest Alpha atual.

Estas decisões são provisórias e devem ser revisitadas quando novas
versões públicas das regras forem disponibilizadas.

## Princípio

Priorizar as regras concretas do Playtest atual.

Evitar abstrações genéricas para um produto final que ainda não conhecemos.

Não portar mecânicas de Ordem Paranormal RPG anterior por suposição.

---

## Prioridades atuais

### 1. Extra Dice

Prioridade imediata.

Checks devem suportar dados adicionais reais, como:

- +d4;
- +d6;
- +d8;
- +d10;
- +d12.

Esses dados devem preservar provenance/source.

Respeitar os limites confirmados do Playtest:
- máximo de 4 dados rolados;
- máximo de 3 dados contribuindo para o resultado.

Uma explicação pública posterior confirmou que, quando quatro dados forem
rolados, os três maiores resultados devem ser somados. A implementação já
seguia essa regra e não precisou de alteração mecânica.

RA, RB, crítico e falha crítica consideram todos os dados efetivamente
rolados, inclusive o quarto dado que não contribui para o total.

---

## 2. Contextual Ability options in Checks

Automatizar as Habilidades concretas do Playtest conforme necessário,
sem criar por enquanto um AbilityEffect engine genérico.

Exemplo:

Foco Mental:
- em um teste de Mente;
- oferecer no Check Dialog:
  "Gastar 2 PD → +d4";
- validar PD;
- aplicar o dado;
- consumir o custo;
- registrar a origem no resultado.

Não hardcodar somente pelo nome visual quando houver uma referência
canônica melhor disponível.

Adicionar suporte incremental conforme cada Habilidade concreta exigir.

---

## 3. Occupations

Ocupação deixa de ser texto editável no Agent e passa a ter um lifecycle reutilizável próprio.

Direção atual:
- `occupation` como Item reutilizável;
- no máximo uma Occupation embedded por Agent;
- DataModel inicialmente vazio, usando somente nome e imagem nativos;
- seleção por world Items ou compêndios visíveis;
- compêndio do sistema com as oito Ocupações confirmadas, contendo somente nomes e dados vazios;
- nenhuma resolução ou comportamento por nome;
- nenhuma concessão de Ability, provenance, bônus ou automação nesta etapa.

As Abilities hoje organizadas sob a pasta editorial "Ocupações" não são propriedade de Occupation Items e não estabelecem grants. Qualquer relação futura depende de regra confirmada e de uma mudança explícita do modelo.

---

## 4. Narrative Scene Lifecycle

"Scene" de regra não deve ser assumida como equivalente a um
`foundry.documents.Scene`.

The first implemented lifecycle represents the narrative scene determined by the GM with only:

- a generated ID;
- a GM-provided name;
- one world-persisted active scene;
- explicit start and end management through the GM-only **Narrativa** tab in the right sidebar;
- a strictly informational name HUD shared by all clients.

Starting rounds and advancing rounds remain future work.

Cada cena narrativa recebe um identificador.

Esse identificador pode ser usado para regras como:
- uma vez por cena;
- efeito até o fim da cena;
- controle de usos já realizados.

Preferir comparar o ID da cena atual em vez de executar grandes rotinas
de reset em todos os Documents.

Não automatizar troca de cena narrativa ao trocar mapa/canvas do Foundry. The
implemented lifecycle does not read or update Foundry Scene Documents, Canvas,
or Combat state.

The right-sidebar registration is intentionally isolated behind one Foundry v14
adapter. It uses the compatibility-sensitive `Sidebar.TABS` + `CONFIG.ui`
integration because v14 does not provide a formal `registerSidebarTab()` API.

---

## 5. Investigation / Points of Interest

Investigação deve ser uma feature de primeira classe do sistema.

Direção atual: representar Pontos de Interesse de maneira estruturada.

Um POI precisa conseguir representar pelo menos:

- nome;
- descrição visível;
- contexto privado do GM;
- informações associadas a perícia e DT;
- estado de informações já descobertas.

### Status: fundação implementada

O Item `pointOfInterest` já existe como **definição reutilizável, autorada pelo GM**:

- `name`/`img` nativos;
- `system.publicDescription` e `system.gmContext` (rich text, declarados como `htmlFields`);
- `system.information[]` com `id` estável, `skill` (chave canônica do registro), `difficulty` (inteiro ≥ 1, sem máximo), `showDifficultyToPlayers` (boolean, inicial `false`) e `content`.

Cada `information.id` é gerado uma vez, na criação da linha, e permanece estável em edição e remoção — é a identidade que a execução futura referenciará (ex.: `discoveredInformationIds`).

Não existe no modelo ativo configuração de perícia listada, sugerida ou oculta. A lista apresentada na Investigation Application é derivada diretamente de `information[]`: uma ou mais informações com a mesma `skill` produzem uma única linha, na ordem da primeira ocorrência.

A Investigation Application base já está implementada e preserva a identidade do placement (`sceneId + regionId`). Ela usa cabeçalho nativo do Foundry e mostra imagem, nome, descrição pública e a tabela `Perícia | DT | Examinar | Informação`. `Examinar` permanece desabilitado, `Outra perícia...` pode ser exibida desabilitada e a coluna Informação permanece no estado neutro `Sem informações para exibir`.

Ainda **não** implementado: checks de Examinar; revelação de informações; consumo de PD; estado de informações descobertas; vínculo com Narrative Scene; condições de desbloqueio; perícias secretas; automação para jogadores; compêndio de POIs.

### Boundary de privacidade

A ItemSheet do POI é ferramenta de autoria do GM. O branch de `_prepareContext` que oculta `gmContext` e `information` de não-GM é uma boundary de **apresentação**, não de transporte seguro: os POIs permanecem com ownership GM-only e um cliente com acesso ao Item ainda poderia inspecionar `item.system`.

A Investigation Application não entrega o Item bruto ao jogador. A projeção sanitizada é criada no lado do GM por `CONFIG.queries`, usando o usuário identificado pelo contexto da query e revalidando associação e autorização de reveal. Ela contém somente nome, descrição pública enriquecida com `secrets: false`, caminho/URL de `Item.img` e linhas derivadas de perícia. Para cada skill, envia DTs públicas distintas e ordenadas e um único booleano indicando a existência de DT oculta. Nunca envia valor de DT oculta, `information.content`, `information.id`, `gmContext`, UUID do Item ou o Item bruto. O jogador não resolve o Item.

Exemplo conceitual:

Mesa do escritório

Percepção — DT 6 → informação A
Percepção — DT 8 → informação B
Crime      — DT 10 → informação C

### Decisões adiadas

Os pontos abaixo registram direção futura e **não fazem parte do comportamento ou do modelo ativo**:

1. A autoria poderá evoluir para blocos por skill: um botão `Adicionar perícia`, uma skill configurada como bloco/tag e uma ou mais `information[]` adicionadas ou removidas dentro desse bloco. A ItemSheet atual continua trabalhando diretamente com linhas de informação.
2. Poderá existir uma separação entre skill existente no POI e skill sugerida/mostrada pelo GM ao jogador, permitindo mostrar todas, algumas ou nenhuma como dica. Essa configuração não existe no modelo ativo atual.
3. `Outra perícia...` poderá permitir a tentativa de uma skill não sugerida. A resposta ao cliente não poderá revelar se uma skill escondida possui informações; o julgamento narrativo permanece com o GM.
4. No MVP futuro de `Examinar`, o player escolherá uma perícia, usará o Check Engine e publicará o resultado no chat. Inicialmente o sistema não precisa comparar automaticamente resultado e DT: o GM decidirá manualmente quais informações revelar. Comparação automática, reveal e PD poderão vir depois.
5. Uma Investigation Application futura do GM mostrará todas as informações, DTs e conteúdos e terá a ação manual `Revelar`. O player continuará vendo somente a projeção sanitizada e as informações efetivamente reveladas.
6. O estado de informação descoberta pertence ao placement/investigação, não ao Item canônico. A persistência ainda será definida; conteúdo secreto não deve ser armazenado em Region flags replicadas aos players.
7. `Interagir` permanece uma ação de RP e não precisa de botão. `Recapitular`, `Compartilhar` e Habilidades/Itens genéricos continuam fora da POI Application por enquanto.

Não automatizar decisões narrativas que pertencem ao GM e não escolher Scene flags, Items, Regions ou outro mecanismo de persistência apenas por conveniência antes do Plan específico da feature.

---

## 6. Help

Ajuda deve preservar a autoridade narrativa do GM.

Fluxo desejado:

1. personagem anuncia/solicita um teste;
2. outro jogador oferece Ajuda;
3. sistema exige uma perícia elegível pelo requisito objetivo;
4. jogador escolhe a perícia e pode explicar como está ajudando;
5. GM aprova ou rejeita a proposta;
6. somente após aprovação o bônus entra no teste;
7. o resultado registra provenance da Ajuda.

O sistema pode determinar automaticamente o bônus da perícia usada:

- d6/d8 → +1 step;
- d10/d12 → +2 steps;

conforme a regra atual do Playtest.

O sistema NÃO decide automaticamente se a perícia escolhida faz sentido
narrativamente. Essa decisão pertence ao GM.

Não permitir que um jogador injete Ajuda unilateralmente em um teste.

Ajuda deve acontecer antes da rolagem.

Enquanto não houver controle de ações/rodadas, apenas informar o custo
de ação quando aplicável, sem tentar controlar economia de ações.

### Mentoria

Mentoria deverá futuramente integrar o mesmo fluxo de Ajuda, adicionando
seu comportamento específico em vez de criar um workflow separado.

### Open question

Ainda confirmar pelas regras se múltiplos personagens podem acumular
Ajuda no mesmo teste.

Não inventar stacking até isso estar confirmado.

---

## 7. Opposed Checks

Teste Oposto é um fluxo separado de Ajuda.

Direção:

- dois participantes;
- cada participante faz seu próprio Check;
- comparar os resultados;
- maior resultado vence;
- apresentar ambos em um resultado/card coordenado.

Nome interno possível: `OpposedCheck`.
Texto visual: `Teste Oposto`.

Não antecipar regras de empate sem confirmação do Playtest.

---

## 8. Inventory / Equipment / Tools

### Status: foundation implemented

A fundação de Inventory + Equipment já foi implementada no milestone público 0.0.22:

- `equipment` como Item reutilizável;
- categorias estruturais `general`, `weapon` e `tool`;
- descrição e `uses` opcional pertencentes ao Equipment;
- Inventory tab no Agent;
- Equipment embedded como Item normal do Agent;
- compêndio `Equipamentos` com a arma e as Ferramentas da Ordo confirmadas no Playtest;
- sem automação específica das ferramentas nesta etapa.

`quantity` / stacks permanece como follow-up curto do Inventory e não deve fazer merge automático de Items iguais no drop.

Ferramentas de investigação devem conseguir participar dos POIs quando
o Playtest fornecer leituras ou interações específicas.

Não criar um engine genérico de Item Effects somente para automatizar ferramentas.
Adicionar comportamento incrementalmente quando uma mecânica concreta exigir.

---

## 9. Semantic Effects / ActiveEffect UX

Algumas regras confirmadas ou fortemente observadas nas fichas sugerem alterações persistentes ou temporárias em dados do Agent. A direção futura é oferecer uma camada semântica pequena e reutilizável, sem expor paths técnicos de Active Effect ao usuário e sem antecipar uma DSL arbitrária de efeitos.

### Princípios

- Foundry Active Effects podem ser usados como infraestrutura nativa de persistência, ativação, duração e drag-and-drop quando fizerem sentido para o lifecycle da alteração;
- a UX normal do sistema não deve exigir conhecimento de paths como `system.skills.*`;
- alvos devem ser apresentados por identidade canônica e localizada, como uma perícia ou atributo conhecido pelo sistema;
- separar **selection rule** de **effect operation**;
- primeiro resolver o que o usuário pode escolher; depois aplicar a operação concreta à escolha;
- novas operações devem surgir apenas quando uma mecânica confirmada realmente precisar delas;
- a mesma primitive pode ser reutilizada por Ability, Equipment, preset de Active Effect ou outra fonte quando a regra for semanticamente a mesma;
- não hardcodar comportamento somente pelo nome visual da Ability quando houver uma referência canônica melhor.

### Primeiro selection pattern candidato

Escolher exatamente uma perícia filtrada pelo `baseAttribute` canônico do registro de perícias.

Filtros inicialmente úteis:

- `mind`;
- `physical`;
- `emotion`.

A lista elegível deve vir do skill registry, nunca de uma lista duplicada/hardcoded de nomes.

Exemplo conceitual:

- selection: `1 skill where baseAttribute = mind`;
- operation: definir o dado da perícia escolhida como `d6`.

### Primeiras operações candidatas

`setSkillDie(d6)` e `increaseAttributeStep(1)` representam classes de regra diferentes e não devem ser colapsadas em um modificador genérico só porque ambas podem terminar em uma mudança de dado.

Exemplos observados nas fichas atuais:

- Conhecimento Técnico sugere escolher uma perícia de Mente e defini-la como `d6`;
- Esforço e Suor sugere escolher uma perícia de Físico e defini-la como `d6`;
- Ímpeto sugere futuramente uma operação distinta de aumentar um atributo em um passo por uma duração determinada.

Esses exemplos servem para orientar primitivas reutilizáveis; não significam que toda Ability deve ser implementada como Active Effect.

### UX futura

Direção visual desejada:

- lista clara de efeitos ativos no Agent;
- presets de efeitos prontos reutilizáveis e arrastáveis quando apropriado;
- authoring simplificado em termos como **Alvo / Operação / Valor**, sem raw paths;
- modo avançado/raw-path, se existir, não deve ser a experiência principal do OP2.

### Open questions

Ainda não decidir sem regra confirmada:

- se especializações de Aptidão contam como escolha quando uma regra pede uma perícia de Mente;
- quando uma escolha anterior pode ser refeita;
- quais operações devem materializar um Active Effect e quais devem participar de outro resolver do sistema;
- stacking e precedência entre múltiplas alterações que afetem o mesmo alvo;
- quais durações devem se integrar ao lifecycle de Narrative Scene.

Direção de evolução:

> Quando surgir uma Ability com um tipo de buff/modificador ainda não suportado, implementar a menor primitive semântica reutilizável para aquela classe de regra e permitir que outras fontes usem a mesma primitive depois.

---

## Não fazer ainda

- AbilityEffect DSL genérica/arbitrária que antecipe operações sem regra concreta;
- UX principal baseada em raw Active Effect paths;
- engine definitivo de combate;
- Threat Actor baseado no sistema anterior;
- sistema definitivo de ferimentos;
- rituais/paranormal baseado no Ordem anterior;
- automações construídas sobre regras não confirmadas.

O Playtest atual é a fonte de verdade.

A Investigation Application já possui apresentação e projeção segura de skills derivadas de `information[]`, imagem e DTs públicas por informação. Examinar e descoberta persistente continuam fora desta entrega.
