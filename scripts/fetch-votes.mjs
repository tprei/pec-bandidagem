import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://dadosabertos.camara.leg.br/api/v2";
const HEADERS = { accept: "application/json" };

const TURNOS = [
  { turno: 1, votacaoId: "2270800-135" },
  { turno: 2, votacaoId: "2270800-160" },
];

const VOTO = { "Sim": "Sim", "Não": "Nao", "Abstenção": "Abstencao" };

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`GET ${url} failed with HTTP ${res.status}`);
  }
  return res.json();
}

function normalizeVoto(tipoVoto) {
  const voto = VOTO[tipoVoto];
  if (voto === undefined) {
    throw new Error(`tipoVoto desconhecido: ${JSON.stringify(tipoVoto)}`);
  }
  return voto;
}

function contar(votos, valor) {
  return votos.filter((voto) => voto === valor).length;
}

async function fetchTurno({ turno, votacaoId }) {
  const votacao = (await getJson(`${API}/votacoes/${votacaoId}`)).dados;
  if (votacao === undefined) {
    throw new Error(`votação ${votacaoId} não encontrada na API`);
  }
  const registros = (await getJson(`${API}/votacoes/${votacaoId}/votos`)).dados;
  if (!Array.isArray(registros)) {
    throw new Error(`resposta inesperada para os votos da votação ${votacaoId}`);
  }
  const votosPorDeputado = new Map();
  for (const registro of registros) {
    const id = registro.deputado_.id;
    if (votosPorDeputado.has(id)) {
      throw new Error(`deputado ${id} aparece mais de uma vez no turno ${turno}`);
    }
    votosPorDeputado.set(id, {
      voto: normalizeVoto(registro.tipoVoto),
      deputado_: registro.deputado_,
    });
  }
  const votos = [...votosPorDeputado.values()].map((registro) => registro.voto);
  const sim = contar(votos, "Sim");
  const nao = contar(votos, "Nao");
  const abstencao = contar(votos, "Abstencao");
  return {
    turno,
    registro: {
      turno,
      votacaoId,
      dataHora: votacao.dataHoraRegistro,
      descricao: votacao.descricao,
      sim,
      nao,
      abstencao,
      ausente: 513 - (sim + nao + abstencao),
    },
    votosPorDeputado,
  };
}

function csvEscape(value) {
  const texto = String(value);
  if (texto.includes(",") || texto.includes('"')) {
    return `"${texto.replaceAll('"', '""')}"`;
  }
  return texto;
}

const [proposicaoBody, ...turnos] = await Promise.all([
  getJson(`${API}/proposicoes/2270800`),
  ...TURNOS.map(fetchTurno),
]);
const proposicaoApi = proposicaoBody.dados;
if (proposicaoApi === undefined) {
  throw new Error("proposição 2270800 não encontrada na API");
}

const ids = new Set();
for (const { votosPorDeputado } of turnos) {
  for (const id of votosPorDeputado.keys()) {
    ids.add(id);
  }
}

const porPartido = new Map();
const deputados = [...ids]
  .map((id) => {
    const t1 = turnos[0].votosPorDeputado.get(id);
    const t2 = turnos[1].votosPorDeputado.get(id);
    const identidade = (t1 ?? t2).deputado_;
    const turno1 = t1 ? t1.voto : "Ausente";
    const turno2 = t2 ? t2.voto : "Ausente";
    return {
      id,
      nome: identidade.nome,
      partido: identidade.siglaPartido,
      uf: identidade.siglaUf,
      urlFoto: identidade.urlFoto,
      urlPerfil: `https://www.camara.leg.br/deputados/${id}`,
      email: identidade.email,
      turno1,
      turno2,
      votouSim: turno1 === "Sim" || turno2 === "Sim",
    };
  })
  .sort(
    (a, b) =>
      a.partido.localeCompare(b.partido, "pt-BR") ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
for (const deputado of deputados) {
  if (deputado.votouSim) {
    porPartido.set(deputado.partido, (porPartido.get(deputado.partido) ?? 0) + 1);
  }
}

const simEmAlgumTurno = deputados.filter((d) => d.votouSim).length;
const simNosDoisTurnos = deputados.filter(
  (d) => d.turno1 === "Sim" && d.turno2 === "Sim",
).length;
const ESPERADO = {
  turno1: { sim: 353, nao: 134, abstencao: 1 },
  turno2: { sim: 344, nao: 133, abstencao: 0 },
  totalDeputados: 493,
  simEmAlgumTurno: 356,
  simNosDoisTurnos: 341,
};

function conferir(esperado, obtido, rotulo) {
  for (const chave of Object.keys(esperado)) {
    if (esperado[chave] !== obtido[chave]) {
      throw new Error(
        `${rotulo}.${chave}: esperado ${esperado[chave]}, obtido ${obtido[chave]}. ` +
          "Se a Câmara corrigiu o registro oficial, confirme a mudança, atualize ESPERADO e os totais citados no site.",
      );
    }
  }
}

conferir(ESPERADO.turno1, turnos[0].registro, "turno 1");
conferir(ESPERADO.turno2, turnos[1].registro, "turno 2");
conferir(
  {
    totalDeputados: ESPERADO.totalDeputados,
    simEmAlgumTurno: ESPERADO.simEmAlgumTurno,
    simNosDoisTurnos: ESPERADO.simNosDoisTurnos,
  },
  { totalDeputados: deputados.length, simEmAlgumTurno, simNosDoisTurnos },
  "resumo",
);

const dados = {
  proposicao: {
    id: 2270800,
    sigla: `${proposicaoApi.siglaTipo} ${proposicaoApi.numero}/${proposicaoApi.ano}`,
    apelido: "PEC da Blindagem",
    ementa: proposicaoApi.ementa,
    urlFicha:
      "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2270800",
  },
  fonte: {
    api: API,
    coletadoEm: new Date().toISOString(),
  },
  votacoes: turnos.map((t) => t.registro),
  resumo: {
    totalDeputados: deputados.length,
    simEmAlgumTurno,
    simNosDoisTurnos,
  },
  deputados,
};

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(
  join(ROOT, "data", "votos-pec-blindagem.json"),
  `${JSON.stringify(dados, null, 2)}\n`,
);

const cabecalho = "id,nome,partido,uf,turno1,turno2,votou_sim,url_perfil,url_foto";
const linhas = deputados.map((d) =>
  [
    d.id,
    d.nome,
    d.partido,
    d.uf,
    d.turno1,
    d.turno2,
    d.votouSim,
    d.urlPerfil,
    d.urlFoto,
  ]
    .map(csvEscape)
    .join(","),
);
writeFileSync(
  join(ROOT, "data", "votos-pec-blindagem.csv"),
  `\uFEFF${[cabecalho, ...linhas].join("\n")}\n`,
);

console.log("PEC 3/2021 — PEC da Blindagem (Câmara dos Deputados)");
for (const { registro } of turnos) {
  console.log(
    `Turno ${registro.turno} (${registro.dataHora}): Sim=${registro.sim} Não=${registro.nao} Abstenção=${registro.abstencao} Ausente=${registro.ausente}`,
  );
}
console.log(`Total de deputados: ${deputados.length}`);
console.log(`Sim em algum turno: ${simEmAlgumTurno}`);
console.log(`Sim nos dois turnos: ${simNosDoisTurnos}`);
console.log("Partidos dos que votaram Sim:");
for (const [partido, total] of [...porPartido.entries()].sort()) {
  console.log(`  ${partido}: ${total}`);
}
