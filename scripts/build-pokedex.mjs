import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://dadosabertos.camara.leg.br/api/v2";
const CACHE = join(ROOT, ".cache", "camara");
const OUTPUT_DIR = join(ROOT, "data", "dex");
const CONCURRENCY = 8;

const BADGES = {
  politico: "Político de carreira",
  seguranca: "Segurança e Forças Armadas",
  religioso: "Religioso",
  saude: "Saúde",
  educacao: "Educação",
  juridico: "Jurídico",
  comunicacao: "Comunicação",
  agro: "Agro",
  artista: "Artista",
  empresario: "Empresário",
  servidor: "Servidor público",
  sindical: "Sindical",
  trabalhador: "Trabalhador",
};

const BADGE_RULES = [
  [
    "politico",
    /^(DEPUTADO|SENADOR|VEREADOR|PRESIDENTE DA REP|GOVERNADOR|VICE-|PREFEITO|MEMBRO DO PODER|OCUPANTE DE CARGO)/,
  ],
  ["seguranca", /(POLICIAL|MILITAR|BOMBEIRO|FORÇAS ARMADAS|VIGILANTE|DELEGADO|POLÍCIA)/],
  ["religioso", /(SACERDOTE|RELIGIOS|MISSION|MEMBRO DE ORDEM)/],
  [
    "saude",
    /(MÉDICO|ENFERMEIR|ODONTÓLOGO|PSICÓLOGO|FISIOTERAPEUTA|FARMACÊUTICO|NUTRICIONISTA|FONOAUDIÓLOGO|TERAPEUTA|SANITARISTA|VETERINÁRIO)/,
  ],
  ["educacao", /(PROFESSOR|PEDAGOGO|DIRETOR DE ESTABELECIMENTO DE ENSINO|BIBLIOTEC)/],
  ["juridico", /(ADVOGADO|JUIZ|PROMOTOR|DEFENSOR|PROCURADOR|MAGISTRAD|TABELIÃO|OFICIAL DE JUSTIÇA)/],
  ["comunicacao", /(JORNALISTA|LOCUTOR|RADIALISTA|PUBLICIT|RELAÇÕES PÚBLICAS|FOTÓGRAFO|CINEAST)/],
  ["agro", /(AGRICULTOR|AGROPECU|PECUARISTA|TRABALHADOR RURAL|PESCADOR|AGRÔNOMO|EXTRATIV)/],
  ["artista", /(MÚSICO|CANTOR|ATOR |ARTIST|ESCRITOR|BAILARIN|APRESENTADOR)/],
  [
    "empresario",
    /(EMPRESÁRIO|COMERCIANTE|GERENTE|DIRIGENTE DE EMPRESA|DIRETOR DE EMPRESAS|PROPRIETÁRIO|CORRETOR|BANCÁRIO|EMPRESARI)/,
  ],
  ["servidor", /(SERVIDOR PÚBLICO|AGENTE ADMINISTRATIVO|FISCAL|AUDITOR)/],
  ["sindical", /(SINDICAL|SINDICATO)/],
  [
    "trabalhador",
    /(TRABALHADOR|MOTORISTA|MOTOBOY|COMERCIÁRIO|ELETRICISTA|MECÂNICO|CONSTRUÇÃO|OPERADOR|VENDEDOR|CABELEIREIRO|COSTUREIR|COZINHEIR|PEDREIRO|SERVENTE|MARCENEIR|SOLDADOR|PORTEIRO|GARÇOM|FEIRANTE|ARTESÃO|BORRACHEIRO|PINTOR|CARPINTEIR)/,
  ],
];

const CURRENT_LEGISLATURE_START = "2023-02-01";
const OFFICE_BY_CHAMBER = { camara: 6, senado: 5 };
const POLITICAL_OCCUPATION = new Set([
  "MINISTRO DE ESTADO",
  "GOVERNADOR",
  "PREFEITO",
  "SENADOR",
  "DEPUTADO",
  "VEREADOR",
]);
const PROFILES = { novo: "Estreante", reeleicao: "Reeleição", outro: "Já teve mandato" };

function readJson(filePath, hint) {
  if (!existsSync(filePath)) throw new Error(`${filePath} não existe. Rode ${hint} primeiro.`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeAtomic(filePath, data) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, filePath);
}

function byPosition(data, columnsKey) {
  return Object.fromEntries(data[columnsKey].map((name, index) => [name, index]));
}

