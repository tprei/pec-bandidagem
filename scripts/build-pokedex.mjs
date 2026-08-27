import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://dadosabertos.camara.leg.br/api/v2";
const CACHE = join(ROOT, ".cache", "camara");
const SAIDA = join(ROOT, "data", "dex");
const SIMULTANEAS = 16;

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

const REGRAS_BADGE = [
  ["politico", /^(DEPUTADO|SENADOR|VEREADOR|PRESIDENTE DA REP|GOVERNADOR|VICE-|PREFEITO|MEMBRO DO PODER|OCUPANTE DE CARGO)/],
  ["seguranca", /(POLICIAL|MILITAR|BOMBEIRO|FORÇAS ARMADAS|VIGILANTE|DELEGADO|POLÍCIA)/],
  ["religioso", /(SACERDOTE|RELIGIOS|MISSION|MEMBRO DE ORDEM)/],
  ["saude", /(MÉDICO|ENFERMEIR|ODONTÓLOGO|PSICÓLOGO|FISIOTERAPEUTA|FARMACÊUTICO|NUTRICIONISTA|FONOAUDIÓLOGO|TERAPEUTA|SANITARISTA|VETERINÁRIO)/],
  ["educacao", /(PROFESSOR|PEDAGOGO|DIRETOR DE ESTABELECIMENTO DE ENSINO|BIBLIOTEC)/],
  ["juridico", /(ADVOGADO|JUIZ|PROMOTOR|DEFENSOR|PROCURADOR|MAGISTRAD|TABELIÃO|OFICIAL DE JUSTIÇA)/],
  ["comunicacao", /(JORNALISTA|LOCUTOR|RADIALISTA|PUBLICIT|RELAÇÕES PÚBLICAS|FOTÓGRAFO|CINEAST)/],
  ["agro", /(AGRICULTOR|AGROPECU|PECUARISTA|TRABALHADOR RURAL|PESCADOR|AGRÔNOMO|EXTRATIV)/],
  ["artista", /(MÚSICO|CANTOR|ATOR |ARTIST|ESCRITOR|BAILARIN|APRESENTADOR)/],
  ["empresario", /(EMPRESÁRIO|COMERCIANTE|GERENTE|DIRIGENTE DE EMPRESA|DIRETOR DE EMPRESAS|PROPRIETÁRIO|CORRETOR|BANCÁRIO|EMPRESARI)/],
  ["servidor", /(SERVIDOR PÚBLICO|AGENTE ADMINISTRATIVO|FISCAL|AUDITOR)/],
  ["sindical", /(SINDICAL|SINDICATO)/],
  ["trabalhador", /(TRABALHADOR|MOTORISTA|MOTOBOY|COMERCIÁRIO|ELETRICISTA|MECÂNICO|CONSTRUÇÃO|OPERADOR|VENDEDOR|CABELEIREIRO|COSTUREIR|COZINHEIR|PEDREIRO|SERVENTE|MARCENEIR|SOLDADOR|PORTEIRO|GARÇOM|FEIRANTE|ARTESÃO|BORRACHEIRO|PINTOR|CARPINTEIR)/],
];

function ler(caminho, dica) {
  if (!existsSync(caminho)) throw new Error(`${caminho} não existe. Rode ${dica} primeiro.`);
  return JSON.parse(readFileSync(caminho, "utf8"));
}

function posicional(dados, chaveColunas) {
  return Object.fromEntries(dados[chaveColunas].map((nome, indice) => [nome, indice]));
}

function badge(ocupacao) {
  for (const [nome, regra] of REGRAS_BADGE) if (regra.test(ocupacao)) return nome;
  return null;
}

async function comRepeticao(endereco) {
  for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
    try {
      const resposta = await fetch(endereco, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      if (resposta.ok) return resposta.json();
      if (resposta.status === 404) return null;
      throw new Error(`respondeu ${resposta.status}`);
    } catch (erro) {
      if (tentativa === 5) throw new Error(`${endereco} falhou: ${erro.message}`);
      await new Promise((resolver) => setTimeout(resolver, 500 * tentativa));
    }
  }
  return null;
}

async function emParalelo(itens, quantas, tarefa) {
  const saida = new Array(itens.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: quantas }, async () => {
      while (proximo < itens.length) {
        const indice = proximo;
        proximo += 1;
        saida[indice] = await tarefa(itens[indice]);
      }
    }),
  );
  return saida;
}

