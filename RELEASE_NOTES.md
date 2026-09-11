# Ordem Paranormal 2 — v0.2.0

Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.

**Contém material gerado por inteligência artificial.**

## Destaques

- **Testes Opostos** com rolagens individuais e resultado consolidado em um único card.
- **Request de Perícias** do pedido do Mestre ao resultado no mesmo ChatMessage.
- **Ferramentas do Mestre** com acesso rápido aos dois workflows de mesa.
- Integração com o **Check Dialog normal**, preservando as opções já disponíveis no Check Engine.

## Testes Opostos

![Teste Oposto resolvido](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.2.0/docs/release-assets/v0.2.0/opposed-check-result.webp)

Cada participante realiza seu próprio teste, com autorização baseada no ownership do respectivo Agent ou na permissão de GM. O confronto inteiro permanece em um único card: ele acompanha as rolagens, apresenta o resultado consolidado e mantém empates como empates, sem inventar um desempate.

A apresentação opcional do Dice So Nice é compatível com o workflow sem criar mensagens extras nem impedir a resolução segura pelo GM ativo.

![Configuração de Teste Oposto](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.2.0/docs/release-assets/v0.2.0/opposed-check-dialog.webp)

## Request de Perícias

O Mestre escolhe um Agent, uma Perícia e uma DT opcional. O jogador autorizado recebe um card pendente e, ao clicar em **Rolar**, usa o Check Dialog normal com atributo alternativo, ajustes de steps e dados situacionais.

Quando definida pelo Mestre, a DT fica fixa durante a rolagem. O mesmo card pendente se transforma no resultado normal do Check, preservando o histórico no chat.

![Configuração de Request de Perícia](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.2.0/docs/release-assets/v0.2.0/check-request-dialog.webp)

![Request de Perícia aguardando rolagem](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.2.0/docs/release-assets/v0.2.0/check-request-pending.webp)

## Ferramentas do Mestre

A paleta persistente de Ferramentas do Mestre oferece acesso direto à configuração de Testes Opostos e à criação de Requests de Perícias, mantendo esses fluxos disponíveis durante a sessão sem ocupar a Ficha de Agente.

## Compatibilidade e atualização

- Compatível com **Foundry VTT v14**.
- Atualização direta a partir da **v0.1.1**.
- Esta release automatiza somente os comportamentos confirmados pelo playtest e já implementados no sistema; nenhuma regra adicional foi inferida.
- Recomenda-se fazer backup do world antes de atualizar.

O projeto continua **source-available** sob a PolyForm Strict License 1.0.0. Releases públicas até v0.0.22 permanecem sob os termos MIT aplicáveis às cópias já distribuídas.

## Instalação

Manifest:

```text
https://github.com/antoniohbmonteiro/ordemparanormal2/releases/latest/download/system.json
```

Pacote:

```text
ordemparanormal2-v0.2.0.zip
```

**Comparar alterações**: https://github.com/antoniohbmonteiro/ordemparanormal2/compare/v0.1.1...v0.2.0
