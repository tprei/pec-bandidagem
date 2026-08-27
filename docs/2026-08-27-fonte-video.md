# Conferência com o vídeo-fonte — 2026-08-27

## O vídeo

- URL: <https://www.youtube.com/watch?v=aDjuRLF4cIo>
- Título: "NÃO VOTE neles! A lista dos Deputados que votaram para se BLINDAR"
- Canal: Gabriel Salazar · publicado em 22/09/2025 · 15 min 53 s
- Transcrição local (Whisper medium, pt-BR, CPU): `/tmp/pec-video/draft.txt` (1 533 palavras). Não é um ativo do repositório: é a narração de terceiros, protegida por direito autoral.

## Papel do vídeo neste projeto

A lista do site vem exclusivamente da API de Dados Abertos da Câmara dos Deputados (registro nominal das votações de 16/09/2025). O vídeo não é fonte de dados: sua lista aparece **escrita em tela**, nunca lida em áudio, e portanto não é auditável pela transcrição. A comparação abaixo é a conferência que o áudio permite.

## Resultado da conferência

**O vídeo afirma 366 deputados; o número bate exatamente com a API quando se inclui a Emenda Aglutinativa nº 1.**

A narração diz: "366 deputados se envolveram nessa falcatrua votando sim em um ou em todos os processos da votação. A PEC passou por quatro votações." Os registros oficiais mostram que 366 é a união dos votos Sim em três votações nominais:

| Votação | id na API | Sim |
|---|---|---|
| 1º turno da PEC 3/2021 (16/09, 21h04) | `2270800-135` | 353 |
| 2º turno da PEC 3/2021 (16/09, 23h27) | `2270800-160` | 344 |
| Emenda Aglutinativa nº 1, que restabeleceu o voto secreto (17/09) | `2270800-175` | 314 |

- União dos Sim nas três votações acima: **366** — exatamente o número do vídeo. (Somando também o destaque do voto secreto suprimido em 16/09, `2270800-165`, Sim 296, a união vira 367, ou seja, o número publicado corresponde às três.)
- O site lista os **356** que votaram Sim em pelo menos um dos dois turnos de aprovação da PEC — critério mais estrito, restrito ao texto da proposta em si. Os 356 são subconjunto dos 366.

Os 10 deputados que entram nos 366 do vídeo apenas pelo Sim na Aglutinativa (fora, portanto, da lista do site):

Dagoberto Nogueira (PSDB-MS), João Carlos Bacelar (PL-BA), Weliton Prado (SOLIDARIEDADE-MG), Valmir Assunção (PT-BA), Zé Silva (SOLIDARIEDADE-MG), Capitão Augusto (PL-SP), João Daniel (PT-SE), Alex Santana (REPUBLICANOS-BA), Gilson Daniel (PODE-ES), Thiago Flores (REPUBLICANOS-RO).

## Nomes falados no áudio × dataset

A narração menciona dois nomes de deputados; nenhum gera divergência com o dataset:

- "Ideubrando Pasquual" — transcrição falhada de **Hildebrando Pascoal**, caso histórico anterior à reforma de 2001, citado como contexto. Não participou das votações de 2025.
- "O deputado Nicolas" — casa com **Nikolas Ferreira (PL-MG)**, único parlamentar com esse nome na 57ª legislatura. Pelo registro oficial votou Sim nos dois turnos, logo já está dentro dos 356.

A lista nominal exibida no vídeo não foi conferida quadro a quadro: exigiria OCR dos frames, fora do escopo. A conferência pelos totais (366 explicado exatamente pelas três votações) não encontrou contradição com os dados oficiais.
