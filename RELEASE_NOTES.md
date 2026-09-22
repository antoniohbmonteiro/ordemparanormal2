# Ordem Paranormal 2 — v0.4.2

Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.

**Contém material gerado por inteligência artificial.**

![Importador de Aventura](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.4.2/docs/release-assets/v0.4.0/adventure-import.png)

## Destaques

- Corrige a compatibilidade do **Importador de Aventura com ambientes hospedados como o Forge**.
- Os arquivos enviados preservam o caminho retornado pelo provider, inclusive URLs absolutas ou de CDN.
- Handouts, imagens de Pontos de Interesse e retratos e tokens de Agentes reutilizam os caminhos confirmados durante a importação, sem nova busca logo após o upload.
- Instalações self-hosted continuam suportadas e nenhuma migração de dados do Mundo é necessária.

## Correção do Importador de Aventura

Havia dois problemas consecutivos em providers hospedados:

1. **Confirmação do upload.** Na v0.4.0, o Forge podia aceitar o arquivo na Assets Library, mas o sistema exigia que ele fosse listado com o mesmo caminho relativo usado em instalações self-hosted. Uma URL absoluta ou de CDN podia interromper a importação após o envio:

   ```text
   Importação interrompida após 0 arquivos confirmados:
   Não foi possível confirmar o envio do arquivo para este Mundo
   · Ato I
   · Arquivos para o público - Ato I/Tokens/Personagem - Kênia.png
   ```

2. **Nova busca após o upload.** A v0.4.1 corrigiu a confirmação, mas Handouts, imagens de Pontos de Interesse e retratos e tokens de Agentes ainda descartavam os caminhos recém-confirmados e tentavam localizar os arquivos novamente. No Forge, essa busca podia falhar no primeiro Handout:

   ```text
   Os arquivos foram enviados, mas não foi possível concluir a importação da aventura:
   Não foi possível localizar o arquivo de um handout neste Mundo
   · Ato I · Handout 01 — conversa.
   Cannot resolve stored asset: actOne.handout.01
   ```

O importador agora aceita e preserva URLs válidas retornadas pelo provider e reutiliza os caminhos confirmados durante a materialização nos estágios seguintes. As Scenes já usavam esse resultado e continuam assim. Instalações self-hosted continuam funcionando.

O Mestre continua selecionando seus próprios arquivos legalmente obtidos. **O sistema não inclui nem distribui PDFs, mapas, tokens, handouts ou outros arquivos oficiais.**

## Compatibilidade e atualização

- Compatível com **Foundry VTT v14** e atualização direta da **v0.4.0 ou v0.4.1**.
- Não há migração de dados do Mundo. Conteúdo de quem não encontrou o problema não precisa ser recriado.
- Quem teve a importação interrompida pode executar o importador novamente após atualizar. Não é necessário apagar conteúdo parcialmente importado: a reconciliação existente retoma o fluxo sem duplicar os documentos que já reconhece.

O projeto continua **source-available** sob a PolyForm Strict License 1.0.0. Releases públicas até v0.0.22 permanecem sob os termos MIT aplicáveis às cópias já distribuídas.

## Instalação

Manifest:

```text
https://github.com/antoniohbmonteiro/ordemparanormal2/releases/latest/download/system.json
```

Pacote:

```text
ordemparanormal2-v0.4.2.zip
```

**Comparar alterações**: https://github.com/antoniohbmonteiro/ordemparanormal2/compare/v0.4.1...v0.4.2
