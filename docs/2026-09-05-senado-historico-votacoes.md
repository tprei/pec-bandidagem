# Especificação Técnica: Histórico e Votações do Senado Federal (2017–2026)

## 1. Contexto e Objetivo

O aplicativo atualmente consome apenas dados de votações nominais da Câmara dos Deputados (`data/votacoes-camara.json`, cobrindo 2017 a 2026). Candidatos que construíram trajetória como Senadores da República (como Flávio Bolsonaro, Sergio Moro, Marcos Pontes, Alessandro Vieira, Hamilton Mourão, Cleitinho, entre outros) aparecem com `ficha: null` e a mensagem "Sem histórico na Câmara".

O objetivo é coletar o histórico de votações nominais do Senado Federal para o mesmo período (2017–2026), cruzar com todas as candidaturas de 2026 e exibir as fichas de votação, métricas de fidelidade partidária e votos individuais tanto da Câmara quanto do Senado no Catálogo 2026 (`dex.html`).

---

## 2. Fonte de Dados e API do Senado Federal

- **URL Base:** `https://legis.senado.leg.br/dadosabertos`
- **Formato:** JSON (`Accept: application/json`, `User-Agent: Mozilla/5.0`)
- **Restrição de Rede:** O domínio `legis.senado.leg.br` possui DNS IPv6 com problemas de rota/timeout em ambientes Linux/WSL2. Toda requisição deve forçar IPv4 (`family: 4` no `http`/`undici` ou `agent` IPv4).
- **Taxa de requisição:** Máximo de 10 req/s.
- **Endpoints Utilizados:**
  1. `GET /dadosabertos/votacao?dataInicio={ano}-01-01&dataFim={ano}-12-31`
     - Retorna array de votações nominais no ano.
     - Cada votação contém metadados (`codigoSessaoVotacao`, `sequencialVotacao`, `dataSessao`, `identificacao`, `descricaoVotacao`, `resultadoVotacao`) e o array de votos nominais de todos os senadores presentes (`codigoParlamentar`, `nomeParlamentar`, `siglaPartidoParlamentar`, `siglaUFParlamentar`, `siglaVotoParlamentar`).
  2. `GET /dadosabertos/senador/lista/legislatura/{leg}`
     - Legislaturas: 55 (2015–2019), 56 (2019–2023), 57 (2023–2027).
     - Retorna relação completa de senadores titulares e suplentes que exerceram mandato.
  3. `GET /dadosabertos/senador/{codigo}`
     - Retorna `DadosBasicosParlamentar` com `DataNascimento`, `Naturalidade`, `UfNaturalidade` e `NomeCompletoParlamentar` para vinculação exata com o TSE.

---

## 3. Esquema de Dados: `data/votacoes-senado.json`

O arquivo segue a mesma estrutura posicional de `data/votacoes-camara.json`:

```json
{
  "fonte": {
    "portal": "https://legis.senado.leg.br/dadosabertos",
    "anos": [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
    "coletadoEm": "<ISO>"
  },
  "resumo": {
    "votacoes": 1401,
    "registrosDeVoto": 113481,
    "cadastrosDeSenador": 150,
    "partidos": 25,
    "cadastrosComMaisDeUmaSigla": 45
  },
  "alfabetoVotos": {
    "0": "sem registro nesta votação",
    "1": "Sim",
    "2": "Não",
    "3": "Abstenção",
    "4": "Obstrução",
    "5": "Presidente (art. 51 RISF)",
    "6": "registro em branco"
  },
  "minimoBancadaAferivel": 3,
  "partidos": ["PL", "PT", "PSD", "MDB", "UNIÃO", "..."],
  "colunasSenador": ["id", "nome", "nomeCompleto", "uf", "participacoes", "votosComMaioriaDoPartido", "votosEmBancadaAferivel"],
  "senadores": [
    [5894, "Flávio Bolsonaro", "Flávio Nantes Bolsonaro", "RJ", 1142, 1080, 1100]
  ],
  "filiacoes": [
    [[0, 0], [1, 200]]
  ],
  "colunas": [
    "id",
    "dataHora",
    "orgao",
    "proposicao",
    "aprovada",
    "sim",
    "nao",
    "abstencao",
    "obstrucao",
    "artigo17",
    "participantes",
    "minoria",
    "rice",
    "desercoes",
    "descricao",
    "votos"
  ],
  "votacoes": [
    ["SF-6818", "2024-02-20T14:00:00", "PLEN", "PL 2253/2022", true, 62, 2, 0, 0, 1, 65, 0.0312, 0.95, 2, "Votação nominal...", "1110002..."]
  ]
}
```

