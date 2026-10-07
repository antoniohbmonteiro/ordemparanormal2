# Ordem Paranormal 2 — v0.6.0

Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.

**Contém material gerado por inteligência artificial.**

## Destaques

- **Desafios de Acesso nas Ferramentas do Mestre:** configure e acompanhe Destrancar e Arrombar para um Agente, com interfaces próprias para o Mestre e os jogadores autorizados.
- **Destrancar:** sequência secreta manual ou aleatória, feedback por posição e tentativas limitadas por rodada e pela resistência da fechadura.
- **Arrombar:** Check de Atletismo pelo fluxo normal, custo de 1 PV por tentativa confirmada e redução da resistência do obstáculo por RA em caso de sucesso.

## Destrancar

O Mestre escolhe o Agente, a quantidade de posições, o dado, a resistência e uma sequência manual ou aleatória. O jogador tenta descobrir a sequência com o feedback **Alto**, **Baixo** e **Exato**, sem receber a solução secreta.

O dado de Crime define as tentativas por rodada. O Mestre avança a rodada quando essas tentativas se esgotam; o limite total continua sendo a resistência configurada. Acertar a sequência conclui o desafio, enquanto esgotar o limite sem acertá-la emperra a fechadura.

![Desafio de Destrancar com feedback por posição e limites de tentativas](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.6.0/docs/release-assets/v0.6.0/access-challenge-unlock.png)

## Arrombar

O Mestre configura o obstáculo, a DT e sua resistência em PA. Cada tentativa confirmada usa o diálogo normal de Check de Atletismo e custa **1 PV**, inclusive quando o Check falha. Habilidades aplicáveis continuam disponíveis com seus próprios custos.

Em caso de sucesso contra a DT, o **RA** reduz a resistência restante. Uma falha não reduz a resistência. O desafio termina quando a resistência chega a zero, e cada Check é publicado pelo fluxo normal de chat.

![Desafio de Arrombar com resistência restante, resultado da tentativa e custo de PV](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.6.0/docs/release-assets/v0.6.0/access-challenge-break.png)

## Acompanhamento pelo Mestre

As Ferramentas do Mestre permitem criar, acompanhar, reapresentar e cancelar os desafios. Jogadores com permissão OWNER sobre o participante podem operar sua interface; um jogador autorizado que se conecta recebe os desafios ainda ativos.

**As sessões ficam em memória no cliente do Mestre que as criou e são perdidas ao recarregar esse cliente.** Não são salvas no Mundo para retomada após a recarga.

## Compatibilidade e atualização

- Compatível com **Foundry VTT v14+**, com atualização direta da **v0.5.1**.
- **Não há nova migração de Mundo nesta release.**

O projeto continua **source-available** sob a PolyForm Strict License 1.0.0. Releases públicas até v0.0.22 permanecem sob os termos MIT aplicáveis às cópias já distribuídas.

## Instalação

**Manifest estável:** [system.json](https://github.com/antoniohbmonteiro/ordemparanormal2/releases/latest/download/system.json)

**Pacote:** [ordemparanormal2-v0.6.0.zip](https://github.com/antoniohbmonteiro/ordemparanormal2/releases/download/v0.6.0/ordemparanormal2-v0.6.0.zip)

**Comparar alterações:** [v0.5.1...v0.6.0](https://github.com/antoniohbmonteiro/ordemparanormal2/compare/v0.5.1...v0.6.0)
