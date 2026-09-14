# Ordem Paranormal 2 — v0.3.0

Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.

**Contém material gerado por inteligência artificial.**

![Habilidades aplicáveis antes da rolagem](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.3.0/docs/release-assets/v0.3.0/ability-check-pre-roll.png)

## Destaques

- Habilidades agora podem aparecer automaticamente no Check antes da rolagem quando são aplicáveis ao contexto atual — sem precisar lembrar delas, abrir a ficha ou procurar entre opções que não servem para aquele teste.
- Habilidades passaram a suportar múltiplas Formas de uso, cada uma com seu próprio custo em PV, PD ou recurso próprio da Habilidade.
- Foco Mental e Ímpeto ganharam versões Aprimoradas no compêndio, disponíveis para uso manual por personagens que já possuem essas versões.
- Novos Agents recebem um Prototype Token já configurado, com PV e PD como barras do token.

## Habilidades aplicáveis antes da rolagem

Ao abrir um Check, o sistema já identifica o contexto da rolagem — atributo, Perícia ou Aptidão envolvida — e reconhece quais Formas de uso das Habilidades do Agent podem ser aplicadas naquele momento. Apenas essas opções aparecem na seção **Habilidades aplicáveis**.

- O jogador escolhe pelo botão **+**, que abre um seletor mostrando somente Formas atualmente utilizáveis.
- Ao aplicar uma Habilidade, o dado extra aparece na composição do Check já identificado pela Habilidade e pela Forma de origem.
- O custo é mostrado antes da rolagem e permanece pendente até a confirmação.
- Selecionar uma Habilidade não gasta nada, e cancelar ou fechar o Check também não consome nenhum recurso.
- Ao confirmar a rolagem, o estado e o custo são revalidados e só então o custo é efetivamente consumido e o resultado publicado no chat.

Esse fluxo está disponível em Checks normais, Testes Opostos, Request de Perícias e Examinar.

O escopo atual dessa integração automática é adicionar um dado extra ao Check. Formas de uso sem essa integração continuam disponíveis pelo fluxo direto de uso de Habilidade, quando aplicável.

## Formas de uso e custos

Uma Habilidade agora pode ter várias Formas de uso, cada uma com nome, descrição e custo independentes. Um custo pode ser:

- sem custo;
- PV;
- PD;
- um recurso próprio da Habilidade.

As Formas com integração automática entram no Check apropriado pela seção Habilidades aplicáveis; as demais continuam disponíveis pelo fluxo direto de uso de Habilidade na Ficha de Agente.

![Configuração de integração de Formas de uso com Checks](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.3.0/docs/release-assets/v0.3.0/ability-use-check-integration.png)

## Habilidades aprimoradas (Ato 2)

O compêndio passa a apresentar **Foco Mental (Aprimorado)** e **Ímpeto (Aprimorado)** como Habilidades separadas de **Foco Mental** e **Ímpeto**.

Isso é uma solução manual para personagens que já possuem essas versões aprimoradas no conteúdo atual do playtest. Não existe aquisição automática do upgrade nem uma condição de nível que conceda a versão aprimorada sozinha: o Mestre ou jogador substitui manualmente a Habilidade base pela aprimorada quando isso for apropriado para o personagem.

## Outras melhorias

- Ability sheets abertas a partir de um compêndio agora permitem navegar entre abas e abrir Formas de uso existentes para inspeção em modo somente leitura.
- Novos Agents recebem defaults de Prototype Token mais úteis, incluindo PV e PD como barras primária e secundária do token.

## Compatibilidade e atualização

- Compatível com **Foundry VTT v14**.
- Atualização direta a partir da **v0.2.1**.
- A migração de dados do mundo converte automaticamente o custo antigo salvo na raiz de uma Habilidade para o novo formato de Formas de uso; não é necessária nenhuma ação manual para isso.
- As versões Aprimoradas de Foco Mental e Ímpeto são escolhas manuais do Mestre/jogador, e não resultado de qualquer migração automática.

O projeto continua **source-available** sob a PolyForm Strict License 1.0.0. Releases públicas até v0.0.22 permanecem sob os termos MIT aplicáveis às cópias já distribuídas.

## Instalação

Manifest:

```text
https://github.com/antoniohbmonteiro/ordemparanormal2/releases/latest/download/system.json
```

Pacote:

```text
ordemparanormal2-v0.3.0.zip
```

**Comparar alterações**: https://github.com/antoniohbmonteiro/ordemparanormal2/compare/v0.2.1...v0.3.0
