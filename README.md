# Quem votou a favor da PEC da Blindagem

Site estático (sem frameworks, sem dependências, sem build) que lista os **356 deputados federais** que votaram **Sim** na PEC 3/2021 — a chamada PEC da Blindagem — em pelo menos um dos dois turnos de votação de **16/09/2025** na Câmara dos Deputados, com filtros por nome, partido, estado e turno.

## O dataset

O ativo principal é `data/votos-pec-blindagem.json`: os registros nominais das duas votações (1º turno às 21h04 e 2º turno às 23h27 do dia 16/09/2025) unificados por deputado. A fonte primária é a API de Dados Abertos da Câmara dos Deputados (`https://dadosabertos.camara.leg.br/api/v2/votacoes/{id}/votos`); o vídeo que motivou o projeto é usado apenas como divulgação de referência, nunca como fonte dos dados.

Regenerar o dataset:

```
node scripts/fetch-votes.mjs
```

O script busca as duas votações na API e reescreve tanto o JSON quanto `data/votos-pec-blindagem.csv`. A execução falha se os totais esperados (Sim 353 / Não 134 / Abstenção 1 no 1º turno; Sim 344 / Não 133 no 2º; 356 com pelo menos um Sim) não baterem.

## Esquema do JSON

```json
{
  "proposicao": { "id": 2270800, "sigla": "PEC 3/2021", "apelido": "PEC da Blindagem", "ementa": "...", "urlFicha": "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2270800" },
  "fonte": { "api": "https://dadosabertos.camara.leg.br/api/v2", "coletadoEm": "<ISO>" },
  "votacoes": [
    { "turno": 1, "votacaoId": "2270800-135", "dataHora": "2025-09-16T21:04:35", "descricao": "...", "sim": 353, "nao": 134, "abstencao": 1, "ausente": 25 }
  ],
  "resumo": { "totalDeputados": 493, "simEmAlgumTurno": 356, "simNosDoisTurnos": 341 },
  "deputados": [
    {
      "id": 220569,
      "nome": "Silvye Alves",
      "partido": "UNIÃO",
      "uf": "GO",
      "urlFoto": "https://www.camara.leg.br/internet/deputado/bandep/220569.jpg",
      "urlPerfil": "https://www.camara.leg.br/deputados/220569",
      "email": "dep.silvyealves@camara.leg.br",
      "turno1": "Sim",
      "turno2": "Sim",
      "votouSim": true
    }
  ]
}
```

Em `deputados[]`, `turno1` e `turno2` assumem exatamente um destes quatro valores:

- `"Sim"` — votou sim no turno;
- `"Nao"` — votou não;
- `"Abstencao"` — registrou abstenção;
- `"Ausente"` — sem registro naquela votação nominal (não esteve presente).

`votouSim` é `true` quando `turno1 === "Sim" || turno2 === "Sim"`. A lista vem ordenada por `partido` e depois `nome`, em colação pt-BR. O CSV par (`data/votos-pec-blindagem.csv`, UTF-8 com BOM) segue a mesma ordem para abrir direto em planilhas.

## Candidaturas 2026 (TSE)

