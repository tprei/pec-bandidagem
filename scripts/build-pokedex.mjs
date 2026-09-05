import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://dadosabertos.camara.leg.br/api/v2";
const CACHE = join(ROOT, ".cache", "camara");
const SAIDA = join(ROOT, "data", "dex");
const SIMULTANEAS = 8;

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

function escreverAtomico(caminho, dados) {
  const temporario = `${caminho}.${process.pid}.tmp`;
  writeFileSync(temporario, `${JSON.stringify(dados, null, 2)}\n`);
  renameSync(temporario, caminho);
}

function posicional(dados, chaveColunas) {
  return Object.fromEntries(dados[chaveColunas].map((nome, indice) => [nome, indice]));
}

function normalizarTexto(texto) {
  return (texto || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function badge(ocupacao) {
  for (const [nome, regra] of REGRAS_BADGE) if (regra.test(ocupacao)) return nome;
  return null;
}

function limparDescricao(texto) {
  if (!texto || typeof texto !== "string") return texto;
  const limpo = texto
    .replace(/\s*(?:(?:resultado(?:\s+final)?\s*[:\.]\s*|\.?\s*votaram\s+)?(?:sim|n[aã]o|abstenç[oõ]es?|total)\s*[:,\d-]|Resultado\s*[:\.]\s*\d+\s+votos?\b)[^]*$/i, "")
    .trim();
  return limpo.length > 0 ? limpo : texto;
}

function formatarBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const TIPOS_PESQUISA_SENSIVEIS = new Set(["licitacao_contrato", "corrupcao_improbidade", "processo_investigacao", "conflito_interesses_familia", "conduta_pessoal"]);

function carregarPesquisas(candidatos) {
  const origem = join(ROOT, "data", "pesquisa-candidatos-2026");
  if (!existsSync(origem)) return { registros: new Map(), aguardandoRevisao: 0 };
  const decisoes = existsSync(join(origem, "revisoes.json")) ? ler(join(origem, "revisoes.json"), "scripts/research-candidatos-2026.mjs").decisoes ?? {} : {};
  const conhecidos = new Set(candidatos.candidatos.map((candidato) => candidato[0]));
  const registros = new Map();
  let aguardandoRevisao = 0;
  for (const nome of readdirSync(origem).filter((arquivo) => arquivo.endsWith(".json") && arquivo !== "revisoes.json")) {
    const dados = ler(join(origem, nome), "scripts/research-candidatos-2026.mjs");
    for (const registro of dados.candidatos ?? []) {
      if (!conhecidos.has(registro.sq) || registros.has(registro.sq)) throw new Error(`pesquisa duplicada ou desconhecida: ${registro.sq}`);
      const publicar = (item) => {
        if (!item.id || !item.titulo || !item.fato || !item.trecho || !item.leituraEditorial || !item.papel?.descricao || !item.resultado?.descricao || !Array.isArray(item.fontes) || item.fontes.length === 0) throw new Error(`pesquisa inválida para ${registro.sq}`);
        if (item.fontes.some((fonte) => !/^https?:\/\//.test(fonte.url) || !fonte.titulo || !fonte.dominio || !Object.hasOwn(fonte, "publicadoEm"))) throw new Error(`fonte inválida para ${registro.sq}`);
        const sensivel = TIPOS_PESQUISA_SENSIVEIS.has(item.tipo) || item.conflito !== "confirmado";
        const decisao = decisoes[item.id];
        if (sensivel && decisao?.estado !== "aprovada") { aguardandoRevisao += 1; return false; }
        return decisao?.estado !== "rejeitada";
      };
      registros.set(registro.sq, { ...registro, favoraveis: (registro.favoraveis ?? []).filter(publicar), desfavoraveis: (registro.desfavoraveis ?? []).filter(publicar) });
    }
  }
  return { registros, aguardandoRevisao };
}

async function comRepeticao(endereco) {
  for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
    try {
      const resposta = await fetch(endereco, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60_000) });
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
const votacoesCamara = ler(join(ROOT, "data", "votacoes-camara.json"), "node scripts/fetch-votacoes-camara.mjs");
const votacoesSenado = ler(join(ROOT, "data", "votacoes-senado.json"), "node scripts/fetch-votacoes-senado.mjs");
const curadoria = ler(join(ROOT, "data", "curadoria.json"), "nada");
const cpfParaSq = ler(join(ROOT, ".cache", "tse", "cpf-sq.json"), "node scripts/fetch-candidatos-2026.mjs");

const ic = posicional(candidatos, "colunas");
const ivc = posicional(votacoesCamara, "colunas");
const idc = posicional(votacoesCamara, "colunasDeputado");
const ivs = posicional(votacoesSenado, "colunas");
const ids = posicional(votacoesSenado, "colunasSenador");

const porIdCamara = new Map(votacoesCamara.votacoes.map((v) => [v[ivc.id], v]));
const porIdSenado = new Map(votacoesSenado.votacoes.map((v) => [v[ivs.id], v]));

const curadas = [];
for (const eixo of curadoria.eixos) {
  for (const referencia of eixo.votacoes) {
    const ehSenado = referencia.id.startsWith("SF-");
    const votacao = ehSenado ? porIdSenado.get(referencia.id) : porIdCamara.get(referencia.id);
    if (votacao === undefined) throw new Error(`votação curada ${referencia.id} não existe no dataset`);
    curadas.push({ eixo: eixo.id, ...referencia, votacao, casa: ehSenado ? "senado" : "camara" });
  }
}
for (const referencia of curadoria.contexto) {
  const ehSenado = referencia.id.startsWith("SF-");
  const votacao = ehSenado ? porIdSenado.get(referencia.id) : porIdCamara.get(referencia.id);
  if (votacao === undefined) throw new Error(`votação de contexto ${referencia.id} não existe no dataset`);
  curadas.push({ eixo: null, ...referencia, votacao, casa: ehSenado ? "senado" : "camara" });
}
const pesquisas = carregarPesquisas(candidatos);

const idsDeputado = votacoesCamara.deputados.map((deputado) => deputado[idc.id]);
const cpfs = await cpfDosDeputados(idsDeputado);

const sqParaDeputado = new Map();
const semCpf = [];
votacoesCamara.deputados.forEach((deputado, indice) => {
  const cpf = cpfs[deputado[idc.id]];
  if (cpf === null) {
    semCpf.push(deputado[idc.nome]);
    return;
  }
  for (const sq of cpfParaSq[cpf] ?? []) {
    const anterior = sqParaDeputado.get(sq);
    if (anterior === undefined || votacoesCamara.deputados[anterior][idc.participacoes] < deputado[idc.participacoes]) {
      sqParaDeputado.set(sq, indice);
    }
  }
});
if (semCpf.length > 0) throw new Error(`sem CPF na API: ${semCpf.join(", ")}`);

const porNomeNasc = new Map();
const porNome = new Map();
for (const c of candidatos.candidatos) {
  const n = normalizarTexto(c[ic.nome]);
  const d = c[ic.nascimento];
  if (d) porNomeNasc.set(`${n}|${d}`, c);
  if (!porNome.has(n)) porNome.set(n, []);
  porNome.get(n).push(c);
}

const sqParaSenador = new Map();
votacoesSenado.senadores.forEach((senador, indice) => {
  const nomeCompleto = normalizarTexto(senador[ids.nomeCompleto]);
  const dataNasc = senador[ids.dataNascimento];
  let candMatch = null;
  if (dataNasc && porNomeNasc.has(`${nomeCompleto}|${dataNasc}`)) {
    candMatch = porNomeNasc.get(`${nomeCompleto}|${dataNasc}`);
  } else if (porNome.has(nomeCompleto) && porNome.get(nomeCompleto).length === 1) {
    candMatch = porNome.get(nomeCompleto)[0];
  }
  if (candMatch) {
    const sq = candMatch[ic.sq];
    const anterior = sqParaSenador.get(sq);
    if (anterior === undefined || votacoesSenado.senadores[anterior][ids.participacoes] < senador[ids.participacoes]) {
      sqParaSenador.set(sq, indice);
    }
  }
});

const todosSqs = new Set([...sqParaDeputado.keys(), ...sqParaSenador.keys()]);
const fichas = new Map();

for (const sq of todosSqs) {
  const indiceDeputado = sqParaDeputado.get(sq);
  const indiceSenador = sqParaSenador.get(sq);
  const deputado = indiceDeputado !== undefined ? votacoesCamara.deputados[indiceDeputado] : null;
  const senador = indiceSenador !== undefined ? votacoesSenado.senadores[indiceSenador] : null;

  const votos = {};
  for (const curada of curadas) {
    if (curada.casa === "senado") {
      votos[curada.id] = indiceSenador !== undefined ? Number(curada.votacao[ivs.votos][indiceSenador]) : 0;
    } else {
      votos[curada.id] = indiceDeputado !== undefined ? Number(curada.votacao[ivc.votos][indiceDeputado]) : 0;
    }
  }

  if (deputado && senador) {
    fichas.set(sq, {
      casa: "ambas",
      camaraId: deputado[idc.id],
      senadoId: senador[ids.id],
      nomeCamara: deputado[idc.nome],
      nomeSenado: senador[ids.nome],
      nomeParlamentar: deputado[idc.nome],
      participacoes: deputado[idc.participacoes] + senador[ids.participacoes],
      participacoesCamara: deputado[idc.participacoes],
      participacoesSenado: senador[ids.participacoes],
      bancadaAferivel: deputado[idc.votosEmBancadaAferivel] + senador[ids.votosEmBancadaAferivel],
      comMaioria: deputado[idc.votosComMaioriaDoPartido] + senador[ids.votosComMaioriaDoPartido],
      votos,
    });
  } else if (senador) {
    fichas.set(sq, {
      casa: "senado",
      senadoId: senador[ids.id],
      nomeSenado: senador[ids.nome],
      nomeCamara: senador[ids.nome],
      nomeParlamentar: senador[ids.nome],
      participacoes: senador[ids.participacoes],
      participacoesSenado: senador[ids.participacoes],
      bancadaAferivel: senador[ids.votosEmBancadaAferivel],
      comMaioria: senador[ids.votosComMaioriaDoPartido],
      votos,
    });
  } else if (deputado) {
    fichas.set(sq, {
      casa: "camara",
      camaraId: deputado[idc.id],
      nomeCamara: deputado[idc.nome],
      nomeParlamentar: deputado[idc.nome],
      participacoes: deputado[idc.participacoes],
      participacoesCamara: deputado[idc.participacoes],
      bancadaAferivel: deputado[idc.votosEmBancadaAferivel],
      comMaioria: deputado[idc.votosComMaioriaDoPartido],
      votos,
    });
  }
}

const porUf = new Map();
for (const candidato of candidatos.candidatos) {
  const [sigla] = candidatos.dicionarios.unidadeEleitoral[candidato[ic.ue]];
  const lista = porUf.get(sigla);
  if (lista === undefined) porUf.set(sigla, [candidato]);
  else lista.push(candidato);
}

const COLUNAS = ["sq", "numero", "nome", "nomeCompleto", "cargo", "partido", "coligacao", "badge", "foto", "ficha"];
const votacoesCamaraOrdenadas = [...votacoesCamara.votacoes].sort((a, b) => (a[ivc.dataHora] < b[ivc.dataHora] ? -1 : a[ivc.dataHora] > b[ivc.dataHora] ? 1 : 0));
const totalVotacoesCamara = votacoesCamaraOrdenadas.length;

const votacoesSenadoOrdenadas = [...votacoesSenado.votacoes].sort((a, b) => (a[ivs.dataHora] < b[ivs.dataHora] ? -1 : a[ivs.dataHora] > b[ivs.dataHora] ? 1 : 0));
const totalVotacoesSenado = votacoesSenadoOrdenadas.length;

const totalVotacoesGeral = totalVotacoesCamara + totalVotacoesSenado;
const ufs = [];
let totalFotoTse = 0;
let totalFotoCamara = 0;

mkdirSync(SAIDA, { recursive: true });

for (const [sigla, lista] of [...porUf].sort(([a], [b]) => (a < b ? -1 : 1))) {
  const nomeUf = candidatos.dicionarios.unidadeEleitoral.find(([atual]) => atual === sigla)[1];
  const coligacoesUsadas = new Map();
  const linhas = lista
    .map((candidato) => {
      const sq = candidato[ic.sq];
      const indiceColigacao = candidato[ic.coligacao];
      if (!coligacoesUsadas.has(indiceColigacao)) {
        coligacoesUsadas.set(indiceColigacao, coligacoesUsadas.size);
      }
      const ocupacao = candidatos.dicionarios.ocupacao[candidato[ic.ocupacao]];
      const ficha = fichas.get(sq) ?? null;
      let foto = null;
      if (existsSync(join(ROOT, "fotos-tse", `${sq}.jpg`))) {
        foto = "t";
        totalFotoTse += 1;
      } else if (ficha !== null && ficha.camaraId && existsSync(join(ROOT, "fotos", `${ficha.camaraId}.jpg`))) {
        foto = "c";
        totalFotoCamara += 1;
      }
      return [
        sq,
        candidato[ic.numero],
        candidato[ic.nomeUrna],
        candidato[ic.nome],
        candidato[ic.cargo],
        candidato[ic.partido],
        coligacoesUsadas.get(indiceColigacao),
        badge(ocupacao),
        foto,
        ficha,
      ];
    })
    .sort((a, b) => a[4] - b[4] || a[1] - b[1] || (a[2] < b[2] ? -1 : 1));

  const coligacoes = [...coligacoesUsadas.keys()].map((indice) => {
    const original = candidatos.dicionarios.coligacao[indice];
    return { nome: original.nome, tipo: original.tipo, composicao: original.composicao };
  });

  const comFicha = linhas.filter((linha) => linha[9] !== null).length;
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
    const ehSenado = referencia.id.startsWith("SF-");
    const votacao = ehSenado ? porIdSenado.get(referencia.id) : porIdCamara.get(referencia.id);
    const iv = ehSenado ? ivs : ivc;
    return {
      id: referencia.id,
      rotulo: referencia.rotulo,
      data: votacao[iv.dataHora].slice(0, 10),
      sim: votacao[iv.sim],
      nao: votacao[iv.nao],
      outros: votacao[iv.abstencao] + votacao[iv.obstrucao] + votacao[iv.artigo17],
      proposicao: ehSenado ? referencia.id : Number(referencia.id.split("-")[0]),
      idProcesso: ehSenado ? votacao[ivs.idProcesso] : null,
    };
  }),
}));

