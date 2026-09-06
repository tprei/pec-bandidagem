import { inflateRawSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL = "https://dadosabertos.tse.jus.br/dataset/candidatos-2026";
const ZIP = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip";
const MEMBER = "consulta_cand_2026_BRASIL.csv";

const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  accept: "*/*",
  "accept-language": "pt-BR,pt;q=0.9",
  referer: PORTAL,
};

const NULL_VALUES = new Set(["#NULO", "#NULO#", "#NE", "#NE#", ""]);

async function downloadZip(url) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`${url} respondeu ${response.status} ${response.statusText}`);
  }
  const zip = Buffer.from(await response.arrayBuffer());
  if (zip.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(`${url} respondeu ${zip.length} bytes que não começam com um cabeçalho ZIP`);
  }
  return zip;
}

function findCentralDirectoryEnd(zip) {
  for (let position = zip.length - 22; position >= 0; position -= 1) {
    if (zip.readUInt32LE(position) !== 0x06054b50) continue;
    if (zip.readUInt16LE(position + 20) === zip.length - position - 22) return position;
  }
  throw new Error("fim do diretório central do ZIP não encontrado");
}

function readZipMember(zip, name) {
  const centralEnd = findCentralDirectoryEnd(zip);
  const disk = zip.readUInt16LE(centralEnd + 4);
  const centralDisk = zip.readUInt16LE(centralEnd + 6);
  if (disk !== 0 || centralDisk !== 0) {
    throw new Error(`ZIP dividido em múltiplos discos (${disk}/${centralDisk}) não é suportado`);
  }
  const totalEntries = zip.readUInt16LE(centralEnd + 10);
  if (totalEntries === 0xffff) {
    throw new Error("ZIP64 não é suportado");
  }
  let position = zip.readUInt32LE(centralEnd + 16);

  for (let entry = 0; entry < totalEntries; entry += 1) {
    if (zip.readUInt32LE(position) !== 0x02014b50) {
      throw new Error(`assinatura inválida na entrada ${entry} do diretório central`);
    }
    const flags = zip.readUInt16LE(position + 8);
    const compression = zip.readUInt16LE(position + 10);
    const compressedSize = zip.readUInt32LE(position + 20);
    const nameLength = zip.readUInt16LE(position + 28);
    const extraLength = zip.readUInt16LE(position + 30);
    const commentLength = zip.readUInt16LE(position + 32);
    const localHeaderOffset = zip.readUInt32LE(position + 42);
    const entryName = zip.toString("latin1", position + 46, position + 46 + nameLength);

    if (entryName === name) {
      if ((flags & 0x0001) !== 0) throw new Error(`${name} está criptografado`);
      if (zip.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error(`cabeçalho local inválido para ${name}`);
      }
      const localNameLength = zip.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > zip.length) throw new Error(`dados de ${name} passam do fim do arquivo`);
      const data = zip.subarray(dataStart, dataEnd);
      if (compression === 0) return data;
      if (compression === 8) return inflateRawSync(data);
      throw new Error(`método de compressão ${compression} não suportado em ${name}`);
    }

    position += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error(`${name} não encontrado no ZIP`);
}

function readCsv(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (quoted) throw new Error("CSV termina com aspas abertas");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  return body
    .filter((values) => values.length > 1 || values[0] !== "")
    .map((values) => {
      if (values.length !== header.length) {
        throw new Error(`linha com ${values.length} colunas, esperado ${header.length}`);
      }
      return Object.fromEntries(header.map((key, index) => [key, values[index]]));
    });
}

function parseText(value) {
  return NULL_VALUES.has(value) ? null : value;
}

function parseNumber(value) {
  if (!/^-?\d+$/.test(value)) throw new Error(`valor numérico inválido: ${value}`);
  return Number(value);
}

function parseIsoDate(value) {
  const parts = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (parts === null) throw new Error(`data inválida: ${value}`);
  const [, day, month, year] = parts;
  const iso = `${year}-${month}-${day}`;
  if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) {
    throw new Error(`data inexistente no calendário: ${value}`);
  }
  return iso;
}

function unique(records, key) {
  const values = new Set(records.map((record) => record[key]));
  if (values.size !== 1) {
    throw new Error(`${key} deveria ser constante, encontrei ${values.size} valores`);
  }
  return [...values][0];
}

