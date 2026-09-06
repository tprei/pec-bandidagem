import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "camara");
const PORTAL = "https://dadosabertos.camara.leg.br/arquivos";
const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const RETRIES = 8;
const MIN_BENCH = 5;

const VOTE_CODE = new Map([
  ["", 6],
  ["Sim", 1],
  ["Não", 2],
  ["Abstenção", 3],
  ["Obstrução", 4],
  ["Artigo 17", 5],
]);

const VOTE_LABEL = {
  0: "sem registro nesta votação",
  1: "Sim",
  2: "Não",
  3: "Abstenção",
  4: "Obstrução",
  5: "Artigo 17 (Presidência)",
  6: "registro em branco",
};

function url(type, year) {
  return `${PORTAL}/${type}/csv/${type}-${year}.csv`;
}

function cachePath(type, year) {
  return join(CACHE, `${type}-${year}.csv`);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readManifest() {
  const file = join(CACHE, "manifesto.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

function writeManifest(manifest) {
  writeFileSync(join(CACHE, "manifesto.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function probeRemote(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`HEAD respondeu ${response.status} ${response.statusText}`);
      const size = Number(response.headers.get("content-length"));
      if (!Number.isInteger(size) || size <= 0) throw new Error("content-length ausente ou inutilizável");
      const etag = response.headers.get("etag");
      if (etag === null) throw new Error("etag ausente");
      return { size, etag };
    } catch (error) {
      lastError = error;
      await sleep(2000 * attempt);
    }
  }
  throw new Error(`não foi possível medir ${url}: ${lastError.message}`);
}

function fileSummary(dest) {
  return createHash("sha256").update(readFileSync(dest)).digest("hex");
}

function log(manifest, key, remote, dest) {
  manifest[key] = {
    tamanho: remote.size,
    etag: remote.etag,
    bytes: statSync(dest).size,
    sha256: fileSummary(dest),
  };
  writeManifest(manifest);
}

async function downloadFile(url, dest, manifest) {
  const key = dest.slice(CACHE.length + 1);
  const remote = await probeRemote(url);
  const record = manifest[key];
  const local = existsSync(dest) ? statSync(dest).size : 0;
  const isTrusted =
    local > 0 &&
    record?.etag === remote.etag &&
    (record.tamanho ?? record.size) === remote.size &&
    record.bytes === local &&
    record.sha256 === fileSummary(dest);

  if (isTrusted && local === remote.size) return false;
  if (local > 0 && !isTrusted) rmSync(dest);

  let lastError = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    const obtained = existsSync(dest) ? statSync(dest).size : 0;
    if (obtained === remote.size) {
      log(manifest, key, remote, dest);
      return true;
    }
    if (obtained > remote.size) {
      throw new Error(`${key} tem ${obtained} bytes, mais que os ${remote.size} da origem`);
    }
    try {
      const headers = obtained > 0 ? { range: `bytes=${obtained}-`, "if-range": remote.etag } : {};
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(600_000) });
      if (response.body === null) throw new Error("resposta sem corpo");

      let append = obtained > 0;
      if (append && response.status === 200) append = false;
      else if (append) {
        if (response.status !== 206) throw new Error(`retomada recusada com ${response.status}`);
        const range = response.headers.get("content-range");
        const expected = `bytes ${obtained}-${remote.size - 1}/${remote.size}`;
        if (range !== expected) throw new Error(`content-range ${range} não corresponde a ${expected}`);
      } else if (!response.ok) {
        throw new Error(`respondeu ${response.status} ${response.statusText}`);
      }

      await pipeline(Readable.fromWeb(response.body), createWriteStream(dest, { flags: append ? "a" : "w" }));
    } catch (error) {
      lastError = error;
      if (existsSync(dest)) log(manifest, key, remote, dest);
      await sleep(1000 * attempt);
      continue;
    }
    log(manifest, key, remote, dest);
  }

  const obtained = existsSync(dest) ? statSync(dest).size : 0;
  if (obtained !== remote.size) {
    throw new Error(
      `${key} ficou em ${obtained} de ${remote.size} bytes após ${RETRIES} tentativas: ${lastError?.message}`,
    );
  }
  log(manifest, key, remote, dest);
  return true;
}

function parseCsvStream(file, onRow) {
  const raw = readFileSync(file, "utf8");
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  let header = null;
  let indices = null;
  let row = [];
  let field = "";
  let quoted = false;

  const closeRow = () => {
    row.push(field);
    field = "";
    if (header === null) {
      header = row;
      indices = Object.fromEntries(header.map((key, pos) => [key, pos]));
    } else {
      if (row.length !== header.length) {
        throw new Error(`${file}: linha com ${row.length} colunas, esperado ${header.length}`);
      }
      onRow(row, indices);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = false;
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === ";") {
      row.push(field);
      field = "";
    } else if (char === "\n") closeRow();
    else if (char !== "\r") field += char;
  }
  if (quoted) throw new Error(`${file}: termina com aspas abertas`);
  if (field !== "" || row.length > 0) closeRow();
}