const contexto = curadoria.contexto.map((referencia) => {
  const ehSenado = referencia.id.startsWith("SF-");
  const votacao = ehSenado ? porIdSenado.get(referencia.id) : porIdCamara.get(referencia.id);
  const iv = ehSenado ? ivs : ivc;
  return {
    id: referencia.id,
    rotulo: referencia.rotulo,
    nota: referencia.nota,
    data: votacao[iv.dataHora].slice(0, 10),
    sim: votacao[iv.sim],
    nao: votacao[iv.nao],
    outros: votacao[iv.abstencao] + votacao[iv.obstrucao] + votacao[iv.artigo17],
    proposicao: ehSenado ? referencia.id : Number(referencia.id.split("-")[0]),
    idProcesso: ehSenado ? votacao[ivs.idProcesso] : null,
  };
});

const pesquisaSaida = join(SAIDA, "pesquisa");
mkdirSync(pesquisaSaida, { recursive: true });
for (let shard = 0; shard < 256; shard += 1) {
  const candidatosShard = [...pesquisas.registros.values()]
    .filter((registro) => registro.sq % 256 === shard)
    .map((registro) => {
      const { execucao, ...publico } = registro;
      return [String(registro.sq), publico];
    })
    .sort(([a], [b]) => Number(a) - Number(b));
  escreverAtomico(join(pesquisaSaida, `${shard.toString(16).padStart(2, "0")}.json`), { schema: 1, candidatos: Object.fromEntries(candidatosShard) });
}