function createDictionary(records, codeKey, buildFn) {
  const map = new Map();
  for (const record of records) {
    const raw = record[codeKey];
    if (NULL_VALUES.has(raw) || raw === "-1") continue;
    const code = parseNumber(raw);
    const value = buildFn(record);
    if (value === undefined || (typeof value === "object" && Object.values(value).includes(undefined))) {
      throw new Error(`descrição ausente para ${codeKey}=${raw}`);
    }
    const existing = map.get(code);
    if (existing === undefined) {
      map.set(code, value);
      continue;
    }
    if (JSON.stringify(existing) !== JSON.stringify(value)) {
      throw new Error(`${codeKey}=${raw} descreve dois valores diferentes`);
    }
  }
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a - b));
}

function createUniqueMap(records, codeKey, valueKey) {
  const map = new Map();
  for (const record of records) {
    const code = record[codeKey];
    const value = record[valueKey];
    if (value === undefined) throw new Error(`coluna ${valueKey} ausente no CSV`);
    const existing = map.get(code);
    if (existing === undefined) map.set(code, value);
    else if (existing !== value) {
      throw new Error(`${codeKey}=${code} aparece como ${existing} e ${value}`);
    }
  }
  return map;
}

function countBy(records, extractFn) {
  const totals = new Map();
  for (const record of records) {
    const key = extractFn(record);
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...totals.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR")));
}

const zip = await downloadZip(ZIP);
const records = readCsv(new TextDecoder("latin1").decode(readZipMember(zip, MEMBER)));
if (records.length === 0) throw new Error(`${MEMBER} veio sem registros`);

const election = {
  ano: parseNumber(unique(records, "ANO_ELEICAO")),
  turno: parseNumber(unique(records, "NR_TURNO")),
  tipo: unique(records, "NM_TIPO_ELEICAO"),
  data: parseIsoDate(unique(records, "DT_ELEICAO")),
};
if (election.ano !== 2026) throw new Error(`ANO_ELEICAO inesperado: ${election.ano}`);

const elections = createDictionary(records, "CD_ELEICAO", (record) => ({
  descricao: record.DS_ELEICAO,
  abrangencia: record.TP_ABRANGENCIA,
}));

const offices = createDictionary(records, "CD_CARGO", (record) => ({
  nome: record.DS_CARGO,
  eleicao: parseNumber(record.CD_ELEICAO),
}));

const unitName = createUniqueMap(records, "SG_UE", "NM_UE");
const units = [...unitName.keys()].sort();
const unitIndex = new Map(units.map((sigla, index) => [sigla, index]));

const birthStates = [...new Set(records.map((record) => record.SG_UF_NASCIMENTO))].sort();
const birthStateIndex = new Map(birthStates.map((sigla, index) => [sigla, index]));

const coalitions = new Map();
for (const record of records) {
  const seq = record.SQ_COLIGACAO;
  const val = {
    sq: parseNumber(seq),
    nome: record.NM_COLIGACAO,
    tipo: record.TP_AGREMIACAO,
    composicao: record.DS_COMPOSICAO_COLIGACAO,
  };
  const existing = coalitions.get(seq);
  if (existing === undefined) coalitions.set(seq, val);
  else if (JSON.stringify(existing) !== JSON.stringify(val)) {
    throw new Error(`SQ_COLIGACAO=${seq} descreve duas coligações diferentes`);
  }
}
const coalitionIndex = new Map([...coalitions.keys()].map((seq, index) => [seq, index]));

for (const record of records) {
  if (record.SG_UF !== record.SG_UE) {
    throw new Error(`SG_UF (${record.SG_UF}) diverge de SG_UE (${record.SG_UE})`);
  }
}

const columns = [
  "sq",
  "cargo",
  "ue",
  "numero",
  "nome",
  "nomeUrna",
  "nomeSocial",
  "partido",
  "federacao",
  "coligacao",
  "ufNascimento",
  "nascimento",
  "genero",
  "instrucao",
  "estadoCivil",
  "corRaca",
  "ocupacao",
];

const candidates = records
  .map((record) => [
    parseNumber(record.SQ_CANDIDATO),
    parseNumber(record.CD_CARGO),
    unitIndex.get(record.SG_UE),
    parseNumber(record.NR_CANDIDATO),
    record.NM_CANDIDATO,
    record.NM_URNA_CANDIDATO,
    parseText(record.NM_SOCIAL_CANDIDATO),
    parseNumber(record.NR_PARTIDO),
    record.NR_FEDERACAO === "-1" ? null : parseNumber(record.NR_FEDERACAO),
    coalitionIndex.get(record.SQ_COLIGACAO),
    birthStateIndex.get(record.SG_UF_NASCIMENTO),
    parseIsoDate(record.DT_NASCIMENTO),
    parseNumber(record.CD_GENERO),
    parseNumber(record.CD_GRAU_INSTRUCAO),
    parseNumber(record.CD_ESTADO_CIVIL),
    parseNumber(record.CD_COR_RACA),
    parseNumber(record.CD_OCUPACAO),
  ])
  .sort((a, b) => a[0] - b[0]);

const candidateSequentials = new Set(candidates.map((candidate) => candidate[0]));
if (candidateSequentials.size !== candidates.length) {
  throw new Error(
    `SQ_CANDIDATO repetido: ${candidates.length} linhas, ${candidateSequentials.size} sequenciais`,
  );
}

const data = {
  fonte: {
    portal: PORTAL,
    arquivo: ZIP,
    membro: MEMBER,
    geradoEm: `${parseIsoDate(unique(records, "DT_GERACAO"))}T${unique(records, "HH_GERACAO")}-03:00`,
    coletadoEm: new Date().toISOString(),
  },
  eleicao: election,
  eleicoes: elections,
  resumo: {
    totalCandidatos: candidates.length,
    porCargo: countBy(records, (record) => record.DS_CARGO),
    porUnidadeEleitoral: countBy(records, (record) => record.SG_UE),
  },
  dicionarios: {
    cargo: offices,
    unidadeEleitoral: units.map((sigla) => [sigla, unitName.get(sigla)]),
    ufNascimento: birthStates,
    partido: createDictionary(records, "NR_PARTIDO", (record) => ({
      sigla: record.SG_PARTIDO,
      nome: record.NM_PARTIDO,
    })),
    federacao: createDictionary(records, "NR_FEDERACAO", (record) => ({
      sigla: record.SG_FEDERACAO,
      nome: record.NM_FEDERACAO,
      composicao: record.DS_COMPOSICAO_FEDERACAO,
    })),
    coligacao: [...coalitions.values()],
    genero: createDictionary(records, "CD_GENERO", (record) => record.DS_GENERO),
    instrucao: createDictionary(records, "CD_GRAU_INSTRUCAO", (record) => record.DS_GRAU_INSTRUCAO),
    estadoCivil: createDictionary(records, "CD_ESTADO_CIVIL", (record) => record.DS_ESTADO_CIVIL),
    corRaca: createDictionary(records, "CD_COR_RACA", (record) => record.DS_COR_RACA),
    ocupacao: createDictionary(records, "CD_OCUPACAO", (record) => record.DS_OCUPACAO),
  },
  colunas: columns,
  candidatos: candidates,
};

const parts = [
  "{",
  ...Object.entries(data)
    .filter(([key]) => key !== "candidatos")
    .map(
      ([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replaceAll("\n", "\n  ")},`,
    )
    .map((block) => `  ${block}`),
  '  "candidatos": [',
  candidates.map((candidate) => `    ${JSON.stringify(candidate)}`).join(",\n"),
  "  ]",
  "}",
];

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(join(ROOT, "data", "candidatos-2026.json"), `${parts.join("\n")}\n`);

const byCpf = {};
for (const record of records) {
  const cpf = record.NR_CPF_CANDIDATO.padStart(11, "0");
  if (!/^\d{11}$/.test(cpf)) throw new Error(`CPF inesperado em ${record.SQ_CANDIDATO}: ${cpf}`);
  if (byCpf[cpf] === undefined) byCpf[cpf] = [];
  byCpf[cpf].push(parseNumber(record.SQ_CANDIDATO));
}
mkdirSync(join(ROOT, ".cache", "tse"), { recursive: true });
writeFileSync(join(ROOT, ".cache", "tse", "cpf-sq.json"), `${JSON.stringify(byCpf)}\n`);

console.log(`Candidaturas 2026 (TSE) — ${MEMBER}`);
console.log(`Gerado pelo TSE em: ${data.fonte.geradoEm}`);
console.log(`Total de candidaturas: ${candidates.length}`);
for (const [office, total] of Object.entries(data.resumo.porCargo)) {
  console.log(`  ${office}: ${total}`);
}
console.log(`Partidos: ${Object.keys(data.dicionarios.partido).length}`);
console.log(`Federações: ${Object.keys(data.dicionarios.federacao).length}`);
console.log(`Coligações: ${data.dicionarios.coligacao.length}`);
