# Ordem Paranormal 2 para Foundry VTT

**Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/branding/community-license-seal-white.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/branding/community-license-seal-black.png">
  <img src="assets/branding/community-license-seal-black.png" alt="Selo da Licença da Comunidade de Ordem Paranormal" width="25%" style="min-width: 10%; height: auto; opacity: 1;">
</picture>

**Contém material gerado por inteligência artificial.**

Sistema comunitário **não oficial** para Foundry Virtual Tabletop, criado para acompanhar o desenvolvimento das regras públicas de playtest de **Ordem Paranormal 2**.

> O projeto está em estágio inicial. As regras do playtest ainda estão em desenvolvimento e podem mudar antes da versão final do jogo.

## Status

**Release pública: v0.1.0 — primeiro baseline consolidado da série 0.1.x**

Instale pelo manifest publicado como asset da release:

```text
https://github.com/antoniohbmonteiro/ordemparanormal2/releases/latest/download/system.json
```

A **v0.1.0** consolida as capacidades já implementadas como o primeiro baseline público da série **0.1.x**, sem introduzir novas funcionalidades. É a primeira release pública distribuída sob **PolyForm Strict License 1.0.0** e preserva as migrations existentes para worlds 0.0.x.

O pacote atualmente:

- mantém o system ID estável `ordemparanormal2`;
- usa o título público `Ordem Paranormal 2`;
- exibe o aviso da Licença da Comunidade ao entrar em um mundo até que a versão atual seja aceita naquele cliente;
- declara compatibilidade com Foundry VTT v14;
- gera um ES Module em `dist/main.js` com TypeScript e Vite;
- documenta arquitetura, limites de domínio e roadmap;
- registra `agent` como único Actor type, sem antecipar Ameaças;
- modela identidade, PV, PD, atributos e as 20 perícias verificadas do primeiro playtest;
- registra `profile` e `ability` como Item types e mantém exatamente um Perfil embutido por Agente;
- lista Perfis visíveis do mundo e de compêndios usando UUIDs canônicos do Foundry v14;
- permite que Perfis declarem Habilidades por UUID e reconcilia somente as cópias gerenciadas por aquele Perfil;
- inclui compêndios `Perfis` e `Habilidades` agrupados na pasta do sistema, com os Items de Habilidade organizados editorialmente por origem;
- inclui dezesseis Habilidades com ícones atribuídos, descrições mecânicas concisas escritas em palavras próprias e upgrades textuais quando confirmados;
- mantém Perfil como identidade e declaração de concessões, sem estado ou snapshots completos de Habilidades;
- mantém no máximo um recurso opcional, composto apenas por valor atual e máximo, na própria Habilidade que o fornece;
- permite usar Habilidades com custo gratuito, em PD ou no recurso da própria Habilidade;
- oferece Perícias fechadas, meio abertas ou como tab completa, sem persistir estado no Actor;
- fornece uma Agent Sheet Foundry v14-first com modo local de edição estrutural, mantendo PV, PD e recursos de Habilidade disponíveis durante o jogo normal;
- permite rolar atributos, perícias e especializações de Aptidão diretamente da sheet;
- permite trocar temporariamente o atributo de uma perícia ou especialização no Check Dialog, sem alterar o Agente ou o registry;
- permite adicionar dados situacionais `d4` a `d12`, repetidos e transitórios, respeitando o limite de quatro dados por Check;
- soma os três maiores resultados quando quatro dados são rolados, conforme confirmação pública posterior da regra;
- publica cards de chat com todos os dados individuais, total efetivo e snapshot histórico V3, preservando leitura de V1/V2;
- respeita ownership, o roll mode registrado no Foundry e a integração natural com Dice So Nice;
- mantém uma Cena Narrativa mundial com ID próprio e nome definido pelo GM, gerenciada pela aba **Narrativa** da sidebar direita e exibida a todos em um HUD somente informativo;
- permite personalizar uma cor de destaque por Agente pela opção **Configurações da Ficha** no menu da janela, aplicada aos elementos decorativos da sheet e preservada nos Check Chat Cards, sem afetar as cores semânticas de sucesso, falha, crítico e avisos;
- fornece identidade visual própria aos Perfis oficiais embutidos: Analista azul, Executor vermelho e Vigilante verde;
- registra `pointOfInterest` como Item type: definição reutilizável de Ponto de Interesse com descrição pública, contexto do Mestre e uma tabela de informações por perícia/DT com identificadores estáveis, sem estado de investigação em andamento;
- publica um card de chat com nome e descrição ao usar uma Habilidade pela Agent Sheet;
- registra `equipment` como Item type, com categorias `general`/`weapon`/`tool` e um contador opcional de usos (`uses`) na própria Equipment Sheet;
- fornece uma aba **Inventário** na Agent Sheet, listando os Equipamentos embutidos com a mesma densidade visual das Habilidades, ajuste manual de usos e publicação no chat sem consumir usos;
- inclui o compêndio `Equipamentos`, com pastas Armas e Ferramentas, contendo a arma e as Ferramentas da Ordem confirmadas pelo playtest;
- permite soltar Habilidades e Equipamentos externos numa ficha editável mesmo com o modo de edição desligado, mantendo esse modo exigido para editar, remover ou reordenar itens já embutidos;
- não inclui prosa protegida, artes oficiais, personagens oficiais ou outros conteúdos do jogo fora do permitido; os ícones de terceiros são atribuídos separadamente.