const pesquisaPublicada = [...pesquisas.registros.values()].filter((registro) => registro.favoraveis.length > 0 || registro.desfavoraveis.length > 0).length;
const indicePesquisa = {
  schema: 1,
  rubrica: curadoria.pesquisa.id,
  lente: curadoria.pesquisa.lente,
  shards: 256,
  totalPesquisados: pesquisas.registros.size,
  totalComPublicacao: pesquisaPublicada,
  totalAguardandoRevisao: pesquisas.aguardandoRevisao,
  geradoEm: new Date().toISOString(),
};

const indice = {
  fonte: {
    candidaturas: candidatos.fonte.portal,
    votacoesCamara: votacoesCamara.fonte.portal,
    votacoesSenado: votacoesSenado.fonte.portal,
    geradoEm: new Date().toISOString(),
  },
  eleicao: candidatos.eleicao,
  totalCandidatos: candidatos.candidatos.length,
  totalComFicha: ufs.reduce((soma, uf) => soma + uf.comFicha, 0),
  votacoesNoHistorico: totalVotacoesGeral,
  votacoesNoHistoricoCamara: totalVotacoesCamara,
  votacoesNoHistoricoSenado: totalVotacoesSenado,
  cargos: Object.fromEntries(Object.entries(candidatos.dicionarios.cargo).map(([codigo, valor]) => [codigo, valor.nome])),
  partidos: candidatos.dicionarios.partido,
  federacoes: candidatos.dicionarios.federacao,
  badges: BADGES,
  eixos,
  contexto,
  pesquisa: indicePesquisa,
  ufs,
};
escreverAtomico(join(SAIDA, "indice.json"), indice);