async function cpfDosDeputados(ids) {
  const arquivo = join(CACHE, "deputados-cpf.json");
  const cache = existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, "utf8")) : {};
  const faltando = ids.filter((id) => cache[id] === undefined);
  if (faltando.length > 0) {
    console.log(`buscando CPF de ${faltando.length} deputados na API da Câmara`);
    const respostas = await emParalelo(faltando, SIMULTANEAS, (id) => comRepeticao(`${API}/deputados/${id}`));
    faltando.forEach((id, indice) => {
      const corpo = respostas[indice];
      if (corpo === null) throw new Error(`deputado ${id} não existe na API`);
      const cpf = corpo.dados.cpf;
      cache[id] = cpf === null || cpf === undefined ? null : String(cpf).replace(/\D/g, "").padStart(11, "0");
    });
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(arquivo, `${JSON.stringify(cache)}\n`);
  }
  return cache;
}

const candidatos = ler(join(ROOT, "data", "candidatos-2026.json"), "node scripts/fetch-candidatos-2026.mjs");
const votacoes = ler(join(ROOT, "data", "votacoes-camara.json"), "node scripts/fetch-votacoes-camara.mjs");
const curadoria = ler(join(ROOT, "data", "curadoria.json"), "nada");
const cpfParaSq = ler(join(ROOT, ".cache", "tse", "cpf-sq.json"), "node scripts/fetch-candidatos-2026.mjs");

const ic = posicional(candidatos, "colunas");
const iv = posicional(votacoes, "colunas");
const id = posicional(votacoes, "colunasDeputado");

const porId = new Map(votacoes.votacoes.map((votacao) => [votacao[iv.id], votacao]));
const curadas = [];
for (const eixo of curadoria.eixos) {
  for (const referencia of eixo.votacoes) {
    const votacao = porId.get(referencia.id);
    if (votacao === undefined) throw new Error(`votação curada ${referencia.id} não existe no dataset`);
    curadas.push({ eixo: eixo.id, ...referencia, votacao });
  }
}
for (const referencia of curadoria.contexto) {
  const votacao = porId.get(referencia.id);
  if (votacao === undefined) throw new Error(`votação de contexto ${referencia.id} não existe no dataset`);
  curadas.push({ eixo: null, ...referencia, votacao });
}

const idsDeputado = votacoes.deputados.map((deputado) => deputado[id.id]);
const cpfs = await cpfDosDeputados(idsDeputado);

const sqParaDeputado = new Map();
const semCpf = [];
votacoes.deputados.forEach((deputado, indice) => {
  const cpf = cpfs[deputado[id.id]];
  if (cpf === null) {
    semCpf.push(deputado[id.nome]);
    return;
  }
  for (const sq of cpfParaSq[cpf] ?? []) {
    const anterior = sqParaDeputado.get(sq);
    if (anterior === undefined || votacoes.deputados[anterior][id.participacoes] < deputado[id.participacoes]) {
      sqParaDeputado.set(sq, indice);
    }
  }
});
if (semCpf.length > 0) throw new Error(`sem CPF na API: ${semCpf.join(", ")}`);

const fichas = new Map();
let comFoto = 0;
for (const [sq, indice] of sqParaDeputado) {
  const deputado = votacoes.deputados[indice];
  const votos = {};
  for (const curada of curadas) votos[curada.id] = Number(curada.votacao[iv.votos][indice]);
  const camaraId = deputado[id.id];
  const temFoto = existsSync(join(ROOT, "fotos", `${camaraId}.jpg`));
  if (temFoto) comFoto += 1;
  fichas.set(sq, {
    camaraId,
    nomeCamara: deputado[id.nome],
    temFoto,
    participacoes: deputado[id.participacoes],
    bancadaAferivel: deputado[id.votosEmBancadaAferivel],
    comMaioria: deputado[id.votosComMaioriaDoPartido],
    votos,
  });
}

const porUf = new Map();
for (const candidato of candidatos.candidatos) {
  const [sigla] = candidatos.dicionarios.unidadeEleitoral[candidato[ic.ue]];
  const lista = porUf.get(sigla);
  if (lista === undefined) porUf.set(sigla, [candidato]);
  else lista.push(candidato);
}

const COLUNAS = ["sq", "numero", "nome", "nomeCompleto", "cargo", "partido", "coligacao", "badge", "ficha"];
const totalVotacoes = votacoes.votacoes.length;
const ufs = [];

mkdirSync(SAIDA, { recursive: true });