function normalizeText(text) {
  return (text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function computeBadge(occupation) {
  for (const [name, rule] of BADGE_RULES) if (rule.test(occupation)) return name;
  return null;
}

function computeProfile(office, occupation, dossier) {
  if (dossier !== null && dossier.mandatoAtual !== null && OFFICE_BY_CHAMBER[dossier.mandatoAtual] === office)
    return "reeleicao";
  if (occupation === "GOVERNADOR" && office === 3) return "reeleicao";
  if (dossier !== null || POLITICAL_OCCUPATION.has(occupation)) return "outro";
  return "novo";
}

function cleanDescription(text) {
  if (!text || typeof text !== "string") return text;
  const cleaned = text
    .replace(
      /\s*(?:(?:resultado(?:\s+final)?\s*[:.]\s*|\.?\s*votaram\s+)?(?:sim|n[aã]o|abstenç[oõ]es?|total)\s*[:,\d-]|Resultado\s*[:.]\s*\d+\s+votos?\b)[^]*$/i,
      "",
    )
    .trim();
  return cleaned.length > 0 ? cleaned : text;
}

const SENSITIVE_RESEARCH_TYPES = new Set([
  "licitacao_contrato",
  "corrupcao_improbidade",
  "processo_investigacao",
  "conflito_interesses_familia",
  "conduta_pessoal",
]);

function loadResearch(candidates) {
  const sourceDir = join(ROOT, "data", "pesquisa-candidatos-2026");
  if (!existsSync(sourceDir)) return { records: new Map(), pendingReview: 0 };
  const decisions = existsSync(join(sourceDir, "revisoes.json"))
    ? (readJson(join(sourceDir, "revisoes.json"), "scripts/research-candidates-2026.mjs").decisoes ?? {})
    : {};
  const known = new Set(candidates.candidatos.map((candidate) => candidate[0]));
  const records = new Map();
  let pendingReview = 0;
  for (const name of readdirSync(sourceDir).filter(
    (file) => file.endsWith(".json") && file !== "revisoes.json",
  )) {
    const data = readJson(join(sourceDir, name), "scripts/research-candidates-2026.mjs");
    for (const record of data.candidatos ?? []) {
      if (!known.has(record.sq) || records.has(record.sq))
        throw new Error(`pesquisa duplicada ou desconhecida: ${record.sq}`);
      const shouldPublish = (item) => {
        if (
          !item.id ||
          !item.titulo ||
          !item.fato ||
          !item.trecho ||
          !item.leituraEditorial ||
          !item.papel?.descricao ||
          !item.resultado?.descricao ||
          !Array.isArray(item.fontes) ||
          item.fontes.length === 0
        )
          throw new Error(`pesquisa inválida para ${record.sq}`);
        if (
          item.fontes.some(
            (source) =>
              !/^https?:\/\//.test(source.url) ||
              !source.titulo ||
              !source.dominio ||
              !Object.hasOwn(source, "publicadoEm"),
          )
        )
          throw new Error(`fonte inválida para ${record.sq}`);
        const sensitive = SENSITIVE_RESEARCH_TYPES.has(item.tipo) || item.conflito !== "confirmado";
        const decision = decisions[item.id];
        if (sensitive && decision?.estado !== "aprovada") {
          pendingReview += 1;
          return false;
        }
        return decision?.estado !== "rejeitada";
      };
      records.set(record.sq, {
        ...record,
        favoraveis: (record.favoraveis ?? []).filter(shouldPublish),
        desfavoraveis: (record.desfavoraveis ?? []).filter(shouldPublish),
      });
    }
  }
  return { records, pendingReview };
}

async function withRetry(url) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.json();
      if (response.status === 404) return null;
      throw new Error(`respondeu ${response.status}`);
    } catch (err) {
      if (attempt === 5) throw new Error(`${url} falhou: ${err.message}`, { cause: err });
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  return null;
}

async function inParallel(items, concurrency, task) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        output[index] = await task(items[index]);
      }
    }),
  );
  return output;
}