`data/candidatos-2026.json` traz as 20.765 candidaturas registradas para as Eleições Gerais de 2026, vindas do [Portal de Dados Abertos do TSE](https://dadosabertos.tse.jus.br/dataset/candidatos-2026). Nada no site usa esse arquivo hoje; ele está aqui como base para cruzamentos futuros.

Regenerar:

```
node scripts/fetch-candidatos-2026.mjs
```

O script baixa `consulta_cand_2026.zip` do CDN do TSE, descompacta `consulta_cand_2026_BRASIL.csv` em memória (leitor ZIP próprio sobre `node:zlib`, sem dependências), converte de ISO-8859-1 para UTF-8 e reescreve o JSON. Ele aborta se `SG_UF` divergir de `SG_UE`, se algum código descrever dois rótulos diferentes, se houver `SQ_CANDIDATO` repetido ou se o ano não for 2026.

O CSV do TSE tem 50 colunas e 10,8 MB; o JSON tem 2,7 MB. A compactação vem de três decisões:

- as colunas constantes (ano, turno, tipo e data da eleição, data de geração) saem das linhas e viram `eleicao` e `fonte`;
- cada par código/descrição (`CD_CARGO`/`DS_CARGO`, `NR_PARTIDO`/`SG_PARTIDO`, e assim por diante) vira uma entrada em `dicionarios`, e a linha guarda só o código;
- cada candidatura é um array posicional, não um objeto — os nomes dos campos ficam em `colunas`.

```json
{
  "fonte": { "portal": "...", "arquivo": "...", "membro": "consulta_cand_2026_BRASIL.csv", "geradoEm": "2026-08-26T19:30:44", "coletadoEm": "<ISO>" },
  "eleicao": { "ano": 2026, "turno": 1, "tipo": "ELEIÇÃO ORDINÁRIA", "data": "2026-10-04" },
  "eleicoes": { "6257": { "descricao": "Eleição Geral Federal 2026", "abrangencia": "FEDERAL" } },
  "resumo": { "totalCandidatos": 20765, "porCargo": { "PRESIDENTE": 13 }, "porUnidadeEleitoral": { "BR": 26 } },
  "dicionarios": {
    "cargo": { "1": { "nome": "PRESIDENTE", "eleicao": 6257 } },
    "unidadeEleitoral": [["AC", "ACRE"], ["AL", "ALAGOAS"], ["BR", "BRASIL"]],
    "ufNascimento": ["AC", "AL", "AM", "ZZ"],
    "partido": { "13": { "sigla": "PT", "nome": "PARTIDO DOS TRABALHADORES" } },
    "federacao": { "101": { "sigla": "PT/PC do B/PV", "nome": "...", "composicao": "PT/PC do B/PV" } },
    "coligacao": [{ "sq": 260001801179, "nome": "PARTIDO ISOLADO", "tipo": "PARTIDO ISOLADO", "composicao": "PDT" }],
    "genero": { "2": "MASCULINO" },
    "instrucao": { "8": "SUPERIOR COMPLETO" },
    "estadoCivil": { "3": "CASADO(A)" },
    "corRaca": { "1": "BRANCA" },
    "ocupacao": { "999": "OUTROS" },
    "situacao": { "-3": "#NE" }
  },
  "colunas": ["sq", "cargo", "ue", "numero", "nome", "nomeUrna", "nomeSocial", "partido", "federacao", "coligacao", "ufNascimento", "nascimento", "genero", "instrucao", "estadoCivil", "corRaca", "ocupacao", "situacao"],
  "candidatos": [[280002542548, 1, 5, 13, "LUIZ INÁCIO LULA DA SILVA", "LULA", null, 13, 101, 1293, 15, "1945-10-06", 2, 4, 3, 1, 249, -3]]
}
```

Como ler uma linha:

```js
const dados = await (await fetch("data/candidatos-2026.json")).json();
const col = Object.fromEntries(dados.colunas.map((nome, i) => [nome, i]));
const senadores = dados.candidatos.filter((c) => dados.dicionarios.cargo[c[col.cargo]].nome === "SENADOR");
const [sigla, nome] = dados.dicionarios.unidadeEleitoral[senadores[0][col.ue]];
```

`sq` é o `SQ_CANDIDATO`, chave de junção com os outros datasets do TSE (bens declarados, prestação de contas, certidões). `cargo`, `partido`, `federacao`, `genero`, `instrucao`, `estadoCivil`, `corRaca`, `ocupacao` e `situacao` são os códigos originais do TSE e indexam `dicionarios` pelo próprio código; `ue`, `ufNascimento` e `coligacao` são índices posicionais nos arrays de mesmo nome. `federacao` e `nomeSocial` são `null` quando o TSE manda `-1`/`#NULO`. As linhas estão ordenadas por `sq`.

Ficaram fora do JSON: `NR_CPF_CANDIDATO` e `NR_TITULO_ELEITORAL_CANDIDATO` (dados pessoais sem uso analítico aqui — `sq` já serve de chave), `DS_EMAIL` (o TSE devolve "NÃO DIVULGÁVEL" para todos) e `CD_SIT_TOT_TURNO`/`DS_SIT_TOT_TURNO` (resultado da eleição, que vem de outro dataset). Fora esses campos, o JSON reproduz o CSV linha por linha.

## Rodando localmente

A página carrega o JSON por `fetch`, então não funciona abrindo `index.html` direto pelo sistema de arquivos (browsers bloqueiam `fetch` sobre `file://`). Sirva a raiz do projeto:

```
python3 -m http.server 8000
```

e abra <http://localhost:8000>.

## Atribuição

Dados das votações: [API de Dados Abertos da Câmara dos Deputados](https://dadosabertos.camara.leg.br), termo de reutilização e licenciamento paralelo da Câmara. Dados das candidaturas de 2026: [Portal de Dados Abertos do TSE](https://dadosabertos.tse.jus.br). Ideia e divulgação original: vídeo ["NÃO VOTE neles! A lista dos Deputados que votaram para se BLINDAR"](https://www.youtube.com/watch?v=aDjuRLF4cIo), de Gabriel Salazar.
