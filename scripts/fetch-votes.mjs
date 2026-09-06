import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://dadosabertos.camara.leg.br/api/v2";
const HEADERS = { accept: "application/json" };

const ROUNDS = [
  { round: 1, rollCallId: "2270800-135" },
  { round: 2, rollCallId: "2270800-160" },
];

const VOTE = { Sim: "Sim", Não: "Nao", Abstenção: "Abstencao" };

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`GET ${url} failed with HTTP ${res.status}`);
  }
  return res.json();
}

function normalizeVote(voteType) {
  const vote = VOTE[voteType];
  if (vote === undefined) {
    throw new Error(`tipoVoto desconhecido: ${JSON.stringify(voteType)}`);
  }
  return vote;
}

function countVotes(votes, value) {
  return votes.filter((vote) => vote === value).length;
}

async function fetchRound({ round, rollCallId }) {
  const rollCall = (await getJson(`${API}/votacoes/${rollCallId}`)).dados;
  if (rollCall === undefined) {
    throw new Error(`votação ${rollCallId} não encontrada na API`);
  }
  const records = (await getJson(`${API}/votacoes/${rollCallId}/votos`)).dados;
  if (!Array.isArray(records)) {
    throw new Error(`resposta inesperada para os votos da votação ${rollCallId}`);
  }
  const votesByDeputy = new Map();
  for (const record of records) {
    const id = record.deputado_.id;
    if (votesByDeputy.has(id)) {
      throw new Error(`deputado ${id} aparece mais de uma vez no turno ${round}`);
    }
    votesByDeputy.set(id, {
      voto: normalizeVote(record.tipoVoto),
      deputado_: record.deputado_,
    });
  }
  const votes = [...votesByDeputy.values()].map((record) => record.voto);
  const sim = countVotes(votes, "Sim");
  const nao = countVotes(votes, "Nao");
  const abstencao = countVotes(votes, "Abstencao");
  return {
    round,
    record: {
      turno: round,
      votacaoId: rollCallId,
      dataHora: rollCall.dataHoraRegistro,
      descricao: rollCall.descricao,
      sim,
      nao,
      abstencao,
      ausente: 513 - (sim + nao + abstencao),
    },
    votesByDeputy,
  };
}

function csvEscape(value) {
  const text = String(value);
  if (text.includes(",") || text.includes('"')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

const [billBody, ...rounds] = await Promise.all([
  getJson(`${API}/proposicoes/2270800`),
  ...ROUNDS.map(fetchRound),
]);
const billApi = billBody.dados;
if (billApi === undefined) {
  throw new Error("proposição 2270800 não encontrada na API");
}

const ids = new Set();
for (const { votesByDeputy } of rounds) {
  for (const id of votesByDeputy.keys()) {
    ids.add(id);
  }
}

const byParty = new Map();
const deputies = [...ids]
  .map((id) => {
    const t1 = rounds[0].votesByDeputy.get(id);
    const t2 = rounds[1].votesByDeputy.get(id);
    const identity = (t1 ?? t2).deputado_;
    const round1 = t1 ? t1.voto : "Ausente";
    const round2 = t2 ? t2.voto : "Ausente";
    return {
      id,
      nome: identity.nome,
      partido: identity.siglaPartido,
      uf: identity.siglaUf,
      urlFoto: identity.urlFoto,
      urlPerfil: `https://www.camara.leg.br/deputados/${id}`,
      email: identity.email,
      turno1: round1,
      turno2: round2,
      votouSim: round1 === "Sim" || round2 === "Sim",
    };
  })
  .sort((a, b) => a.partido.localeCompare(b.partido, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
for (const deputy of deputies) {
  if (deputy.votouSim) {
    byParty.set(deputy.partido, (byParty.get(deputy.partido) ?? 0) + 1);
  }
}

const yesInAnyRound = deputies.filter((d) => d.votouSim).length;
const yesInBothRounds = deputies.filter((d) => d.turno1 === "Sim" && d.turno2 === "Sim").length;

const EXPECTED = {
  round1: { sim: 353, nao: 134, abstencao: 1 },
  round2: { sim: 344, nao: 133, abstencao: 0 },
  totalDeputies: 493,
  yesInAnyRound: 356,
  yesInBothRounds: 341,
};

function verifyVotes(expected, obtained, label) {
  for (const key of Object.keys(expected)) {
    if (expected[key] !== obtained[key]) {
      throw new Error(
        `${label}.${key}: esperado ${expected[key]}, obtido ${obtained[key]}. ` +
          "Se a Câmara corrigiu o registro oficial, confirme a mudança, atualize EXPECTED e os totais citados no site.",
      );
    }
  }
}

verifyVotes(EXPECTED.round1, rounds[0].record, "turno 1");
verifyVotes(EXPECTED.round2, rounds[1].record, "turno 2");
verifyVotes(
  {
    totalDeputies: EXPECTED.totalDeputies,
    yesInAnyRound: EXPECTED.yesInAnyRound,
    yesInBothRounds: EXPECTED.yesInBothRounds,
  },
  { totalDeputies: deputies.length, yesInAnyRound, yesInBothRounds },
  "resumo",
);

const data = {
  proposicao: {
    id: 2270800,
    sigla: `${billApi.siglaTipo} ${billApi.numero}/${billApi.ano}`,
    apelido: "PEC da Blindagem",
    ementa: billApi.ementa,
    urlFicha: "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2270800",
  },
  fonte: {
    api: API,
    coletadoEm: new Date().toISOString(),
  },
  votacoes: rounds.map((r) => r.record),
  resumo: {
    totalDeputados: deputies.length,
    simEmAlgumTurno: yesInAnyRound,
    simNosDoisTurnos: yesInBothRounds,
  },
  deputados: deputies,
};

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(join(ROOT, "data", "votos-pec-blindagem.json"), `${JSON.stringify(data, null, 2)}\n`);

const header = "id,nome,partido,uf,turno1,turno2,votou_sim,url_perfil,url_foto";
const rows = deputies.map((d) =>
  [d.id, d.nome, d.partido, d.uf, d.turno1, d.turno2, d.votouSim, d.urlPerfil, d.urlFoto]
    .map(csvEscape)
    .join(","),
);
writeFileSync(join(ROOT, "data", "votos-pec-blindagem.csv"), `\uFEFF${[header, ...rows].join("\n")}\n`);

console.log("PEC 3/2021 — PEC da Blindagem (Câmara dos Deputados)");
for (const { record } of rounds) {
  console.log(
    `Turno ${record.turno} (${record.dataHora}): Sim=${record.sim} Não=${record.nao} Abstenção=${record.abstencao} Ausente=${record.ausente}`,
  );
}
console.log(`Total de deputados: ${deputies.length}`);
console.log(`Sim em algum turno: ${yesInAnyRound}`);
console.log(`Sim nos dois turnos: ${yesInBothRounds}`);
console.log("Partidos dos que votaram Sim:");
for (const [party, total] of [...byParty.entries()].sort()) {
  console.log(`  ${party}: ${total}`);
}
