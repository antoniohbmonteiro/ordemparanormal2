# Ordem Paranormal 2 — v0.4.5

Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.

**Contém material gerado por inteligência artificial.**

![Importador de Aventura](https://raw.githubusercontent.com/antoniohbmonteiro/ordemparanormal2/v0.4.4/docs/release-assets/v0.4.0/adventure-import.png)

## Destaques

- O **Importador de Aventura** reconhece PDFs compatíveis pela assinatura do conteúdo quando o hash binário muda, incluindo cópias legítimas desbloqueadas ou regravadas.
- Suporta o PDF **Playtest Alpha v1.1 Sobreviventes**, distribuição gratuita que cobre o **Ato I**, e permite selecionar os atos a importar conforme as fontes disponíveis.
- Reconhece, com aviso, o pacote conhecido do Ato II ao qual faltam somente três áudios EMF suplementares que a importação atual não utiliza.

## Reconhecimento dos arquivos

A v0.4.5 fortalece o reconhecimento sem dispensar a validação das fontes. Hashes conhecidos continuam como caminho rápido. Quando o hash binário de um PDF muda, o importador pode reconhecer uma versão compatível pela assinatura do texto completo, após verificar a leitura, a contagem de páginas e a marca de versão. O PDF v1.1 Sobreviventes é uma fonte oficial válida para o Ato I; a variante Agentes cobre os Atos I e II.

Para os ZIPs, um hash conhecido validado também é o caminho rápido. Após um miss, o importador compara a estrutura dos arquivos necessários e confirma seu conteúdo. Isso permite reconhecer reempacotamentos e recompressões compatíveis, mantendo as validações de segurança. O relatório diferencia a disponibilidade de cada ato, e o Mestre escolhe explicitamente quais atos importar.

O caso conhecido do Ato II em que faltam **somente** os arquivos abaixo é reconhecido com aviso:

- `Handouts/Audio EMF 1.mp3`
- `Handouts/Audio EMF 2.mp3`
- `Handouts/Audio EMF 3.mp3`

Esses três áudios são suplementares conhecidos e não são utilizados pela importação atual. Nesse caso, o Mestre pode escolher **Importar mesmo assim**. Arquivos necessários ausentes ou alterados, diferenças desconhecidas, pacote do ato errado e ZIPs inválidos ou inseguros continuam bloqueados.

O Mestre continua selecionando seus próprios arquivos legalmente obtidos. **O sistema não inclui nem distribui PDFs, mapas, tokens, handouts ou outros arquivos oficiais.**

## Compatibilidade e atualização

- Compatível com **Foundry VTT v14** e atualização direta da **v0.4.4**.
- Não há migração de dados do Mundo.

O projeto continua **source-available** sob a PolyForm Strict License 1.0.0. Releases públicas até v0.0.22 permanecem sob os termos MIT aplicáveis às cópias já distribuídas.

## Instalação

Manifest:

```text
https://github.com/antoniohbmonteiro/ordemparanormal2/releases/latest/download/system.json
```

Pacote:

```text
ordemparanormal2-v0.4.5.zip
```

**Comparar alterações**: https://github.com/antoniohbmonteiro/ordemparanormal2/compare/v0.4.4...v0.4.5
