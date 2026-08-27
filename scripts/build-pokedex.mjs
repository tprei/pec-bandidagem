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
const pesquisas = carregarPesquisas(candidatos);

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
for (const [sq, indice] of sqParaDeputado) {
  const deputado = votacoes.deputados[indice];
  const votos = {};
  for (const curada of curadas) votos[curada.id] = Number(curada.votacao[iv.votos][indice]);
  const camaraId = deputado[id.id];
  fichas.set(sq, {
    camaraId,
    nomeCamara: deputado[id.nome],
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

const COLUNAS = ["sq", "numero", "nome", "nomeCompleto", "cargo", "partido", "coligacao", "badge", "foto", "ficha"];
const votacoesOrdenadas = [...votacoes.votacoes].sort((a, b) => (a[iv.dataHora] < b[iv.dataHora] ? -1 : a[iv.dataHora] > b[iv.dataHora] ? 1 : 0));
const totalVotacoes = votacoesOrdenadas.length;
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
      } else if (ficha !== null && existsSync(join(ROOT, "fotos", `${ficha.camaraId}.jpg`))) {
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
  pesquisa: indicePesquisa,
  ufs,
};
escreverAtomico(join(SAIDA, "indice.json"), indice);

const linhasVotacoes = votacoesOrdenadas.map((votacao) => [
  votacao[iv.id],
  votacao[iv.dataHora].slice(0, 10),
  votacao[iv.orgao],
  Number(votacao[iv.id].split("-")[0]),
  limparDescricao(votacao[iv.descricao]),
  votacao[iv.aprovada],
  votacao[iv.sim],
  votacao[iv.nao],
  votacao[iv.abstencao],
  votacao[iv.obstrucao],
]);

const primeiroAno = Number(votacoesOrdenadas[0][iv.dataHora].slice(0, 4));
const ultimoAno = Number(votacoesOrdenadas[totalVotacoes - 1][iv.dataHora].slice(0, 4));

const catalogoVotacoes = {
  sobre: "Catálogo completo de votações nominais da Câmara dos Deputados",
  periodo: { de: primeiroAno, ate: ultimoAno },
  colunas: ["id", "data", "orgao", "proposicao", "descricao", "aprovada", "sim", "nao", "abstencao", "obstrucao"],
  votacoes: linhasVotacoes,
};

const conteudoCatalogo = `${JSON.stringify(catalogoVotacoes)}\n`;
writeFileSync(join(SAIDA, "votacoes.json"), conteudoCatalogo);
const tamanhoCatalogo = Buffer.byteLength(conteudoCatalogo, "utf8");

const deputadosComFicha = new Map();
for (const [sq, indice] of sqParaDeputado) {
  if (indice < 0 || indice >= votacoes.deputados.length) {
    throw new Error(`Índice ${indice} fora dos limites de deputados (tamanho ${votacoes.deputados.length})`);
  }
  const dep = votacoes.deputados[indice];
  if (dep === undefined) throw new Error(`Deputado indefinido no índice ${indice}`);
  deputadosComFicha.set(dep[id.id], indice);
}

const PASTA_VOTOS = join(SAIDA, "votos");
mkdirSync(PASTA_VOTOS, { recursive: true });

const votosPorCamaraId = new Map();
for (const [camaraId, indice] of deputadosComFicha) {
  votosPorCamaraId.set(camaraId, new Array(totalVotacoes));
}

for (let i = 0; i < totalVotacoes; i++) {
  const votacao = votacoesOrdenadas[i];
  const stringVotos = votacao[iv.votos];
  if (stringVotos.length !== votacoes.deputados.length) {
    throw new Error(`Votação ${votacao[iv.id]} tem ${stringVotos.length} votos, esperado ${votacoes.deputados.length}`);
  }
  for (const [camaraId, indice] of deputadosComFicha) {
    const votoChar = stringVotos[indice];
    if (votoChar === undefined) {
      throw new Error(`Voto indefinido para deputado ${camaraId} (índice ${indice}) na votação ${votacao[iv.id]}`);
    }
    votosPorCamaraId.get(camaraId)[i] = votoChar;
  }
}

let bytesTotaisVotos = 0;
for (const [camaraId, arrayVotos] of votosPorCamaraId) {
  const stringVotos = arrayVotos.join("");
  if (stringVotos.length !== totalVotacoes) {
    throw new Error(`Tamanho de votos para deputado ${camaraId} (${stringVotos.length}) difere do total de votações (${totalVotacoes})`);
  }
  const conteudoVotos = `${JSON.stringify({ camaraId, votos: stringVotos })}\n`;
  bytesTotaisVotos += Buffer.byteLength(conteudoVotos, "utf8");
  writeFileSync(join(PASTA_VOTOS, `${camaraId}.json`), conteudoVotos);
}
const totalArquivosVoto = votosPorCamaraId.size;
const tamanhoMedioVoto = totalArquivosVoto > 0 ? Math.round(bytesTotaisVotos / totalArquivosVoto) : 0;

console.log(`\nCatálogo gerado em data/dex/`);
console.log(`Candidaturas: ${candidatos.candidatos.length} em ${ufs.length} unidades eleitorais`);
console.log(`Com ficha de votação: ${indice.totalComFicha}`);
console.log(`Com foto: ${totalFotoTse} do TSE, ${totalFotoCamara} da Câmara`);
console.log(`Votações no catálogo: ${totalVotacoes} (${formatarBytes(tamanhoCatalogo)})`);
console.log(`Históricos de voto: ${totalArquivosVoto} arquivos em data/dex/votos/ (média ${formatarBytes(tamanhoMedioVoto)}/deputado)`);
console.log(`Eixos: ${eixos.map((eixo) => `${eixo.nome} (${eixo.votacoes.length} votações)`).join(", ")}`);
for (const uf of [...ufs].sort((a, b) => b.candidatos - a.candidatos).slice(0, 5)) {
  console.log(`  ${uf.sigla} ${String(uf.candidatos).padStart(5)} candidaturas, ${uf.comFicha} com ficha`);
}