const linhasVotacoesCamara = votacoesCamaraOrdenadas.map((votacao) => [
  votacao[ivc.id],
  votacao[ivc.dataHora].slice(0, 10),
  votacao[ivc.orgao],
  Number(votacao[ivc.id].split("-")[0]),
  limparDescricao(votacao[ivc.descricao]),
  votacao[ivc.aprovada],
  votacao[ivc.sim],
  votacao[ivc.nao],
  votacao[ivc.abstencao],
  votacao[ivc.obstrucao],
  null,
]);

const catalogoVotacoesCamara = {
  sobre: "Catálogo completo de votações nominais da Câmara dos Deputados",
  periodo: {
    de: Number(votacoesCamaraOrdenadas[0][ivc.dataHora].slice(0, 4)),
    ate: Number(votacoesCamaraOrdenadas[totalVotacoesCamara - 1][ivc.dataHora].slice(0, 4)),
  },
  colunas: ["id", "data", "orgao", "proposicao", "descricao", "aprovada", "sim", "nao", "abstencao", "obstrucao", "idProcesso"],
  votacoes: linhasVotacoesCamara,
};
writeFileSync(join(SAIDA, "votacoes.json"), `${JSON.stringify(catalogoVotacoesCamara)}\n`);

const linhasVotacoesSenado = votacoesSenadoOrdenadas.map((votacao) => [
  votacao[ivs.id],
  votacao[ivs.dataHora].slice(0, 10),
  votacao[ivs.orgao],
  votacao[ivs.proposicao] ?? votacao[ivs.id],
  limparDescricao(votacao[ivs.descricao]),
  votacao[ivs.aprovada],
  votacao[ivs.sim],
  votacao[ivs.nao],
  votacao[ivs.abstencao],
  votacao[ivs.obstrucao],
  votacao[ivs.idProcesso],
]);