function parseInteger(value, context) {
  if (!/^-?\d+$/.test(value)) throw new Error(`inteiro inválido em ${context}: ${JSON.stringify(value)}`);
  return Number(value);
}

function parseBoolean(value, context) {
  if (value === "1") return true;
  if (value === "0") return false;
  throw new Error(`booleano inválido em ${context}: ${JSON.stringify(value)}`);
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function allocate(map, key) {
  let index = map.get(key);
  if (index === undefined) {
    index = map.size;
    map.set(key, index);
  }
  return index;
}

function predominant(counts) {
  let chosen = null;
  let best = -1;
  for (const [value, count] of counts) {
    if (count > best) {
      chosen = value;
      best = count;
    }
  }
  return chosen;
}

mkdirSync(CACHE, { recursive: true });

const manifest = readManifest();
for (const year of YEARS) {
  for (const type of ["votacoes", "votacoesVotos"]) {
    const downloaded = await downloadFile(url(type, year), cachePath(type, year), manifest);
    const size = statSync(cachePath(type, year)).size;
    console.log(`${downloaded ? "baixado" : "em cache"} ${type}-${year}.csv ${size} bytes`);
  }
}

const metadata = new Map();
for (const year of YEARS) {
  parseCsvStream(cachePath("votacoes", year), (row, indices) => {
    const id = row[indices.id];
    if (metadata.has(id)) throw new Error(`votação ${id} aparece em mais de um arquivo`);
    metadata.set(id, {
      dataHora: row[indices.dataHoraRegistro],
      orgao: row[indices.siglaOrgao],
      aprovacao: row[indices.aprovacao],
      proposicao: row[indices.ultimaApresentacaoProposicao_idProposicao],
      descricao: row[indices.descricao],
    });
  });
}

const rollCallIds = new Map();
const deputyIds = new Map();
const partyIds = new Map();
const names = [];
const states = [];
const seqRollCall = [];
const seqDeputy = [];
const seqCode = [];
const seqParty = [];

for (const year of YEARS) {
  parseCsvStream(cachePath("votacoesVotos", year), (row, indices) => {
    const code = VOTE_CODE.get(row[indices.voto]);
    if (code === undefined) {
      throw new Error(`voto desconhecido em ${row[indices.idVotacao]}: ${JSON.stringify(row[indices.voto])}`);
    }
    const deputy = allocate(deputyIds, row[indices.deputado_id]);
    const spellings = names[deputy] ?? (names[deputy] = new Map());
    spellings.set(row[indices.deputado_nome], (spellings.get(row[indices.deputado_nome]) ?? 0) + 1);
    const ufsMap = states[deputy] ?? (states[deputy] = new Map());
    ufsMap.set(row[indices.deputado_siglaUf], (ufsMap.get(row[indices.deputado_siglaUf]) ?? 0) + 1);
    seqRollCall.push(allocate(rollCallIds, row[indices.idVotacao]));
    seqDeputy.push(deputy);
    seqCode.push(code);
    seqParty.push(allocate(partyIds, row[indices.deputado_siglaPartido]));
  });
}

for (const id of rollCallIds.keys()) {
  if (!metadata.has(id)) throw new Error(`votação ${id} tem votos mas não tem metadados`);
}
if (partyIds.size > 255) throw new Error(`${partyIds.size} partidos não cabem em um byte`);

const totalDeputies = deputyIds.size;
const chronological = [...rollCallIds.keys()].sort((a, b) => {
  const ma = metadata.get(a);
  const mb = metadata.get(b);
  if (ma.dataHora !== mb.dataHora) return ma.dataHora < mb.dataHora ? -1 : 1;
  return a < b ? -1 : 1;
});
const position = new Int32Array(rollCallIds.size);
chronological.forEach((id, order) => {
  position[rollCallIds.get(id)] = order;
});

const matrix = new Uint8Array(chronological.length * totalDeputies);
const benchMatrix = new Uint8Array(chronological.length * totalDeputies);
for (let i = 0; i < seqRollCall.length; i += 1) {
  const target = position[seqRollCall[i]] * totalDeputies + seqDeputy[i];
  if (matrix[target] !== 0) {
    throw new Error(
      `deputado ${seqDeputy[i]} tem dois votos na votação ${chronological[position[seqRollCall[i]]]}`,
    );
  }
  matrix[target] = seqCode[i];
  benchMatrix[target] = seqParty[i] + 1;
}

const participations = new Int32Array(totalDeputies);
const withMajority = new Int32Array(totalDeputies);
const possibleLoyal = new Int32Array(totalDeputies);
const affiliations = Array.from({ length: totalDeputies }, () => []);

const columns = [
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
];

const rollCalls = chronological.map((id, order) => {
  const meta = metadata.get(id);
  const base = order * totalDeputies;
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const yes = new Int32Array(partyIds.size);
  const no = new Int32Array(partyIds.size);
  const members = new Map();
  let participants = 0;

  for (let deputy = 0; deputy < totalDeputies; deputy += 1) {
    const code = matrix[base + deputy];
    if (code === 0) continue;
    participants += 1;
    counts[code] += 1;
    const party = benchMatrix[base + deputy] - 1;
    const affiliation = affiliations[deputy];
    const last = affiliation.at(-1);
    if (last === undefined || last[0] !== party) affiliation.push([party, order]);
    participations[deputy] += 1;
    if (code !== 1 && code !== 2) continue;
    if (code === 1) yes[party] += 1;
    else no[party] += 1;
    const list = members.get(party);
    if (list === undefined) members.set(party, [deputy]);
    else list.push(deputy);
  }

  const effective = counts[1] + counts[2];
  let sumRice = 0;
  let measurable = 0;
  let defections = 0;
  for (const [party, list] of members) {
    const total = yes[party] + no[party];
    if (total < MIN_BENCH) continue;
    sumRice += Math.abs(yes[party] - no[party]);
    measurable += total;
    if (yes[party] === no[party]) continue;
    const majority = yes[party] > no[party] ? 1 : 2;
    for (const deputy of list) {
      possibleLoyal[deputy] += 1;
      if (matrix[base + deputy] === majority) withMajority[deputy] += 1;
      else defections += 1;
    }
  }

  return [
    id,
    meta.dataHora,
    meta.orgao,
    meta.proposicao === "0" ? null : parseInteger(meta.proposicao, `proposição de ${id}`),
    meta.aprovacao === "" ? null : parseBoolean(meta.aprovacao, `aprovação de ${id}`),
    counts[1],
    counts[2],
    counts[3],
    counts[4],
    counts[5],
    participants,
    effective === 0 ? null : round(Math.min(counts[1], counts[2]) / effective, 4),
    measurable === 0 ? null : round(sumRice / measurable, 4),
    defections,
    meta.descricao,
    matrix.subarray(base, base + totalDeputies).join(""),
  ];
});

const totalParticipants = rollCalls.reduce((total, rollCall) => total + rollCall[10], 0);
if (totalParticipants !== seqRollCall.length) {
  throw new Error(`participantes somam ${totalParticipants}, mas há ${seqRollCall.length} registros de voto`);
}

const data = {
  fonte: {
    portal: PORTAL,
    arquivos: YEARS.flatMap((year) => [url("votacoes", year), url("votacoesVotos", year)]),
    anos: YEARS,
    coletadoEm: new Date().toISOString(),
  },
  resumo: {
    votacoes: rollCalls.length,
    registrosDeVoto: seqRollCall.length,
    cadastrosDeDeputado: totalDeputies,
    partidos: partyIds.size,
    cadastrosComMaisDeUmaSigla: affiliations.filter((affiliation) => affiliation.length > 1).length,
  },
  alfabetoVotos: VOTE_LABEL,
  minimoBancadaAferivel: MIN_BENCH,
  partidos: [...partyIds.keys()],
  colunasDeputado: [
    "id",
    "nome",
    "uf",
    "participacoes",
    "votosComMaioriaDoPartido",
    "votosEmBancadaAferivel",
  ],
  deputados: [...deputyIds.keys()].map((id, index) => [
    parseInteger(id, `id de deputado ${id}`),
    predominant(names[index]),
    predominant(states[index]),
    participations[index],
    withMajority[index],
    possibleLoyal[index],
  ]),
  filiacoes: affiliations,
  colunas: columns,
  votacoes: rollCalls,
};

const parts = [
  "{",
  ...Object.entries(data)
    .filter(([key]) => key !== "votacoes")
    .map(
      ([key, value]) =>
        `  ${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replaceAll("\n", "\n  ")},`,
    ),
  '  "votacoes": [',
  rollCalls.map((rollCall) => `    ${JSON.stringify(rollCall)}`).join(",\n"),
  "  ]",
  "}",
];

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(join(ROOT, "data", "votacoes-camara.json"), `${parts.join("\n")}\n`);

const withPower = rollCalls.filter((rollCall) => rollCall[11] !== null && rollCall[11] >= 0.05);
const pureLine = withPower.filter((rollCall) => rollCall[12] > 0.95);
console.log(`\nVotações nominais da Câmara ${YEARS.at(0)}-${YEARS.at(-1)}`);
console.log(`Votações: ${rollCalls.length}`);
console.log(`Registros de voto: ${seqRollCall.length}`);
console.log(
  `Cadastros de deputado: ${totalDeputies} (${data.resumo.cadastrosComMaisDeUmaSigla} com mais de uma sigla)`,
);
console.log(`Com poder discriminante (minoria >= 5%): ${withPower.length}`);
console.log(`  dessas, linha partidária quase pura (Rice > 0,95): ${pureLine.length}`);
console.log(`Deserções somadas: ${rollCalls.reduce((total, rollCall) => total + rollCall[13], 0)}`);