### Mapeamento do Código de Voto
- `"Sim"` -> `1`
- `"Não"` / `"Nao"` -> `2`
- `"Abstenção"` / `"Abstencao"` -> `3`
- `"Obstrução"` / `"Obstrucao"` / `"P-NRV"` -> `4`
- `"Presidente (art. 51 RISF)"` -> `5`
- Outros (`"AP"`, `"LS"`, `"LP"`, `"MIS"`, `"NA"`, `"NCom"`, ou ausente) -> `0`

---

## 4. Integração no Catálogo (`scripts/build-pokedex.mjs`)

1. **Cruzamento de Senadores com Candidatos:**
   - Senadores possuem `NomeCompletoParlamentar` e `DataNascimento`.
   - O script normaliza nomes (remoção de acentos, maiúsculas) e cruza `(NomeCompleto, DataNascimento)` com os registros de `data/candidatos-2026.json`.
   - Se houver CPF no cache do TSE (`.cache/tse/cpf-sq.json`), associa o `senadoId` diretamente ao `SQ_CANDIDATO`.

2. **Geração de Ficha Unificada:**
   - Candidato pode ter ficha na Câmara (`ficha.camara`), no Senado (`ficha.senado`), ou em ambas as casas.
   - O objeto `ficha` passa a carregar:
     ```json
     {
       "casa": "senado" | "camara" | "ambas",
       "camaraId": 220569,
       "senadoId": 5894,
       "nomeParlamentar": "Flávio Bolsonaro",
       "participacoes": 1142,
       "comMaioria": 1080,
       "bancadaAferivel": 1100,
       "votos": {
         "2270800-135": 0,
         "SF-6818": 1,
         ...
       }
     }
     ```
   - Arquivos de histórico individual gerados em `data/dex/votos/`:
     - Câmara: `data/dex/votos/{camaraId}.json`
     - Senado: `data/dex/votos/sf-{senadoId}.json`

3. **Curadoria Editorial Multicasa (`data/curadoria.json`):**
   - Associar as votações do Senado às pautas equivalentes aos eixos já existentes:
     - Reforma da Previdência (PEC 6/2019): turnos do Senado (`SF-5980`, etc.).
     - Minirreforma Trabalhista (MPV 1045/2021): votação no Senado.
     - Privatização da Eletrobras (MPV 1031/2021): votação no Senado.
     - Taxa das blusinhas (PL 914/2024): votação no Senado.
     - Limitação do STF (PEC 8/2021) e Drogas (PEC 45/2023).

---

## 5. Interface (`assets/dex.js` e `assets/dex.css`)

1. Atualizar contadores e filtros:
   - Filtro "só quem já votou no Congresso" (Câmara ou Senado).
   - Selo na carta: se tiver histórico no Senado, exibir `Histórico no Senado` (ou `Histórico no Congresso`).
2. Detalhe da ficha:
   - Título: `Histórico no Senado como Senador Flávio Bolsonaro` (ou `na Câmara`).
   - Carregamento de voto individual: se `senadoId` estiver presente, buscar `data/dex/votos/sf-{senadoId}.json`.
3. Informação contextual:
   - Para matérias rejeitadas em comissão (como a PEC 3/2021 arquivada na CCJ do Senado), explicitar na ficha que a matéria foi rejeitada na CCJ antes do Plenário.
