import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "senado");
const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const MIN_BENCH = 3;
const DETAIL_CONCURRENCY = 6;

const VOTE_LABEL = {
  0: "sem registro nesta votação",
  1: "Sim",
  2: "Não",
  3: "Abstenção",
  4: "Obstrução / P-NRV",
  5: "Presidente (art. 51 RISF)",
  6: "registro em branco",
};

function normalizeVote(acronym) {
  if (!acronym || typeof acronym !== "string") return 0;
  const s = acronym.trim().toLowerCase();
  if (s === "sim") return 1;
  if (s === "não" || s === "nao") return 2;
  if (s === "abstenção" || s === "abstencao") return 3;
  if (s.includes("obstru") || s === "p-nrv") return 4;
  if (s.includes("presidente") || s.includes("artigo 17") || s.includes("art. 51")) return 5;
  if (s === "em branco" || s === "branco") return 6;
  return 0;
}

async function fetchJsonViaCurl(url, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(
        "curl",
        [
          "-s",
          "-4",
          "--retry",
          "3",
          "--max-time",
          "90",
          "-H",
          "Accept: application/json",
          "-H",
          "User-Agent: Mozilla/5.0",
          url,
        ],
        { maxBuffer: 100 * 1024 * 1024 },
      );
      if (!stdout || stdout.trim().length === 0) {
        throw new Error("resposta vazia do curl");
      }
      return JSON.parse(stdout);
    } catch (error) {
      if (attempt === maxRetries) {
        throw new Error(`Falha definitiva ao buscar ${url}: ${error.message}`, { cause: error });
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  return null;
}

async function inParallel(items, limit, task) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        output[index] = await task(items[index]);
      }
    }),
  );
  return output;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

mkdirSync(CACHE, { recursive: true });

console.log("1. Buscando votações nominais do Senado (2017–2026)...");
const allRawRollCalls = [];
for (const year of YEARS) {
  const cacheFile = join(CACHE, `votacoes-${year}.json`);
  let yearData;
  if (existsSync(cacheFile)) {
    yearData = JSON.parse(readFileSync(cacheFile, "utf8"));
  } else {
    process.stdout.write(`  Baixando ${year}... `);
    const url = `https://legis.senado.leg.br/dadosabertos/votacao?dataInicio=${year}-01-01&dataFim=${year}-12-31`;
    yearData = await fetchJsonViaCurl(url);
    if (!Array.isArray(yearData)) yearData = [];
    writeFileSync(cacheFile, `${JSON.stringify(yearData)}\n`);
    console.log(`${yearData.length} votações.`);
  }
  allRawRollCalls.push(...yearData);
}
console.log(`Total de votações brutas coletadas: ${allRawRollCalls.length}`);

console.log("\n2. Identificando senadores das votações e legislaturas...");
const votingSenatorIds = new Set();
for (const v of allRawRollCalls) {
  for (const voto of v.votos ?? []) {
    if (voto.codigoParlamentar !== undefined && voto.codigoParlamentar !== null) {
      votingSenatorIds.add(Number(voto.codigoParlamentar));
    }
  }
}
console.log(`Senadores votantes únicos nas votações: ${votingSenatorIds.size}`);

const cacheLegislatures = join(CACHE, "senadores-legislaturas.json");
let senatorsByLegislation = {};
if (existsSync(cacheLegislatures)) {
  senatorsByLegislation = JSON.parse(readFileSync(cacheLegislatures, "utf8"));
} else {
  for (const leg of [55, 56, 57]) {
    process.stdout.write(`  Baixando lista da legislatura ${leg}... `);
    const url = `https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/${leg}`;
    const data = await fetchJsonViaCurl(url);
    const parls = data?.ListaParlamentarLegislatura?.Parlamentares?.Parlamentar ?? [];
    for (const p of parls) {
      const ident = p.IdentificacaoParlamentar;
      const cod = Number(ident.CodigoParlamentar);
      if (!senatorsByLegislation[cod]) {
        senatorsByLegislation[cod] = {
          id: cod,
          nome: ident.NomeParlamentar,
          nomeCompleto: ident.NomeCompletoParlamentar,
          uf: ident.UfParlamentar ?? null,
          partido: ident.SiglaPartidoParlamentar ?? null,
        };
      }
    }
    console.log(`${parls.length} registros.`);
  }
  writeFileSync(cacheLegislatures, `${JSON.stringify(senatorsByLegislation)}\n`);
}

const allSenatorIds = new Set([...votingSenatorIds, ...Object.keys(senatorsByLegislation).map(Number)]);
console.log(`Total de senadores mapeados no período: ${allSenatorIds.size}`);

console.log("\n3. Buscando dados detalhados dos senadores (data de nascimento, filiação)...");
const cacheDetails = join(CACHE, "senadores-detalhe.json");
let senatorDetails = existsSync(cacheDetails) ? JSON.parse(readFileSync(cacheDetails, "utf8")) : {};