async function fetchDeputyCpfs(ids) {
  const filePath = join(CACHE, "deputados-cpf.json");
  const cache = existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) : {};
  const missing = ids.filter((id) => cache[id] === undefined);
  if (missing.length > 0) {
    console.log(`buscando CPF de ${missing.length} deputados na API da Câmara`);
    const responses = await inParallel(missing, CONCURRENCY, (id) => withRetry(`${API}/deputados/${id}`));
    missing.forEach((id, index) => {
      const body = responses[index];
      if (body === null) throw new Error(`deputado ${id} não existe na API`);
      const cpf = body.dados.cpf;
      cache[id] = cpf === null || cpf === undefined ? null : String(cpf).replace(/\D/g, "").padStart(11, "0");
    });
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(cache)}\n`);
  }
  return cache;
}

const candidates = readJson(
  join(ROOT, "data", "candidatos-2026.json"),
  "node scripts/fetch-candidates-2026.mjs",
);
const camaraRollCalls = readJson(
  join(ROOT, "data", "votacoes-camara.json"),
  "node scripts/fetch-rollcalls-camara.mjs",
);
const senadoRollCalls = readJson(
  join(ROOT, "data", "votacoes-senado.json"),
  "node scripts/fetch-rollcalls-senado.mjs",
);
const curation = readJson(join(ROOT, "data", "curadoria.json"), "nada");
const cpfToSq = readJson(
  join(ROOT, ".cache", "tse", "cpf-sq.json"),
  "node scripts/fetch-candidates-2026.mjs",
);

const ic = byPosition(candidates, "colunas");
const ivc = byPosition(camaraRollCalls, "colunas");
const idc = byPosition(camaraRollCalls, "colunasDeputado");
const ivs = byPosition(senadoRollCalls, "colunas");
const ids = byPosition(senadoRollCalls, "colunasSenador");

const byCamaraId = new Map(camaraRollCalls.votacoes.map((v) => [v[ivc.id], v]));
const bySenadoId = new Map(senadoRollCalls.votacoes.map((v) => [v[ivs.id], v]));

const curatedRollCalls = [];
for (const axis of curation.eixos) {
  for (const reference of axis.votacoes) {
    const isSenado = reference.id.startsWith("SF-");
    const rollCall = isSenado ? bySenadoId.get(reference.id) : byCamaraId.get(reference.id);
    if (rollCall === undefined) throw new Error(`votação curada ${reference.id} não existe no dataset`);
    curatedRollCalls.push({ axis: axis.id, ...reference, rollCall, chamber: isSenado ? "senado" : "camara" });
  }
}
for (const reference of curation.contexto) {
  const isSenado = reference.id.startsWith("SF-");
  const rollCall = isSenado ? bySenadoId.get(reference.id) : byCamaraId.get(reference.id);
  if (rollCall === undefined) throw new Error(`votação de contexto ${reference.id} não existe no dataset`);
  curatedRollCalls.push({ axis: null, ...reference, rollCall, chamber: isSenado ? "senado" : "camara" });
}
const researches = loadResearch(candidates);

const deputyIds = camaraRollCalls.deputados.map((deputy) => deputy[idc.id]);
const cpfs = await fetchDeputyCpfs(deputyIds);

const sqToDeputy = new Map();
const missingCpf = [];
camaraRollCalls.deputados.forEach((deputy, index) => {
  const cpf = cpfs[deputy[idc.id]];
  if (cpf === null) {
    missingCpf.push(deputy[idc.nome]);
    return;
  }
  for (const sq of cpfToSq[cpf] ?? []) {
    const previous = sqToDeputy.get(sq);
    if (
      previous === undefined ||
      camaraRollCalls.deputados[previous][idc.participacoes] < deputy[idc.participacoes]
    ) {
      sqToDeputy.set(sq, index);
    }
  }
});
if (missingCpf.length > 0) throw new Error(`sem CPF na API: ${missingCpf.join(", ")}`);

const byNameBirth = new Map();
const byName = new Map();
for (const c of candidates.candidatos) {
  const n = normalizeText(c[ic.nome]);
  const d = c[ic.nascimento];
  if (d) byNameBirth.set(`${n}|${d}`, c);
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n).push(c);
}

const sqToSenator = new Map();
senadoRollCalls.senadores.forEach((senator, index) => {
  const fullName = normalizeText(senator[ids.nomeCompleto]);
  const birthDate = senator[ids.dataNascimento];
  let candidateMatch = null;
  if (birthDate && byNameBirth.has(`${fullName}|${birthDate}`)) {
    candidateMatch = byNameBirth.get(`${fullName}|${birthDate}`);
  } else if (byName.has(fullName) && byName.get(fullName).length === 1) {
    candidateMatch = byName.get(fullName)[0];
  }
  if (candidateMatch) {
    const sq = candidateMatch[ic.sq];
    const previous = sqToSenator.get(sq);
    if (
      previous === undefined ||
      senadoRollCalls.senadores[previous][ids.participacoes] < senator[ids.participacoes]
    ) {
      sqToSenator.set(sq, index);
    }
  }
});

const allSqs = new Set([...sqToDeputy.keys(), ...sqToSenator.keys()]);
const dossiers = new Map();

for (const sq of allSqs) {
  const deputyIndex = sqToDeputy.get(sq);
  const senatorIndex = sqToSenator.get(sq);
  const deputy = deputyIndex !== undefined ? camaraRollCalls.deputados[deputyIndex] : null;
  const senator = senatorIndex !== undefined ? senadoRollCalls.senadores[senatorIndex] : null;

  const votes = {};
  for (const curated of curatedRollCalls) {
    if (curated.chamber === "senado") {
      votes[curated.id] = senatorIndex !== undefined ? Number(curated.rollCall[ivs.votos][senatorIndex]) : 0;
    } else {
      votes[curated.id] = deputyIndex !== undefined ? Number(curated.rollCall[ivc.votos][deputyIndex]) : 0;
    }
  }

  const votedInCurrentCamara =
    deputyIndex !== undefined &&
    camaraRollCalls.votacoes.some(
      (v) => v[ivc.dataHora] >= CURRENT_LEGISLATURE_START && v[ivc.votos][deputyIndex] !== "0",
    );
  const votedInCurrentSenado =
    senatorIndex !== undefined &&
    senadoRollCalls.votacoes.some(
      (v) => v[ivs.dataHora] >= CURRENT_LEGISLATURE_START && v[ivs.votos][senatorIndex] !== "0",
    );
  const currentTerm = votedInCurrentSenado ? "senado" : votedInCurrentCamara ? "camara" : null;

  if (deputy && senator) {
    dossiers.set(sq, {
      casa: "ambas",
      mandatoAtual: currentTerm,
      camaraId: deputy[idc.id],
      senadoId: senator[ids.id],
      nomeCamara: deputy[idc.nome],
      nomeSenado: senator[ids.nome],
      nomeParlamentar: deputy[idc.nome],
      participacoes: deputy[idc.participacoes] + senator[ids.participacoes],
      participacoesCamara: deputy[idc.participacoes],
      participacoesSenado: senator[ids.participacoes],
      bancadaAferivel: deputy[idc.votosEmBancadaAferivel] + senator[ids.votosEmBancadaAferivel],
      comMaioria: deputy[idc.votosComMaioriaDoPartido] + senator[ids.votosComMaioriaDoPartido],
      votos: votes,
    });
  } else if (senator) {
    dossiers.set(sq, {
      casa: "senado",
      mandatoAtual: currentTerm,
      senadoId: senator[ids.id],
      nomeSenado: senator[ids.nome],
      nomeCamara: senator[ids.nome],
      nomeParlamentar: senator[ids.nome],
      participacoes: senator[ids.participacoes],
      participacoesSenado: senator[ids.participacoes],
      bancadaAferivel: senator[ids.votosEmBancadaAferivel],
      comMaioria: senator[ids.votosComMaioriaDoPartido],
      votos: votes,
    });
  } else if (deputy) {
    dossiers.set(sq, {
      casa: "camara",
      mandatoAtual: currentTerm,
      camaraId: deputy[idc.id],
      nomeCamara: deputy[idc.nome],
      nomeParlamentar: deputy[idc.nome],
      participacoes: deputy[idc.participacoes],
      participacoesCamara: deputy[idc.participacoes],
      bancadaAferivel: deputy[idc.votosEmBancadaAferivel],
      comMaioria: deputy[idc.votosComMaioriaDoPartido],
      votos: votes,
    });
  }
}

const byState = new Map();
for (const candidate of candidates.candidatos) {
  const [stateCode] = candidates.dicionarios.unidadeEleitoral[candidate[ic.ue]];
  const candidateList = byState.get(stateCode);
  if (candidateList === undefined) byState.set(stateCode, [candidate]);
  else candidateList.push(candidate);
}

const COLUMNS = [
  "sq",
  "numero",
  "nome",
  "nomeCompleto",
  "cargo",
  "partido",
  "coligacao",
  "badge",
  "foto",
  "perfil",
  "ficha",
];
const sortedCamaraRollCalls = [...camaraRollCalls.votacoes].sort((a, b) =>
  a[ivc.dataHora] < b[ivc.dataHora] ? -1 : a[ivc.dataHora] > b[ivc.dataHora] ? 1 : 0,
);
const totalCamaraRollCalls = sortedCamaraRollCalls.length;

const sortedSenadoRollCalls = [...senadoRollCalls.votacoes].sort((a, b) =>
  a[ivs.dataHora] < b[ivs.dataHora] ? -1 : a[ivs.dataHora] > b[ivs.dataHora] ? 1 : 0,
);
const totalSenadoRollCalls = sortedSenadoRollCalls.length;

const totalRollCalls = totalCamaraRollCalls + totalSenadoRollCalls;
const states = [];

mkdirSync(OUTPUT_DIR, { recursive: true });

for (const [stateCode, candidateList] of [...byState].sort(([a], [b]) => (a < b ? -1 : 1))) {
  const stateName = candidates.dicionarios.unidadeEleitoral.find(([current]) => current === stateCode)[1];
  const usedCoalitions = new Map();
  const rows = candidateList
    .map((candidate) => {
      const sq = candidate[ic.sq];
      const coalitionIndex = candidate[ic.coligacao];
      if (!usedCoalitions.has(coalitionIndex)) {
        usedCoalitions.set(coalitionIndex, usedCoalitions.size);
      }
      const occupation = candidates.dicionarios.ocupacao[candidate[ic.ocupacao]];
      const dossier = dossiers.get(sq) ?? null;
      let photo = null;
      if (existsSync(join(ROOT, "fotos-tse", `${sq}.jpg`))) {
        photo = "t";
      } else if (
        dossier !== null &&
        dossier.camaraId &&
        existsSync(join(ROOT, "fotos", `${dossier.camaraId}.jpg`))
      ) {
        photo = "c";
      }
      return [
        sq,
        candidate[ic.numero],
        candidate[ic.nomeUrna],
        candidate[ic.nome],
        candidate[ic.cargo],
        candidate[ic.partido],
        usedCoalitions.get(coalitionIndex),
        computeBadge(occupation),
        photo,
        computeProfile(candidate[ic.cargo], occupation, dossier),
        dossier,
      ];
    })
    .sort((a, b) => a[4] - b[4] || a[1] - b[1] || (a[2] < b[2] ? -1 : 1));

  const coalitions = [...usedCoalitions.keys()].map((index) => {
    const original = candidates.dicionarios.coligacao[index];
    return { nome: original.nome, tipo: original.tipo, composicao: original.composicao };
  });

  const withDossier = rows.filter((row) => row[10] !== null).length;
  const byProfile = { novo: 0, reeleicao: 0, outro: 0 };
  for (const row of rows) {
    const p = row[9];
    if (byProfile[p] !== undefined) byProfile[p] += 1;
  }
  writeFileSync(
    join(OUTPUT_DIR, `${stateCode}.json`),
    `${JSON.stringify({ uf: stateCode, nome: stateName, coligacoes: coalitions, colunas: COLUMNS, candidatos: rows })}\n`,
  );
  states.push({
    sigla: stateCode,
    nome: stateName,
    candidatos: rows.length,
    comFicha: withDossier,
    porPerfil: byProfile,
  });
}

const axes = curation.eixos.map((axis) => ({
  id: axis.id,
  nome: axis.nome,
  pergunta: axis.pergunta,
  posicao: axis.posicao,
  defendeOEleitor: axis.defendeOEleitor,
  contraOEleitor: axis.contraOEleitor,
  votacoes: axis.votacoes.map((reference) => {
    const isSenado = reference.id.startsWith("SF-");
    const rollCall = isSenado ? bySenadoId.get(reference.id) : byCamaraId.get(reference.id);
    const colIndex = isSenado ? ivs : ivc;
    return {
      id: reference.id,
      rotulo: reference.rotulo,
      data: rollCall[colIndex.dataHora].slice(0, 10),
      sim: rollCall[colIndex.sim],
      nao: rollCall[colIndex.nao],
      outros: rollCall[colIndex.abstencao] + rollCall[colIndex.obstrucao] + rollCall[colIndex.artigo17],
      proposicao: isSenado ? reference.id : Number(reference.id.split("-")[0]),
      idProcesso: isSenado ? rollCall[ivs.idProcesso] : null,
    };
  }),
}));

const context = curation.contexto.map((reference) => {
  const isSenado = reference.id.startsWith("SF-");
  const rollCall = isSenado ? bySenadoId.get(reference.id) : byCamaraId.get(reference.id);
  const colIndex = isSenado ? ivs : ivc;
  return {
    id: reference.id,
    rotulo: reference.rotulo,
    nota: reference.nota,
    data: rollCall[colIndex.dataHora].slice(0, 10),
    sim: rollCall[colIndex.sim],
    nao: rollCall[colIndex.nao],
    outros: rollCall[colIndex.abstencao] + rollCall[colIndex.obstrucao] + rollCall[colIndex.artigo17],
    proposicao: isSenado ? reference.id : Number(reference.id.split("-")[0]),
    idProcesso: isSenado ? rollCall[ivs.idProcesso] : null,
  };
});

const researchOutputDir = join(OUTPUT_DIR, "pesquisa");
mkdirSync(researchOutputDir, { recursive: true });
for (let shard = 0; shard < 256; shard += 1) {
  const shardCandidates = [...researches.records.values()]
    .filter((record) => record.sq % 256 === shard)
    .map((record) => {
      const { execucao: _execucao, ...publicData } = record;
      return [String(record.sq), publicData];
    })
    .sort(([a], [b]) => Number(a) - Number(b));
  writeAtomic(join(researchOutputDir, `${shard.toString(16).padStart(2, "0")}.json`), {
    schema: 1,
    candidatos: Object.fromEntries(shardCandidates),
  });
}

const publishedResearchCount = [...researches.records.values()].filter(
  (record) => record.favoraveis.length > 0 || record.desfavoraveis.length > 0,
).length;
const researchIndex = {
  schema: 1,
  rubrica: curation.pesquisa.id,
  lente: curation.pesquisa.lente,
  shards: 256,
  totalPesquisados: researches.records.size,
  totalComPublicacao: publishedResearchCount,
  totalAguardandoRevisao: researches.pendingReview,
  geradoEm: new Date().toISOString(),
};

const index = {
  fonte: {
    candidaturas: candidates.fonte.portal,
    votacoesCamara: camaraRollCalls.fonte.portal,
    votacoesSenado: senadoRollCalls.fonte.portal,
    geradoEm: new Date().toISOString(),
  },
  eleicao: candidates.eleicao,
  totalCandidatos: candidates.candidatos.length,
  totalComFicha: states.reduce((sum, state) => sum + state.comFicha, 0),
  votacoesNoHistorico: totalRollCalls,
  votacoesNoHistoricoCamara: totalCamaraRollCalls,
  votacoesNoHistoricoSenado: totalSenadoRollCalls,
  cargos: Object.fromEntries(
    Object.entries(candidates.dicionarios.cargo).map(([code, value]) => [code, value.nome]),
  ),
  partidos: candidates.dicionarios.partido,
  federacoes: candidates.dicionarios.federacao,
  badges: BADGES,
  perfis: PROFILES,
  eixos: axes,
  contexto: context,
  pesquisa: researchIndex,
  ufs: states,
};
writeAtomic(join(OUTPUT_DIR, "indice.json"), index);

const camaraRollCallRows = sortedCamaraRollCalls.map((rollCall) => [
  rollCall[ivc.id],
  rollCall[ivc.dataHora].slice(0, 10),
  rollCall[ivc.orgao],
  Number(rollCall[ivc.id].split("-")[0]),
  cleanDescription(rollCall[ivc.descricao]),
  rollCall[ivc.aprovada],
  rollCall[ivc.sim],
  rollCall[ivc.nao],
  rollCall[ivc.abstencao],
  rollCall[ivc.obstrucao],
  null,
]);

const camaraRollCallCatalog = {
  sobre: "Catálogo completo de votações nominais da Câmara dos Deputados",
  periodo: {
    de: Number(sortedCamaraRollCalls[0][ivc.dataHora].slice(0, 4)),
    ate: Number(sortedCamaraRollCalls[totalCamaraRollCalls - 1][ivc.dataHora].slice(0, 4)),
  },
  colunas: [
    "id",
    "data",
    "orgao",
    "proposicao",
    "descricao",
    "aprovada",
    "sim",
    "nao",
    "abstencao",
    "obstrucao",
    "idProcesso",
  ],
  votacoes: camaraRollCallRows,
};
writeFileSync(join(OUTPUT_DIR, "votacoes.json"), `${JSON.stringify(camaraRollCallCatalog)}\n`);

const senadoRollCallRows = sortedSenadoRollCalls.map((rollCall) => [
  rollCall[ivs.id],
  rollCall[ivs.dataHora].slice(0, 10),
  rollCall[ivs.orgao],
  rollCall[ivs.proposicao] ?? rollCall[ivs.id],
  cleanDescription(rollCall[ivs.descricao]),
  rollCall[ivs.aprovada],
  rollCall[ivs.sim],
  rollCall[ivs.nao],
  rollCall[ivs.abstencao],
  rollCall[ivs.obstrucao],
  rollCall[ivs.idProcesso],
]);

const senadoRollCallCatalog = {
  sobre: "Catálogo completo de votações nominais do Senado Federal",
  periodo: {
    de: Number(sortedSenadoRollCalls[0][ivs.dataHora].slice(0, 4)),
    ate: Number(sortedSenadoRollCalls[totalSenadoRollCalls - 1][ivs.dataHora].slice(0, 4)),
  },
  colunas: [
    "id",
    "data",
    "orgao",
    "proposicao",
    "descricao",
    "aprovada",
    "sim",
    "nao",
    "abstencao",
    "obstrucao",
    "idProcesso",
  ],
  votacoes: senadoRollCallRows,
};
writeFileSync(join(OUTPUT_DIR, "votacoes-senado.json"), `${JSON.stringify(senadoRollCallCatalog)}\n`);

const ROLLCALLS_DIR = join(OUTPUT_DIR, "votos");
mkdirSync(ROLLCALLS_DIR, { recursive: true });

const deputiesWithDossier = new Map();
for (const index of sqToDeputy.values()) {
  const dep = camaraRollCalls.deputados[index];
  if (dep !== undefined) deputiesWithDossier.set(dep[idc.id], index);
}

const votesByCamaraId = new Map();
for (const [camaraId] of deputiesWithDossier) {
  votesByCamaraId.set(camaraId, new Array(totalCamaraRollCalls));
}

for (let i = 0; i < totalCamaraRollCalls; i += 1) {
  const rollCall = sortedCamaraRollCalls[i];
  const voteString = rollCall[ivc.votos];
  for (const [camaraId, index] of deputiesWithDossier) {
    votesByCamaraId.get(camaraId)[i] = voteString[index] ?? "0";
  }
}

for (const [camaraId, voteArray] of votesByCamaraId) {
  const voteContent = `${JSON.stringify({ camaraId, votos: voteArray.join("") })}\n`;
  writeFileSync(join(ROLLCALLS_DIR, `${camaraId}.json`), voteContent);
}

const senatorsWithDossier = new Map();
for (const index of sqToSenator.values()) {
  const sen = senadoRollCalls.senadores[index];
  if (sen !== undefined) senatorsWithDossier.set(sen[ids.id], index);
}

const votesBySenadoId = new Map();
for (const [senadoId] of senatorsWithDossier) {
  votesBySenadoId.set(senadoId, new Array(totalSenadoRollCalls));
}

for (let i = 0; i < totalSenadoRollCalls; i += 1) {
  const rollCall = sortedSenadoRollCalls[i];
  const voteString = rollCall[ivs.votos];
  for (const [senadoId, index] of senatorsWithDossier) {
    votesBySenadoId.get(senadoId)[i] = voteString[index] ?? "0";
  }
}

for (const [senadoId, voteArray] of votesBySenadoId) {
  const voteContent = `${JSON.stringify({ senadoId, votos: voteArray.join("") })}\n`;
  writeFileSync(join(ROLLCALLS_DIR, `sf-${senadoId}.json`), voteContent);
}

console.log(`\nCatálogo gerado em data/dex/`);
console.log(`Candidaturas: ${candidates.candidatos.length} em ${states.length} unidades eleitorais`);
console.log(
  `Com ficha de votação: ${index.totalComFicha} (${sqToDeputy.size} da Câmara, ${sqToSenator.size} do Senado)`,
);
console.log(
  `Votações no catálogo: ${totalRollCalls} (${totalCamaraRollCalls} Câmara, ${totalSenadoRollCalls} Senado)`,
);
console.log(`Históricos de voto salvos: ${votesByCamaraId.size} Câmara, ${votesBySenadoId.size} Senado`);