for (const [sigla, lista] of [...porUf].sort(([a], [b]) => (a < b ? -1 : 1))) {
  const nomeUf = candidatos.dicionarios.unidadeEleitoral.find(([atual]) => atual === sigla)[1];
  const coligacoesUsadas = new Map();
  const linhas = lista
    .map((candidato) => {
      const indiceColigacao = candidato[ic.coligacao];
      if (!coligacoesUsadas.has(indiceColigacao)) {
        coligacoesUsadas.set(indiceColigacao, coligacoesUsadas.size);
      }
      const ocupacao = candidatos.dicionarios.ocupacao[candidato[ic.ocupacao]];
      return [
        candidato[ic.sq],
        candidato[ic.numero],
        candidato[ic.nomeUrna],
        candidato[ic.nome],
        candidato[ic.cargo],
        candidato[ic.partido],
        coligacoesUsadas.get(indiceColigacao),
        badge(ocupacao),
        fichas.get(candidato[ic.sq]) ?? null,
      ];
    })
    .sort((a, b) => a[4] - b[4] || a[1] - b[1] || (a[2] < b[2] ? -1 : 1));

  const coligacoes = [...coligacoesUsadas.keys()].map((indice) => {
    const original = candidatos.dicionarios.coligacao[indice];
    return { nome: original.nome, tipo: original.tipo, composicao: original.composicao };
  });

  const comFicha = linhas.filter((linha) => linha[8] !== null).length;
  writeFileSync(
    join(SAIDA, `${sigla}.json`),
    `${JSON.stringify({ uf: sigla, nome: nomeUf, coligacoes, colunas: COLUNAS, candidatos: linhas })}\n`,
  );
  ufs.push({ sigla, nome: nomeUf, candidatos: linhas.length, comFicha });
}

const eixos = curadoria.eixos.map((eixo) => ({
  id: eixo.id,
  nome: eixo.nome,
  pergunta: eixo.pergunta,
  posicao: eixo.posicao,
  defendeOEleitor: eixo.defendeOEleitor,
  contraOEleitor: eixo.contraOEleitor,
  votacoes: eixo.votacoes.map((referencia) => {
    const votacao = porId.get(referencia.id);
    return {
      id: referencia.id,
      rotulo: referencia.rotulo,
      data: votacao[iv.dataHora].slice(0, 10),
      sim: votacao[iv.sim],
      nao: votacao[iv.nao],
      outros: votacao[iv.abstencao] + votacao[iv.obstrucao] + votacao[iv.artigo17],
      proposicao: Number(referencia.id.split("-")[0]),
    };
  }),
}));

const contexto = curadoria.contexto.map((referencia) => {
  const votacao = porId.get(referencia.id);
  return {
    id: referencia.id,
    rotulo: referencia.rotulo,
    nota: referencia.nota,
    data: votacao[iv.dataHora].slice(0, 10),
    sim: votacao[iv.sim],
    nao: votacao[iv.nao],
    outros: votacao[iv.abstencao] + votacao[iv.obstrucao] + votacao[iv.artigo17],
    proposicao: Number(referencia.id.split("-")[0]),
  };
});

const indice = {
  fonte: {
    candidaturas: candidatos.fonte.portal,
    votacoes: votacoes.fonte.portal,
    geradoEm: new Date().toISOString(),
  },
  eleicao: candidatos.eleicao,
  totalCandidatos: candidatos.candidatos.length,
  totalComFicha: ufs.reduce((soma, uf) => soma + uf.comFicha, 0),
  votacoesNoHistorico: totalVotacoes,
  cargos: Object.fromEntries(Object.entries(candidatos.dicionarios.cargo).map(([codigo, valor]) => [codigo, valor.nome])),
  partidos: candidatos.dicionarios.partido,
  federacoes: candidatos.dicionarios.federacao,
  badges: BADGES,
  eixos,
  contexto,
  ufs,
};
writeFileSync(join(SAIDA, "indice.json"), `${JSON.stringify(indice, null, 2)}\n`);

console.log(`\nCatálogo gerado em data/dex/`);
console.log(`Candidaturas: ${candidatos.candidatos.length} em ${ufs.length} unidades eleitorais`);
console.log(`Com ficha de votação: ${indice.totalComFicha} (${comFoto} com foto local)`);
console.log(`Eixos: ${eixos.map((eixo) => `${eixo.nome} (${eixo.votacoes.length} votações)`).join(", ")}`);
for (const uf of [...ufs].sort((a, b) => b.candidatos - a.candidatos).slice(0, 5)) {
  console.log(`  ${uf.sigla} ${String(uf.candidatos).padStart(5)} candidaturas, ${uf.comFicha} com ficha`);
}