## Cena Narrativa

O GM usa a aba **Narrativa** da sidebar direita para informar um nome e iniciar a cena. Enquanto ela estiver ativa, todos os clientes veem apenas o rótulo e o nome em um pequeno HUD no topo; o HUD não possui ações nem edição. O encerramento também ocorre pela aba **Narrativa**, que é visível somente para GMs.

Esse lifecycle não acompanha a troca de mapa e não usa Foundry Scene, Canvas ou Combat como estado de regra.

## Arquitetura

A implementação seguirá princípios de Clean Architecture de forma pragmática para Foundry VTT:

- regras de domínio independentes de UI sempre que possível;
- integração com Foundry isolada nas bordas;
- sheets e aplicações sem serem donas das regras;
- módulos pequenos, tipagem forte e baixo acoplamento;
- nenhuma abstração criada apenas "para o futuro";
- Foundry v14 como alvo principal.

Documentação:

- [AGENTS.md](https://github.com/antoniohbmonteiro/ordemparanormal2/blob/main/AGENTS.md) — regras para agentes e contribuidores que alteram código;
- [docs/ARCHITECTURE.md](https://github.com/antoniohbmonteiro/ordemparanormal2/blob/main/docs/ARCHITECTURE.md) — direção arquitetural e fronteiras;
- [docs/DOMAIN_MODEL.md](https://github.com/antoniohbmonteiro/ordemparanormal2/blob/main/docs/DOMAIN_MODEL.md) — estado atual do modelo de domínio;
- [docs/ROADMAP.md](https://github.com/antoniohbmonteiro/ordemparanormal2/blob/main/docs/ROADMAP.md) — sequência planejada de versões `0.0.x`.

## Compatibilidade de dados de desenvolvimento

O sistema versiona migrações persistidas por world a partir da transição de Ocupação. A migration 1 converte cada `system.occupation` não vazio em um Item embedded local, sem procurar ou associar fontes por nome, e só limpa o texto depois de preservar o dado. Imports legados recebem a mesma forma final por uma transformação síncrona do source antes da criação. A organização declarada por `packFolders` pode não ser reaplicada a worlds que já inicializaram os compêndios do sistema. A `0.0.8` inicializa Perfis antigos com `system.abilityGrants: []`; Habilidades existentes nunca são associadas por nome.

## Instalação manual

Extraia o conteúdo do pacote de release para:

```text
{Foundry User Data}/Data/systems/ordemparanormal2/
```

A estrutura final deve conter:

```text
Data/systems/ordemparanormal2/system.json
```

Reinicie o Foundry VTT. O sistema deverá aparecer na lista de sistemas disponíveis para criação de mundos.

## Desenvolvimento

Requer Node.js `24.14.1` ou mais recente.

```text
npm install
npm run check
```

Para acompanhar alterações continuamente:

```text
npm run dev
```

Um checkout limpo pode ser validado de forma reproduzível com:

```text
npm ci
npm run check
```

O build recompila `packs-src/profiles`, `packs-src/abilities`, `packs-src/occupations` e `packs-src/equipment` como LevelDB em `packs/` antes de gerar `dist/main.js`. As saídas em `packs/` e `dist/` não são versionadas; a release inclui ambas. A base técnica é:

- Foundry VTT v14+;
- TypeScript;
- Vite;
- ES Modules;
- `TypeDataModel` para dados específicos de Documents;
- ApplicationV2 / DocumentSheetV2 quando apropriado;
- testes unitários para regras independentes do Foundry;
- testes de fronteira arquitetural para dependências importantes.

O branch `main` é de desenvolvimento e não substitui uma release pública até que uma nova versão seja empacotada e publicada explicitamente.

## Licença da Comunidade, código e contribuições

O uso de conteúdo relacionado a **Ordem Paranormal** neste projeto segue a
[Licença da Comunidade de Ordem Paranormal](https://ordemparanormal.com.br/licenca).
Consulte também o resumo em [COMMUNITY_LICENSE.md](COMMUNITY_LICENSE.md); o texto
oficial da licença prevalece sobre esse resumo.

O código-fonte original do branch de desenvolvimento, a partir da migração do
LICENSE, é disponibilizado sob a **[PolyForm Strict License 1.0.0](LICENSE)**. O projeto é **source-available**:
o código pode ser consultado e utilizado nos termos dessa licença, mas ela não
concede uma permissão geral para redistribuir o sistema ou publicar trabalhos
derivados.

As releases públicas até **v0.0.22** foram distribuídas sob MIT, que continua
aplicável às cópias já distribuídas. A **v0.1.0 é a primeira release pública
distribuída sob PolyForm Strict**.

Contribuições ao repositório oficial são bem-vindas e seguem uma permissão
adicional limitada para preparação de pull requests, descrita em
[CONTRIBUTING.md](https://github.com/antoniohbmonteiro/ordemparanormal2/blob/main/CONTRIBUTING.md), além do
[Contributor License Agreement](https://github.com/antoniohbmonteiro/ordemparanormal2/blob/main/CLA.md).

O titular do código original é **Antonio Henrique Braga Monteiro**. O titular
pode conceder licenças separadas sobre o código que controla, inclusive licenças
comerciais ou específicas para parceiros.

A licença do código não concede direitos sobre marcas, selos, artes, mapas,
textos, personagens, identidade visual ou qualquer outra propriedade intelectual
de terceiros.

Os glyphs usados nos ícones de Habilidades e Perfis são distribuídos pelo
Game-icons.net sob CC BY 3.0. Consulte
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) para atribuições, autores,
fontes e licenças aplicáveis.

## Direitos e atribuição

Este é um projeto comunitário não oficial e não é afiliado, patrocinado ou
endossado pelos responsáveis por Ordem Paranormal, salvo se uma autorização ou
parceria vier a ser expressamente informada no futuro.

**Ordem Paranormal**, seus nomes, identidade visual, textos, artes e demais
propriedades relacionadas pertencem aos seus respectivos detentores de direitos.

Este repositório não distribui textos, artes, personagens ou outros conteúdos
protegidos do jogo além do que seja permitido pela Licença da Comunidade ou por
autorização específica aplicável.
