# Quem votou a favor da PEC da Blindagem

Site estático (sem frameworks, sem dependências, sem build) que lista os **356 deputados federais** que votaram **Sim** na PEC 3/2021 — a chamada PEC da Blindagem — em pelo menos um dos dois turnos de votação de **16/09/2025** na Câmara dos Deputados, com filtros por nome, partido, estado e turno.

Desde então o repositório ganhou um segundo aplicativo: o **[Catálogo 2026](#catálogo-2026-dexhtml)** (`dex.html`), um guia offline das 20.765 candidaturas de 2026 com o número na urna em destaque e o histórico de votação no Congresso Nacional (Câmara e Senado) de 861 delas.

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

## Pesquisa de vida pública

`scripts/research-candidatos-2026.mjs` coordena a pesquisa das 20.765 candidaturas por `sq`. Exa e Brave fazem a descoberta paralela das fontes; o Gemini API sintetiza e classifica o registro de fontes fornecido. A pesquisa não roda no navegador.

Instale as dependências uma vez:

```
npm ci
```

Configure `.env` com `GEMINI_API_KEY`, `EXA_API_KEY` e/ou `BRAVE_SEARCH_API_KEY` (o alias `BRAVE_API_KEY` também é aceito), além de `GEMINI_MODEL` opcional. A chave do Gemini é necessária para síntese; pelo menos uma chave Exa/Brave é necessária para descoberta.

O estado durável fica em `.cache/pesquisa-candidatos-2026/state.sqlite`. O banco é a fonte de verdade; os JSONL antigos são importados uma vez e mantidos apenas como auditoria. Cada candidatura, provedor, operação e payload possui uma chave determinística. Rerodar o mesmo comando reutiliza resultados, fontes e IDs remotos conhecidos. Um POST cujo resultado ficou ambíguo não é repetido automaticamente: use recuperação explícita, porque os serviços não documentam uma chave de idempotência/reconciliação para essa operação.

Pesquisar uma candidatura ou uma coorte:

```
node scripts/research-candidatos-2026.mjs pesquisar --sq 280002551933 --max-cost-usd 1
node scripts/research-candidatos-2026.mjs pesquisar --uf SP --limit 10 --search-providers exa,brave --candidate-concurrency 8 --max-cost-usd 2
```

Sem seletor, o comando percorre toda a lista em ordem de `sq`. `--max-cost-usd` é sempre obrigatório e reserva custo antes de iniciar síntese; o processo para novas reservas ao atingir o limite, sem cancelar requisições já iniciadas. `p-queue` separa as filas dos provedores e `p-retry` aplica backoff limitado; 429 pausa apenas a fila afetada e respeita `Retry-After`/janelas de rate limit disponíveis.

Comandos operacionais:

```
node scripts/research-candidatos-2026.mjs migrate
node scripts/research-candidatos-2026.mjs status --sq 280002551933
node scripts/research-candidatos-2026.mjs retry --sq 280002551933
node scripts/research-candidatos-2026.mjs recover --sq 280002551933 --resubmit-uncertain
```

A rubrica `trabalhador-v1` é uma lente editorial de esquerda com prioridade para o efeito material sobre quem trabalha. Direitos trabalhistas, redistribuição, serviços públicos e propriedade pública podem ser favoráveis; privatização, austeridade, repressão trabalhista, corrupção, sobrepreço e conflitos familiares de interesse podem ser desfavoráveis. O texto separa fato, trecho de evidência, papel da pessoa, resultado e leitura editorial. Obra anunciada, verba federal ou conclusão herdada não é mérito sem autoria, financiamento, entrega e contexto comprovados.

Itens de licitação, corrupção, investigação, conflito familiar, conduta pessoal ou evidência contestada aguardam revisão:

```
node scripts/research-candidatos-2026.mjs revisar --reviewer NOME --sq 280002551933
node scripts/build-pokedex.mjs
```

Os resultados publicados vão para 256 shards em `data/dex/pesquisa/` e são carregados apenas ao abrir uma ficha. A ausência de pesquisa ou de evidência não é nota, absolvição nem condenação.

## Votações nominais da Câmara (2017-2026)

`data/votacoes-camara.json` traz as **4.241 votações nominais** do plenário e das comissões da Câmara entre 2017 e 2026, com o voto individual de 1.194 cadastros de deputado — 1.393.285 registros de voto. É a base do histórico exibido no Catálogo 2026 (`dex.html`).

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

## Votações nominais do Senado (2017-2026)

`data/votacoes-senado.json` traz as **1.401 votações nominais** do plenário do Senado Federal entre 2017 e 2026, com o voto individual de 283 cadastros de senador — 62.809 registros de voto. Vem da [API de Dados Abertos do Senado](https://legis.senado.leg.br/dadosabertos), que não publica dumps em CSV: o script consulta o serviço `/votacao` por ano.

Regenerar:

```
node scripts/fetch-votacoes-senado.mjs
```

Cada resposta anual é guardada em `.cache/senado/votacoes-{ano}.json` (fora do git), então rodar de novo é barato. O script também baixa o cadastro dos senadores que exerceram mandato no período (legislaturas 55, 56 e 57) e guarda em `.cache/senado/senadores-detalhe.json`.

Duas restrições do serviço do Senado pesam na implementação:

- **IPv4 obrigatório.** O DNS de `legis.senado.leg.br` devolve um endereço IPv6 sem rota em ambientes típicos de WSL2; a requisição fica travada até dar timeout. O script chama o `curl` com `-4` em vez do `fetch` nativo.
- **Sem CPF.** A API do Senado não expõe o CPF do parlamentar. O cruzamento com as candidaturas de 2026 é por `(nome completo, data de nascimento)` normalizados, com fallback para nome único exato quando não há ambiguidade.

O esquema é o mesmo de `votacoes-camara.json`: elenco posicional de senadores, e o voto de cada votação é uma string com um dígito por senador. `id` tem o prefixo `SF-` e o resto é o `codigoSessaoVotacao` da fonte. A sigla do voto do Senado é mais rica que a da Câmara e mapeia assim: `Sim`→1, `Não`→2, `Abstenção`→3, `Obstrução` e `P-NRV`→4, `Presidente (art. 51 RISF)`→5, o resto (`AP`, `LS`, `LP`, `MIS`, `NA`, `NCom`)→0 sem registro. Como bancadas de senador são menores, `minimoBancadaAferivel` aqui é 3 (na Câmara, 5).

## Voto Secreto (`dex.html`)

O Voto Secreto é uma aplicação mobile-first e offline-first pensada para permitir a declaração individual de voto ou rejeição de candidaturas em 2026 com base nas votações nominais do Congresso Nacional como prova. `index.html` permanece como o mural histórico da PEC da Blindagem.

A premissa central é que o voto é secreto na cabine, mas a manifestação de preferência ou recusa é pública e garantida por lei. A aplicação não possui cadastro, servidor de banco de dados ou rastreamento.

### Telas da aplicação

- **Onboarding:** seleção regional do estado onde o eleitor vota (a cédula é regional).
- **Catálogo:** pesquisa instantânea por nome ou número na urna com chip de visor LCD, abas de filtro ("Com histórico" e "Todos"), régua de votações de 8 segmentos nos eixos editoriais e botões de ação individual ("NÃO VOTO" e "VOTO").
- **Ficha:** visão aprofundada da candidatura, identificação de reeleição ou mandato anterior, número na urna em LCD e detalhamento de votos por eixo temático com links para as atas oficiais da Câmara e do Senado.
- **Criar post (Hub):** atalhos para os formatos de postagem: "Um candidato", "Duelo", "Lista no radar" e "Pauta", além de acesso ao leitor de QR code.
- **Composer:** gerador do post em canvas (formatos Cabine e Cédula), com seleção de motivos nominais, oponente ou lista de nomes, atualizando a prévia em tempo real.
- **Compartilhar (Pronto):** entrega do link curto sem estado, exibição do QR code e botões de exportação direta para WhatsApp, Stories 9:16, download de imagem (1080x1350) e cartela de adesivos A4 para impressão.
- **Link receiver:** tela acessada por quem abre um link compartilhado (`#/nao/<id>` ou `#/voto/<id>`), exibindo o banner de manifestação individual de eleitor, a imagem do post, a legenda correspondente, a prova nominal com links oficiais e botão de remix ("Fazer o meu").
- **Radar:** visão analítica das candidaturas no radar de votações contrárias ao eleitor, agrupadas por partido, por pauta ou em ranking decrescente.
- **Escanear:** leitor de QR code integrado usando `BarcodeDetector` via câmera do dispositivo ou entrada manual de link.

### Formato de links sem estado

Os links gerados (`#/nao/<id>` e `#/voto/<id>`) são completamente sem estado: carregam apenas as decisões do eleitor empacotadas em Base32 Crockford (`ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"`), que são resolvidas em tempo de execução contra o conjunto público de dados:

| Tipo | Descrição | Campos e bits | Chars |
| --- | --- | --- | --- |
| `C` | Candidato | modelo(1) + motivos(8) + ref(27) = 36 bits | 1+8 (9 chars) |
| `D` | Duelo | modelo(1) + refNao(27) + refSim(27) = 55 bits | 1+11 (12 chars) |
| `P` | Pauta | modelo(1) + eixo(4) + n(4) + n×ref(27) = 9+27n bits | 1+ceil((9+27n)/5) |
| `L` | Lista | modelo(1) + n(4) + n×ref(27) = 5+27n bits | 1+ceil((5+27n)/5) |

Cada referência `ref(sq)` compacta a Unidade Eleitoral (5 bits, 1 a 28) e a sequência do candidato (22 bits), viabilizando identificadores extremamente concisos e sem necessidade de armazenamento centralizado.

### Perfis de candidatura

O pipeline de dados classifica as candidaturas em três perfis objetivos:
1. **Reeleição (`reeleicao`):** parlamentares que registraram votação nominal na Câmara ou no Senado na legislatura iniciada em 01/02/2023, concorrendo ao mesmo cargo, ou candidatos ao governo estadual que declararam a ocupação `GOVERNADOR`.
2. **Já teve mandato (`outro`):** candidaturas com histórico de votação no Congresso anterior à legislatura atual ou ocupação política prévia declarada (ministro, prefeito, vereador).
3. **Estreante (`novo`):** candidaturas sem registro prévio de votação nominal federal nem histórico de mandatos políticos declarados. Ausência de registro não é nota negativa.

*Nota sobre os dados do TSE 2026:* O arquivo do TSE não disponibiliza a coluna `ST_REELEICAO`, de modo que a reeleição para cargos do Executivo baseia-se na ocupação autodeclarada ao tribunal.

### Critério do Radar

Uma candidatura entra no radar quando acumula 3 ou mais votos contrários aos direitos do eleitor nos eixos avaliados.

## Conformidade eleitoral

O projeto Voto Secreto foi concebido com rigorosa observância à legislação eleitoral brasileira, em especial a Resolução TSE nº 23.610/2019 (art. 28):

1. **Manifestação estritamente em primeira pessoa:** Toda linguagem da interface e dos cartazes gerados adota a primeira pessoa (`NÃO VOTO`, `VOTO`, `meu voto não vai pro…`). O modo imperativo (`não vote`, `vote em`) é proibido em todo o projeto.
2. **Manifestação individual e dados públicos:** O autor de qualquer manifestação é o próprio cidadão no exercício de sua liberdade de expressão. O site apenas renderiza dados públicos e não armazena votos, identidades nem contadores.
3. **Vedação a termos desonrosos:** Termos desonrosos ou injuriosos são banidos da cópia do produto. A avaliação apoia-se unicamente em registros oficiais de votação nominal.
4. **Sem impulsionamento ou disparos em massa:** O projeto não utiliza anúncios pagos, pixels de conversão ou ferramentas automatizadas de mensageria.
5. **Aviso legal para o dia da eleição:** A aplicação alerta explicitamente sobre a vedação legal a disparos e distribuição de panfletagem digital no dia da eleição, data em que apenas a manifestação individual e silenciosa é permitida.
6. **Garantia constitucional e legal:** A manifestação pacífica e individual do eleitor sobre suas escolhas e rejeições eleitorais é assegurada pelo art. 28 da Resolução TSE nº 23.610/2019.

## Rodando localmente

Nenhuma das duas páginas funciona abrindo o arquivo direto pelo sistema de arquivos, porque os browsers bloqueiam `fetch` sobre `file://` e o service worker exige origem HTTP. Sirva a raiz do projeto:

```
python3 -m http.server 8000
```

O mural da PEC fica em <http://localhost:8000> e o app em <http://localhost:8000/dex.html>.

## Atribuição

Dados das votações: [API de Dados Abertos da Câmara dos Deputados](https://dadosabertos.camara.leg.br), termo de reutilização e licenciamento paralelo da Câmara, e [Serviço de Dados Abertos do Senado Federal](https://legis.senado.leg.br/dadosabertos). Dados das candidaturas de 2026: [Portal de Dados Abertos do TSE](https://dadosabertos.tse.jus.br). Ideia e divulgação original: [vídeo de Gabriel Salazar sobre a PEC da Blindagem](https://www.youtube.com/watch?v=aDjuRLF4cIo).