const missingIds = [...allSenatorIds].filter((id) => !senatorDetails[id]);
if (missingIds.length > 0) {
  console.log(`  Buscando detalhes de ${missingIds.length} senadores na API...`);
  const results = await inParallel(missingIds, DETAIL_CONCURRENCY, async (id) => {
    try {
      const url = `https://legis.senado.leg.br/dadosabertos/senador/${id}`;
      return await fetchJsonViaCurl(url, 3);
    } catch {
      return null;
    }
  });
  missingIds.forEach((id, i) => {
    const raw = results[i];
    const parl = raw?.DetalheParlamentar?.Parlamentar;
    const ident = parl?.IdentificacaoParlamentar;
    const basicos = parl?.DadosBasicosParlamentar;
    senatorDetails[id] = {
      id,
      nome: ident?.NomeParlamentar ?? senatorsByLegislation[id]?.nome ?? `Senador ${id}`,
      nomeCompleto:
        ident?.NomeCompletoParlamentar ?? senatorsByLegislation[id]?.nomeCompleto ?? `Senador ${id}`,
      sexo: ident?.SexoParlamentar ?? null,
      uf: ident?.UfParlamentar ?? senatorsByLegislation[id]?.uf ?? null,
      partido: ident?.SiglaPartidoParlamentar ?? senatorsByLegislation[id]?.partido ?? null,
      dataNascimento: basicos?.DataNascimento ?? null,
      naturalidade: basicos?.Naturalidade ?? null,
      ufNaturalidade: basicos?.UfNaturalidade ?? null,
    };
  });
  writeFileSync(cacheDetails, `${JSON.stringify(senatorDetails)}\n`);
}
console.log(`Detalhes carregados para ${Object.keys(senatorDetails).length} senadores.`);

console.log("\n4. Indexando senadores e partidos...");
const senatorsList = [...votingSenatorIds].sort((a, b) => a - b);
const totalSenators = senatorsList.length;
const senatorPosition = new Map(senatorsList.map((id, index) => [id, index]));

const partyNames = new Map();
function normalizeParty(acronym) {
  if (!acronym || typeof acronym !== "string") return "S/PARTIDO";
  const s = acronym.trim().toUpperCase();
  return s.length === 0 ? "S/PARTIDO" : s;
}

for (const v of allRawRollCalls) {
  for (const voto of v.votos ?? []) {
    const p = normalizeParty(voto.siglaPartidoParlamentar);
    if (!partyNames.has(p)) partyNames.set(p, partyNames.size);
  }
}
const partyList = [...partyNames.keys()];
console.log(`Partidos únicos identificados: ${partyList.length}`);

console.log("\n5. Ordenando votações cronologicamente e eliminando duplicatas...");
const rollCallsMap = new Map();
for (const v of allRawRollCalls) {
  const idVotacao = `SF-${v.codigoSessaoVotacao}`;
  if (!rollCallsMap.has(idVotacao)) {
    rollCallsMap.set(idVotacao, v);
  }
}

const orderedRollCalls = [...rollCallsMap.values()].sort((a, b) => {
  const dataA = a.dataSessao ?? "";
  const dataB = b.dataSessao ?? "";
  if (dataA !== dataB) return dataA < dataB ? -1 : 1;
  return (a.codigoSessaoVotacao ?? 0) - (b.codigoSessaoVotacao ?? 0);
});
console.log(`Total de votações únicas no histórico: ${orderedRollCalls.length}`);

console.log("\n6. Construindo matriz de votos e calculando métricas...");
const totalRollCalls = orderedRollCalls.length;
const voteMatrix = new Uint8Array(totalRollCalls * totalSenators);
const partyMatrix = new Uint8Array(totalRollCalls * totalSenators);

let totalVoteRecords = 0;
orderedRollCalls.forEach((v, idxRollCall) => {
  const base = idxRollCall * totalSenators;
  for (const voto of v.votos ?? []) {
    const cod = Number(voto.codigoParlamentar);
    const idxSenator = senatorPosition.get(cod);
    if (idxSenator === undefined) continue;
    const codVote = normalizeVote(voto.siglaVotoParlamentar);
    const codParty = partyNames.get(normalizeParty(voto.siglaPartidoParlamentar)) ?? 0;
    voteMatrix[base + idxSenator] = codVote;
    partyMatrix[base + idxSenator] = codParty + 1;
    if (codVote !== 0) totalVoteRecords += 1;
  }
});

const participations = new Int32Array(totalSenators);
const withMajority = new Int32Array(totalSenators);
const measurableBench = new Int32Array(totalSenators);
const affiliations = Array.from({ length: totalSenators }, () => []);

const rollCallColumns = [
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
  "votos",
  "idProcesso",
];

