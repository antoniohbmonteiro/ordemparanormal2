# Ordem Paranormal 2 — v0.1.1

Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.

**Contém material gerado por inteligência artificial.**

A v0.1.1 leva os Pontos de Interesse para o canvas e apresenta o primeiro fluxo jogável de Investigação. Mestres podem preparar e revelar POIs na cena, enquanto jogadores acessam uma visão segura das pistas e usam o Check Engine já existente para Examinar o local.

## Destaques

- Novo **Modo Investigação**, integrado aos controles de cena do Foundry.
- **Pontos de Interesse no canvas** usando Regions e ferramentas nativas de desenho.
- Controle do Mestre para mostrar POIs a todos, a jogadores específicos ou ocultá-los novamente.
- Nova **Investigation Application**, com interfaces distintas para jogadores e Mestres.
- Suporte a várias Perícias e várias informações por Perícia, cada uma com sua própria DT.
- DTs configuráveis como públicas ou ocultas para os jogadores.
- Revelação manual e persistente de informações por placement.
- Botão **Examinar** conectado ao Check Dialog, rolagem e chat normais do sistema.

## Pontos de Interesse e Investigação

### Modo Investigação e POIs na cena

O Mestre pode desenhar POIs com as ferramentas nativas de retângulo, elipse e polígono, associá-los a Items reutilizáveis de Ponto de Interesse e administrá-los diretamente no canvas.

POIs revelados recebem destaque visual próprio, com brilho e resposta ao hover. A visibilidade pode ser liberada para todos os jogadores ou somente para usuários escolhidos. Ao receber acesso pela primeira vez, o jogador também recebe um aviso discreto no chat, sem antecipar qual POI foi revelado.


Com o Modo Investigação ativo, clicar em um POI visível abre sua tela de investigação. Tokens continuam tendo prioridade sobre o POI, preservando a seleção e movimentação normais do Foundry.

### Visão do jogador

A interface do jogador recebe uma projeção própria e sanitizada. Ela apresenta apenas o nome, a imagem, a descrição pública e as linhas necessárias para a investigação — nunca o contexto privado do Mestre, conteúdos ainda não revelados, IDs internos, UUID do Item ou valores de DT ocultos.

Cada Perícia pode possuir várias informações. A tela mostra uma linha por informação, exibindo a DT quando ela for pública ou um marcador de olho cortado quando estiver oculta. Informações ainda não reveladas permanecem neutras; quando o Mestre revela uma delas, seu conteúdo aparece na Application aberta.


O botão **Examinar** usa o fluxo normal de checks do sistema: resolve um Agente válido, abre o Check Dialog habitual e publica o resultado pelo card de chat existente. Para Aptidão, o jogador escolhe primeiro uma das especializações canônicas. Nenhuma DT do POI é preenchida automaticamente e a rolagem não revela pistas por conta própria — a decisão continua com o Mestre.

### Visão do Mestre e revelação de informações

O Mestre vê todas as DTs e informações, além do painel **Somente o Mestre**. Quando uma DT estiver oculta para os jogadores, um olho cortado aparece ao lado do valor real para tornar essa configuração visível sem criar outra coluna.

Cada informação possui seu próprio controle **Revelar**. Depois da ação, o estado muda para **Revelada** e permanece associado àquele POI na cena, inclusive depois de fechar e abrir novamente a Application. Jogadores com a janela aberta recebem a atualização por meio da projeção segura, sem que conteúdo privado seja transportado no evento de atualização.


## Limitações atuais

Esta entrega mantém a adjudicação narrativa com o Mestre. Ainda não há:

- comparação automática entre resultado do check e DTs do POI;
- revelação ou descoberta automática após uma rolagem;
- descoberta individual de informações;
- consumo de PD pela investigação;
- ação funcional de **Outra perícia...**;
- opção para ocultar novamente uma informação já revelada;
- vínculo automático com a Cena Narrativa.

## Compatibilidade e atualização

- Compatível com **Foundry VTT v14+**.
- System ID: `ordemparanormal2`.
- Recomenda-se fazer backup do world antes de atualizar.
- POIs autorados na v0.1.0 usam a estrutura anterior de informações e não são migrados automaticamente para o novo agrupamento por Perícia. Reconfigure esses Items antes de utilizá-los no novo fluxo de Investigação.
- As migrations existentes para os demais dados da série 0.0.x permanecem preservadas.

O projeto continua **source-available** sob a PolyForm Strict License 1.0.0. Releases públicas até v0.0.22 permanecem sob os termos MIT aplicáveis às cópias já distribuídas.

## Instalação

Manifest:

```text
https://github.com/antoniohbmonteiro/ordemparanormal2/releases/latest/download/system.json
```

Pacote:

```text
ordemparanormal2-v0.1.1.zip
```

**Comparar alterações**: https://github.com/antoniohbmonteiro/ordemparanormal2/compare/v0.1.0...v0.1.1