const catalogoVotacoesSenado = {
  sobre: "Catálogo completo de votações nominais do Senado Federal",
  periodo: {
    de: Number(votacoesSenadoOrdenadas[0][ivs.dataHora].slice(0, 4)),
    ate: Number(votacoesSenadoOrdenadas[totalVotacoesSenado - 1][ivs.dataHora].slice(0, 4)),
  },
  colunas: ["id", "data", "orgao", "proposicao", "descricao", "aprovada", "sim", "nao", "abstencao", "obstrucao", "idProcesso"],
  votacoes: linhasVotacoesSenado,
};
writeFileSync(join(SAIDA, "votacoes-senado.json"), `${JSON.stringify(catalogoVotacoesSenado)}\n`);

const PASTA_VOTOS = join(SAIDA, "votos");
mkdirSync(PASTA_VOTOS, { recursive: true });

const deputadosComFicha = new Map();
for (const [sq, indice] of sqParaDeputado) {
  const dep = votacoesCamara.deputados[indice];
  if (dep !== undefined) deputadosComFicha.set(dep[idc.id], indice);
}

const votosPorCamaraId = new Map();
for (const [camaraId] of deputadosComFicha) {
  votosPorCamaraId.set(camaraId, new Array(totalVotacoesCamara));
}

for (let i = 0; i < totalVotacoesCamara; i += 1) {
  const votacao = votacoesCamaraOrdenadas[i];
  const stringVotos = votacao[ivc.votos];
  for (const [camaraId, indice] of deputadosComFicha) {
    votosPorCamaraId.get(camaraId)[i] = stringVotos[indice] ?? "0";
  }
}