const processedRollCalls = orderedRollCalls.map((v, order) => {
  const idVotacao = `SF-${v.codigoSessaoVotacao}`;
  const base = order * totalSenators;
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const yesVotesByParty = new Int32Array(partyList.length);
  const noVotesByParty = new Int32Array(partyList.length);
  const partyMembers = new Map();
  let participants = 0;

  for (let s = 0; s < totalSenators; s += 1) {
    const codVote = voteMatrix[base + s];
    if (codVote === 0) continue;
    participants += 1;
    counts[codVote] += 1;
    participations[s] += 1;

    const partyIdx = partyMatrix[base + s] - 1;
    if (partyIdx >= 0) {
      const fil = affiliations[s];
      const last = fil.at(-1);
      if (last === undefined || last[0] !== partyIdx) fil.push([partyIdx, order]);
    }

    if (codVote === 1) yesVotesByParty[partyIdx] += 1;
    else if (codVote === 2) noVotesByParty[partyIdx] += 1;

    if (codVote === 1 || codVote === 2) {
      const list = partyMembers.get(partyIdx);
      if (list === undefined) partyMembers.set(partyIdx, [s]);
      else list.push(s);
    }
  }

  const effective = counts[1] + counts[2];
  let sumRice = 0;
  let measurable = 0;
  let defections = 0;

  for (const [partyIdx, list] of partyMembers) {
    const totalBench = yesVotesByParty[partyIdx] + noVotesByParty[partyIdx];
    if (totalBench < MIN_BENCH) continue;
    sumRice += Math.abs(yesVotesByParty[partyIdx] - noVotesByParty[partyIdx]);
    measurable += totalBench;

    if (yesVotesByParty[partyIdx] === noVotesByParty[partyIdx]) continue;
    const majority = yesVotesByParty[partyIdx] > noVotesByParty[partyIdx] ? 1 : 2;

    for (const senatorIdx of list) {
      measurableBench[senatorIdx] += 1;
      if (voteMatrix[base + senatorIdx] === majority) {
        withMajority[senatorIdx] += 1;
      } else {
        defections += 1;
      }
    }
  }

  const approved =
    v.resultadoVotacao === "A" ? true : v.resultadoVotacao === "R" ? false : counts[1] > counts[2];

  const dataHora = v.dataSessao ? `${v.dataSessao}T14:00:00` : null;
  const proposicao = v.identificacao ?? null;
  const descricao = v.descricaoVotacao ?? "";

  return [
    idVotacao,
    dataHora,
    "PLEN",
    proposicao,
    approved,
    counts[1],
    counts[2],
    counts[3],
    counts[4],
    counts[5],
    participants,
    effective === 0 ? null : round(Math.min(counts[1], counts[2]) / effective, 4),
    measurable === 0 ? null : round(sumRice / measurable, 4),
    defections,
    descricao,
    voteMatrix.subarray(base, base + totalSenators).join(""),
    v.idProcesso ?? null,
  ];
});

const senatorColumns = [
  "id",
  "nome",
  "nomeCompleto",
  "uf",
  "participacoes",
  "votosComMaioriaDoPartido",
  "votosEmBancadaAferivel",
  "dataNascimento",
];

const structuredSenators = senatorsList.map((id, index) => {
  const det = senatorDetails[id] ?? {};
  return [
    id,
    det.nome ?? `Senador ${id}`,
    det.nomeCompleto ?? `Senador ${id}`,
    det.uf ?? "",
    participations[index],
    withMajority[index],
    measurableBench[index],
    det.dataNascimento ?? null,
  ];
});

const finalData = {
  fonte: {
    portal: "https://legis.senado.leg.br/dadosabertos",
    anos: YEARS,
    coletadoEm: new Date().toISOString(),
  },
  resumo: {
    votacoes: processedRollCalls.length,
    registrosDeVoto: totalVoteRecords,
    cadastrosDeSenador: totalSenators,
    partidos: partyList.length,
    cadastrosComMaisDeUmaSigla: affiliations.filter((f) => f.length > 1).length,
  },
  alfabetoVotos: VOTE_LABEL,
  minimoBancadaAferivel: MIN_BENCH,
  partidos: partyList,
  colunasSenador: senatorColumns,
  senadores: structuredSenators,
  filiacoes: affiliations,
  colunas: rollCallColumns,
  votacoes: processedRollCalls,
};

const parts = [
  "{",
  ...Object.entries(finalData)
    .filter(([key]) => key !== "votacoes")
    .map(
      ([key, value]) =>
        `  ${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replaceAll("\n", "\n  ")},`,
    ),
  '  "votacoes": [',
  processedRollCalls.map((rollCall) => `    ${JSON.stringify(rollCall)}`).join(",\n"),
  "  ]",
  "}",
];

const outputPath = join(ROOT, "data", "votacoes-senado.json");
mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(outputPath, `${parts.join("\n")}\n`);

console.log("\n=======================================================");
console.log(`Votações nominais do Senado ${YEARS.at(0)}–${YEARS.at(-1)}`);
console.log(`Votações: ${processedRollCalls.length}`);
console.log(`Registros nominais de voto: ${totalVoteRecords}`);
console.log(`Cadastros de senador: ${totalSenators}`);
console.log(`Partidos: ${partyList.length}`);
console.log(`Arquivo gerado: data/votacoes-senado.json`);
console.log("=======================================================\n");
