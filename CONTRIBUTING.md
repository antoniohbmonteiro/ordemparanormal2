# Contributing to Ordem Paranormal 2 para Foundry VTT

Obrigado pelo interesse em contribuir.

Este é um projeto público e **source-available**, desenvolvido de forma
transparente e aberto a contribuições da comunidade. Ele não é um projeto open
source no sentido da OSI: o código do projeto é disponibilizado ao público sob
a PolyForm Strict License 1.0.0, que não concede uma permissão geral para criar
ou redistribuir versões modificadas do sistema.

## Formas de contribuir

Você pode ajudar por meio de:

- issues com bugs reproduzíveis;
- sugestões de melhoria ou UX;
- discussões de arquitetura e regras;
- documentação;
- pull requests para o repositório oficial.

Antes de uma mudança grande, prefira abrir uma issue ou discussão para alinhar
o escopo.

## Permissão limitada para preparar contribuições

Além dos direitos concedidos pela PolyForm Strict License 1.0.0, Antonio
Henrique Braga Monteiro concede uma permissão adicional, limitada e
não transferível, para copiar e modificar o código **exclusivamente na medida
necessária para preparar, testar e enviar uma contribuição ao repositório
oficial `antoniohbmonteiro/ordemparanormal2`**, incluindo o uso normal de forks
e branches do GitHub para esse fim.

Essa permissão adicional:

- não autoriza publicar ou manter uma distribuição independente do sistema;
- não autoriza oferecer uma versão derivada como produto, serviço ou pacote
  concorrente;
- não autoriza uso comercial do código;
- não altera os direitos de terceiros sobre Ordem Paranormal ou outros assets;
- termina para a contribuição em questão se ela for usada fora da finalidade de
  preparar e enviar a contribuição, salvo outra autorização escrita.

Para usos não cobertos pela PolyForm Strict License 1.0.0 nem pela permissão
adicional de contribuição, entre em contato com o titular do projeto para
discutir uma licença separada.

## Contributor License Agreement

Todo pull request que contenha uma contribuição autoral precisa ser enviado sob
os termos da versão 1.0 do [CLA.md](CLA.md).

Cada contribuidor com contribuição autoral incluída no pull request deve registrar
seu próprio aceite: no corpo do PR, para quem o abre, ou em comentário publicado
pelo próprio contribuidor. Use a seguinte declaração:

```text
I have read and agree to version 1.0 of the Contributor License Agreement in CLA.md.
```

As contribuições não devem ser incorporadas ao projeto enquanto faltar algum
aceite necessário. O aceite cobre a contribuição e as alterações adicionais
enviadas pelo mesmo contribuidor ao mesmo pull request.

O CLA **não transfere a autoria da sua contribuição**. Ele concede ao titular do
projeto os direitos necessários para manter, distribuir, sublicenciar e
relicenciar a contribuição junto com o projeto, inclusive caso exista no futuro
uma parceria ou licença comercial.

## Propriedade intelectual de Ordem Paranormal

Contribuições devem respeitar a Licença da Comunidade de Ordem Paranormal e os
direitos de terceiros.

Não envie, salvo quando houver autorização clara para isso:

- artes oficiais;
- mapas oficiais;
- logos ou identidade visual oficial;
- textos oficiais extensos;
- material extraído de produtos protegidos;
- conteúdo cuja licença seja incompatível com a distribuição do projeto.

Mecânicas podem ser implementadas nos limites aplicáveis, usando textos próprios
e concisos quando necessário.

## Desenvolvimento

O projeto usa:

- Foundry VTT v14+;
- TypeScript;
- Vite;
- ES Modules;
- TypeDataModel;
- ApplicationV2 / ActorSheetV2 / ItemSheetV2;
- Vitest.

Código, nomes de arquivos, funções, classes, tipos e commits devem permanecer em
inglês. Textos visuais para jogadores e mestres podem permanecer em português.

Antes de enviar um PR, valide um checkout limpo com:

```bash
npm ci
npm run check
```

## Commits e escopo

Use Conventional Commits quando possível, por exemplo:

```text
feat(investigation): add point of interest placement
fix(sheet): preserve native window controls
docs(legal): clarify contribution terms
```

Prefira mudanças incrementais, tipadas e de baixo acoplamento. Evite reescritas
amplas quando uma mudança localizada resolve o problema.

Consulte também `AGENTS.md` e os documentos em `docs/` antes de alterar áreas de
domínio ou arquitetura já estabelecidas.