for (const [camaraId, arrayVotos] of votosPorCamaraId) {
  const conteudoVotos = `${JSON.stringify({ camaraId, votos: arrayVotos.join("") })}\n`;
  writeFileSync(join(PASTA_VOTOS, `${camaraId}.json`), conteudoVotos);
}

const senadoresComFicha = new Map();
for (const [sq, indice] of sqParaSenador) {
  const sen = votacoesSenado.senadores[indice];
  if (sen !== undefined) senadoresComFicha.set(sen[ids.id], indice);
}

const votosPorSenadoId = new Map();
for (const [senadoId] of senadoresComFicha) {
  votosPorSenadoId.set(senadoId, new Array(totalVotacoesSenado));
}

for (let i = 0; i < totalVotacoesSenado; i += 1) {
  const votacao = votacoesSenadoOrdenadas[i];
  const stringVotos = votacao[ivs.votos];
  for (const [senadoId, indice] of senadoresComFicha) {
    votosPorSenadoId.get(senadoId)[i] = stringVotos[indice] ?? "0";
  }
}

for (const [senadoId, arrayVotos] of votosPorSenadoId) {
  const conteudoVotos = `${JSON.stringify({ senadoId, votos: arrayVotos.join("") })}\n`;
  writeFileSync(join(PASTA_VOTOS, `sf-${senadoId}.json`), conteudoVotos);
}

console.log(`\nCatálogo gerado em data/dex/`);
console.log(`Candidaturas: ${candidatos.candidatos.length} em ${ufs.length} unidades eleitorais`);
console.log(`Com ficha de votação: ${indice.totalComFicha} (${sqParaDeputado.size} da Câmara, ${sqParaSenador.size} do Senado)`);
console.log(`Votações no catálogo: ${totalVotacoesGeral} (${totalVotacoesCamara} Câmara, ${totalVotacoesSenado} Senado)`);
console.log(`Históricos de voto salvos: ${votosPorCamaraId.size} Câmara, ${votosPorSenadoId.size} Senado`);
