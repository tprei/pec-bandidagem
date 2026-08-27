# Quem votou a favor da PEC da Blindagem

Site estático (sem frameworks, sem dependências, sem build) que lista os **356 deputados federais** que votaram **Sim** na PEC 3/2021 — a chamada PEC da Blindagem — em pelo menos um dos dois turnos de votação de **16/09/2025** na Câmara dos Deputados, com filtros por nome, partido, estado e turno.

## O dataset

O ativo principal é `data/votos-pec-blindagem.json`: os registros nominais das duas votações (1º turno às 21h04 e 2º turno às 23h27 do dia 16/09/2025) unificados por deputado. A fonte primária é a API de Dados Abertos da Câmara dos Deputados (`https://dadosabertos.camara.leg.br/api/v2/votacoes/{id}/votos`); o vídeo que motivou o projeto é usado apenas como divulgação de referência, nunca como fonte dos dados.

Regenerar o dataset:

```
node scripts/fetch-votes.mjs
```

O script busca as duas votações na API e reescreve tanto o JSON quanto `data/votos-pec-blindagem.csv`. A execução falha se os totais esperados (Sim 353 / Não 134 / Abstenção 1 no 1º turno; Sim 344 / Não 133 no 2º; 356 com pelo menos um Sim) não baterem.

### Fotos

As fotos dos deputados ficam em `fotos/{id}.jpg` — as miniaturas oficiais (bandep) da Câmara, baixadas uma única vez para dentro do repositório. Para gerá-las ou completá-las, rode `node scripts/fetch-fotos.mjs`: ele lê os `urlFoto` de `data/votos-pec-blindagem.json`, pula os arquivos que já existem com conteúdo e baixa o resto limitado a 6 requisições simultâneas para não sobrecarregar o CDN. O site serve essas cópias locais (`assets/app.js` aponta o `<img>` direto para `fotos/{id}.jpg`); o JSON segue carregando o `urlFoto` original como referência upstream.

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
    "ocupacao": { "999": "OUTROS" }
  },
  "colunas": ["sq", "cargo", "ue", "numero", "nome", "nomeUrna", "nomeSocial", "partido", "federacao", "coligacao", "ufNascimento", "nascimento", "genero", "instrucao", "estadoCivil", "corRaca", "ocupacao"],
  "candidatos": [[280002542548, 1, 5, 13, "LUIZ INÁCIO LULA DA SILVA", "LULA", null, 13, 101, 1293, 15, "1945-10-06", 2, 4, 3, 1, 249]]
}
```

Como ler uma linha:

```js
const dados = await (await fetch("data/candidatos-2026.json")).json();
const col = Object.fromEntries(dados.colunas.map((nome, i) => [nome, i]));
const senadores = dados.candidatos.filter((c) => dados.dicionarios.cargo[c[col.cargo]].nome === "SENADOR");
const [sigla, nome] = dados.dicionarios.unidadeEleitoral[senadores[0][col.ue]];
```

`sq` é o `SQ_CANDIDATO`, chave de junção com os outros datasets do TSE (bens declarados, prestação de contas, certidões). `cargo`, `partido`, `federacao`, `genero`, `instrucao`, `estadoCivil`, `corRaca` e `ocupacao` são os códigos originais do TSE e indexam `dicionarios` pelo próprio código; `ue`, `ufNascimento` e `coligacao` são índices posicionais nos arrays de mesmo nome. `federacao` e `nomeSocial` são `null` quando o TSE manda `-1`/`#NULO`. As linhas estão ordenadas por `sq`.

Ficaram fora do JSON:

- `NR_CPF_CANDIDATO` e `NR_TITULO_ELEITORAL_CANDIDATO` — dados pessoais sem uso analítico aqui, e `sq` já serve de chave;
- `DS_EMAIL` — o TSE devolve "NÃO DIVULGÁVEL" para todas as linhas;
- `CD_TIPO_ELEICAO` — constante `2`, redundante com `eleicao.tipo`;
- `CD_SITUACAO_CANDIDATURA`/`DS_SITUACAO_CANDIDATURA` — `-3`/`#NE` em todas as linhas enquanto os registros não são julgados;
- `CD_SIT_TOT_TURNO`/`DS_SIT_TOT_TURNO` — resultado da eleição, que vem de outro dataset.

Fora esses campos, o JSON reproduz o CSV linha por linha.

## Votações nominais da Câmara (2021-2026)

`data/votacoes-camara.json` traz as **3.138 votações nominais** do plenário e das comissões da Câmara entre 2021 e 2026, com o voto individual de 887 cadastros de deputado — 990.153 registros de voto. Nada no site usa esse arquivo hoje; ele está aqui como base para medir posicionamento ao longo do mandato.

Regenerar:

```
node scripts/fetch-votacoes-camara.mjs
```

O script baixa os 12 dumps anuais (`votacoes-{ano}.csv` e `votacoesVotos-{ano}.csv`, 349 MB no total) para `.cache/camara/`, que fica fora do git. Cada arquivo é medido por `HEAD` antes de baixar e o download é retomável: o manifesto (`.cache/camara/manifesto.json`) guarda tamanho, `etag` e o sha256 do prefixo já verificado, então uma execução interrompida continua de onde parou e um arquivo corrompido no lugar — mesmo preservando o tamanho — é detectado e rebaixado. Uma retomada só é aceita se o `content-range` da resposta casar exatamente com o deslocamento pedido.

349 MB de CSV viram 3,5 MB de JSON (0,60 MB em gzip). A compactação vem de duas decisões:

- os 887 deputados viram um elenco posicional, e o voto de cada votação é **uma string de 887 dígitos**, um por índice do elenco, com o alfabeto em `alfabetoVotos` (`0` sem registro, `1` Sim, `2` Não, `3` Abstenção, `4` Obstrução, `5` Artigo 17, `6` em branco);
- cada votação é um array posicional, com os nomes dos campos em `colunas`.

```json
{
  "resumo": { "votacoes": 3138, "registrosDeVoto": 990153, "cadastrosDeDeputado": 887, "partidos": 29, "cadastrosComMaisDeUmaSigla": 345 },
  "minimoBancadaAferivel": 5,
  "partidos": ["PSL", "REPUBLICANOS", "PDT", "PSDB", "PSD", "..."],
  "colunasDeputado": ["id", "nome", "uf", "participacoes", "votosComMaioriaDoPartido", "votosEmBancadaAferivel"],
  "deputados": [[220639, "Guilherme Boulos", "SP", 720, 699, 703]],
  "filiacoes": [[[0, 1], [25, 1013], [10, 1085]]],
  "colunas": ["id", "dataHora", "orgao", "proposicao", "aprovada", "sim", "nao", "abstencao", "obstrucao", "artigo17", "participantes", "minoria", "rice", "desercoes", "descricao", "votos"],
  "votacoes": [["2270800-135", "2025-09-16T21:04:35", "PLEN", 2561347, true, 353, 134, 1, 0, 0, 488, 0.2752, 0.7325, 57, "Aprovado, em primeiro turno...", "111110100002..."]]
}
```

`filiacoes[i]` são os trechos `[índice do partido, índice da votação]` do deputado `i`, na ordem cronológica das votações, para reconstruir a legenda em que ele estava em qualquer votação. O exemplo acima é o de Bia Kicis: PSL, depois UNIÃO a partir da votação 1013, depois PL a partir da 1085. 345 cadastros mudaram de sigla no período.

### As três métricas de credibilidade

O problema de pontuar parlamentar por votação é que a maioria das votações não diz nada sobre ninguém. Estas três colunas separam o que informa do que não informa:

- **`minoria`** é a fração da minoria entre os votos Sim e Não. Zero significa unanimidade: a votação não distingue ninguém e deve ser descartada. O corte usual é 5%.
- **`rice`** é o índice de coesão de Rice (Stuart Rice, 1925), `|sim − não| / (sim + não)` dentro de cada bancada, ponderado pelo número de votos. Vale 1 quando toda bancada votou junto e 0 numa divisão exata. Perto de 1 a votação informa o partido, não a pessoa.
- **`desercoes`** conta os deputados que votaram contra a maioria da própria bancada. É o sinal mais forte sobre o indivíduo, porque contraria a orientação do partido.

`rice`, `desercoes` e os contadores por deputado só consideram bancadas com pelo menos `minimoBancadaAferivel` votos Sim/Não naquela votação, e bancadas empatadas ficam fora da conta de deserção — um empate não tem maioria a trair. `rice` é `null` nas 178 votações em que nenhuma bancada atinge esse mínimo.

Aplicado ao período: 2.625 das 3.138 votações passam do corte de 5% de minoria, e 382 dessas têm `rice > 0,95` — ou seja, informam a sigla e não a pessoa. Na PEC 3/2021 o 1º turno dá `minoria` 0,2752, `rice` 0,7325 e 57 deserções: o PT rachou 12 a 51 e o PSDB 6 a 6, então ali o voto foi individual.

### Limites conhecidos

- O elenco é indexado pelo id de deputado da Câmara, que é um **cadastro, não uma pessoa**: quem foi eleito em legislaturas separadas aparece duas vezes. Átila Lira tem os ids 74459 (1.101 participações) e 123086 (1.104), o mesmo político com o histórico partido em dois. A deduplicação correta é por CPF, no cruzamento com `data/candidatos-2026.json`.
- `cadastrosComMaisDeUmaSigla` conta qualquer troca de legenda, inclusive as fusões administrativas de 2022 (PSL e DEM para UNIÃO), que não foram decisão do deputado.
- `nome` e `uf` usam a grafia mais frequente na fonte, que às vezes é a errada: o dump escreve "Chico D\`Angelo" 998 vezes e "Chico D'Angelo" 83. Para exibição, prefira o nome de urna do dataset do TSE.
- `votosEmBancadaAferivel` é 0 para 6 deputados de bancadas pequenas (REDE), então a fidelidade é indefinida para eles, não zero.
- `proposicao` é `null` em 776 votações — o dump usa `"0"` para "não vinculada a proposição", e requerimentos e questões de ordem caem nesse caso.
- `proposicao` é a **última proposição apresentada**, não necessariamente a matéria principal: na PEC 3/2021 ela aponta para o substitutivo (2561347), não para a PEC (2270800). O id da matéria principal é o prefixo do id da votação.

## Rodando localmente

A página carrega o JSON por `fetch`, então não funciona abrindo `index.html` direto pelo sistema de arquivos (browsers bloqueiam `fetch` sobre `file://`). Sirva a raiz do projeto:

```
python3 -m http.server 8000
```

e abra <http://localhost:8000>.

## Atribuição

Dados das votações: [API de Dados Abertos da Câmara dos Deputados](https://dadosabertos.camara.leg.br), termo de reutilização e licenciamento paralelo da Câmara. Dados das candidaturas de 2026: [Portal de Dados Abertos do TSE](https://dadosabertos.tse.jus.br). Ideia e divulgação original: vídeo ["NÃO VOTE neles! A lista dos Deputados que votaram para se BLINDAR"](https://www.youtube.com/watch?v=aDjuRLF4cIo), de Gabriel Salazar.
