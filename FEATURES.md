# Recursos

Recursos implementados no sistema comunitário não oficial Ordem Paranormal 2 para Foundry VTT v14.

## Importador de Aventura (Adventure Importer)

- Prepara os Atos I e II no Mundo a partir de PDF e ZIPs fornecidos pelo usuário, criando Agentes, Handouts, Pontos de Interesse e Scenes.
- Permite reimportar os atos selecionados. Em conflitos com conteúdo gerenciado, oferece opções para preservar alterações do Mestre ou restaurar os dados importados.
- Não distribui PDFs, mapas, tokens, handouts ou outros arquivos oficiais.

## Check Engine

- Checks de atributo, Perícia e especialização de Aptidão usam a progressão normal d4 → d6 → d8 → d10 → d12; a DT é opcional.
- Antes da rolagem, Checks de Perícia e Aptidão permitem escolher outro atributo atual do Agente. Também é possível ajustar temporariamente o passo dos componentes, adicionar dados situacionais d4–d12 e selecionar usos de Habilidades compatíveis.
- A escolha de atributo e os ajustes de dados não alteram os valores-base da ficha. Habilidades selecionadas podem consumir seus custos.
- Cada Check rola até quatro dados; com quatro, os três maiores compõem o total. Todos os dados participam da análise de RA, RB e críticos.
- RA é o maior resultado individual; RB é o menor. Há crítico positivo quando ao menos dois dados mostram o mesmo valor igual ou superior a 6, e falha crítica quando todos mostram 1. O resultado contra a DT é independente do estado crítico.
- Os resultados ficam em cards persistentes no chat. Há integração opcional com Dice So Nice.

## Testes Opostos (Opposed Checks)

- Cada participante faz seu próprio Check; o maior total vence e totais iguais permanecem empatados.
- Um único card de chat reúne e atualiza os resultados, com autorização por propriedade do Agente ou pelo Mestre ativo.

## Solicitação de Perícia (Skill Request)

- O Mestre escolhe um Agente, uma Perícia e, se desejar, uma DT. O pedido fica pendente no chat.
- Um usuário autorizado resolve o pedido pelo Check Dialog; o mesmo card passa a mostrar o resultado.

## Ficha de Agente

- Reúne Perfil, Ocupação, atributos, Perícias, especializações de Aptidão, PV, PD, Habilidades, Inventário e Notas.
- PV e PD são editáveis diretamente. O Modo de Edição controla ajustes estruturais da ficha sem bloquear o uso de recursos durante o jogo.

## Perfis e Habilidades

- Um Perfil pode conceder Habilidades por referências canônicas. Habilidades já adicionadas manualmente não são duplicadas nem removidas pelo gerenciamento do Perfil.
- Habilidades podem ter custo estruturado e um recurso próprio opcional; os custos automatizados usam PD ou o recurso da própria Habilidade.

## Investigação e Pontos de Interesse (POIs)

- Pontos de Interesse reutilizáveis podem ser associados a Regions do Foundry e ter sua visibilidade controlada pelo Mestre.
- Informações públicas e contexto exclusivo do Mestre são separados. A apresentação da DT pode ser pública ou oculta, e informações reveladas persistem.
- A ação **Examinar** usa o fluxo normal de Check.

## Equipamentos

- Equipamentos podem ser adicionados ao Inventário, editados e apresentados no chat. Usos opcionais podem ser ajustados quando disponíveis no Item.

## Cena Narrativa

- O Mestre inicia e encerra uma Cena Narrativa ativa pelo painel **Narrativa**. Seu nome aparece para os clientes no HUD.

## Ferramentas do Mestre

- A paleta reúne acesso a Testes Opostos, Solicitações de Perícia e ao Importador de Aventura.

## Foundry VTT v14

- O sistema usa APIs atuais do Foundry VTT v14, incluindo fichas da família ApplicationV2 e dados de documentos com TypeDataModel.
