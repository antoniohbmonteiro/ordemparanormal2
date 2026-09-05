# Ordem Paranormal 2 — v0.1.0

Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.

**Contém material gerado por inteligência artificial.**

A v0.1.0 é o primeiro baseline público consolidado da série 0.1.x. Reúne as capacidades já implementadas durante a série 0.0.x, sem introduzir novas funcionalidades nesta versão. O sistema continua acompanhando o playtest público, cujas regras podem mudar.

## O que a v0.1.0 inclui

- **Ficha de Agente:** identidade, nível, atributos Físico, Mente e Emoção, PV e PD diretamente editáveis, Perícias em uma lateral fixa e áreas de Habilidades e Inventário. O modo de edição controla alterações estruturais, preservando os controles de uso durante o jogo.
- **Perícias e Aptidão:** testes de atributos, perícias e especializações de Aptidão armazenadas independentemente, acessíveis pela ficha.
- **Check Engine e Check Dialog:** diálogo antes da rolagem, DT opcional, escolha temporária de outro atributo para perícias/Aptidão, ajustes transitórios de passos e dados situacionais d4–d12. Limite de quatro dados; com quatro, os três maiores compõem o total.
- **Resultados dos testes:** sucesso por total maior ou igual à DT, crítico positivo por valores repetidos de pelo menos 6, falha crítica quando todos os dados mostram 1, RA como maior resultado e RB como menor. Todos os dados participam de RA, RB e críticos, incluindo o quarto dado que não contribui para o total.
- **Check Chat Cards:** resultados individuais, total e informações de DT/crítico com snapshots históricos, preservando a leitura dos formatos anteriores. As rolagens respeitam os modos de chat registrados no Foundry e usam o fluxo nativo de Roll/ChatMessage para integração com Dice So Nice quando disponível.
- **Perfis e Habilidades:** Profile Items, Ability Items e concessões de Habilidades por referências canônicas do Perfil. A reconciliação preserva Habilidades manuais e remove somente concessões gerenciadas pelo Perfil correspondente. Habilidades podem ter custo em PD ou em seu próprio recurso opcional, além de publicação no chat ao usar.
- **Ocupações:** Occupation Items reutilizáveis, com seleção, substituição e remoção na ficha, limitados à identidade do Agente, sem bônus ou concessões automáticas.
- **Equipamentos e Inventário:** Equipment Items nas categorias Equipamento, Arma e Ferramenta, descrição e contador opcional de usos. O Inventário permite ajuste manual dos usos e publicação no chat sem consumo automático.
- **Compêndios:** Perfis, Habilidades, Ocupações e Equipamentos, com fontes reutilizáveis e organização por pastas.
- **Cena Narrativa:** uma cena ativa por mundo, iniciada e encerrada pelo GM na aba Narrativa, com o nome exibido aos clientes em um HUD informativo, independente do mapa ou combate.
- **Pontos de Interesse:** Point of Interest Items para definição reutilizável pelo GM, com descrição pública, contexto do Mestre e informações por perícia/DT. Esta fundação não inclui um fluxo de investigação em andamento nem uma interface de revelação aos jogadores.
- **Personalização visual:** cor de destaque por Agente, configurações pelo cabeçalho da ficha e preservação da cor nos novos Check Chat Cards, mantendo separadas as cores semânticas de sucesso, falha e crítico.

## Licenciamento e compatibilidade

- Primeira release pública sob **PolyForm Strict License 1.0.0**. O projeto é **source-available, não open source**; o código do branch de desenvolvimento já estava sob PolyForm Strict desde a migração do LICENSE.
- Releases públicas até **v0.0.22** foram distribuídas sob MIT. As cópias já distribuídas permanecem sujeitas aos termos MIT aplicáveis.
- O titular do código original é **Antonio Henrique Braga Monteiro**. Contribuições seguem CONTRIBUTING.md e CLA version 1.0; a licença do código não concede direitos sobre a propriedade intelectual de Ordem Paranormal ou outros conteúdos de terceiros.
- Compatível com **Foundry VTT v14+**, com verificação declarada para v14. O system ID permanece **ordemparanormal2**.
- As migrations atuais e a compatibilidade com dados legados são preservadas para atualização direta de worlds 0.0.x, sem exigir uma versão intermediária. Esta release não adiciona migrations.

## Instalação e atualização

O manifest estável continua o mesmo:

```text
https://github.com/antoniohbmonteiro/ordemparanormal2/releases/latest/download/system.json
```

O pacote desta versão é **ordemparanormal2-v0.1.0.zip**. Faça backup do world antes de atualizar.
