import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "senado");
const ANOS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const MINIMO_BANCADA = 3;
const CONCORRENCIA_DETALHES = 6;

const VOTO_ROTULO = {
  0: "sem registro nesta votação",
  1: "Sim",
  2: "Não",
  3: "Abstenção",
  4: "Obstrução / P-NRV",
  5: "Presidente (art. 51 RISF)",
  6: "registro em branco",
};

function normalizarVoto(sigla) {
  if (!sigla || typeof sigla !== "string") return 0;
  const s = sigla.trim().toLowerCase();
  if (s === "sim") return 1;
  if (s === "não" || s === "nao") return 2;
  if (s === "abstenção" || s === "abstencao") return 3;
  if (s.includes("obstru") || s === "p-nrv") return 4;
  if (s.includes("presidente") || s.includes("artigo 17") || s.includes("art. 51")) return 5;
  if (s === "em branco" || s === "branco") return 6;
  return 0;
}

async function curlJson(url, maxTentativas = 5) {
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa += 1) {
    try {
      const { stdout } = await execFileAsync(
        "curl",
        [
          "-s",
          "-4",
          "--retry", "3",
          "--max-time", "90",
          "-H", "Accept: application/json",
          "-H", "User-Agent: Mozilla/5.0",
          url,
        ],
        { maxBuffer: 100 * 1024 * 1024 },
      );
      if (!stdout || stdout.trim().length === 0) {
        throw new Error("resposta vazia do curl");
      }
      return JSON.parse(stdout);
    } catch (erro) {
      if (tentativa === maxTentativas) {
        throw new Error(`Falha definitiva ao buscar ${url}: ${erro.message}`);
      }
      await new Promise((resolver) => setTimeout(resolver, 1000 * tentativa));
    }
  }
  return null;
}

async function emParalelo(itens, limite, tarefa) {
  const saida = new Array(itens.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: limite }, async () => {
      while (proximo < itens.length) {
        const indice = proximo;
        proximo += 1;
        saida[indice] = await tarefa(itens[indice]);
      }
    }),
  );
  return saida;
}

function arredondar(valor, decimais) {
  const fator = 10 ** decimais;
  return Math.round(valor * fator) / fator;
}

mkdirSync(CACHE, { recursive: true });

console.log("1. Buscando votações nominais do Senado (2017–2026)...");
const todasVotacoesBrutas = [];
for (const ano of ANOS) {
  const arquivoCache = join(CACHE, `votacoes-${ano}.json`);
  let dadosAno = null;
  if (existsSync(arquivoCache)) {
    dadosAno = JSON.parse(readFileSync(arquivoCache, "utf8"));
  } else {
    process.stdout.write(`  Baixando ${ano}... `);
    const url = `https://legis.senado.leg.br/dadosabertos/votacao?dataInicio=${ano}-01-01&dataFim=${ano}-12-31`;
    dadosAno = await curlJson(url);
    if (!Array.isArray(dadosAno)) dadosAno = [];
    writeFileSync(arquivoCache, `${JSON.stringify(dadosAno)}\n`);
    console.log(`${dadosAno.length} votações.`);
  }
  todasVotacoesBrutas.push(...dadosAno);
}
console.log(`Total de votações brutas coletadas: ${todasVotacoesBrutas.length}`);

console.log("\n2. Identificando senadores das votações e legislaturas...");
const idsSenadorVotantes = new Set();
for (const v of todasVotacoesBrutas) {
  for (const voto of v.votos ?? []) {
    if (voto.codigoParlamentar !== undefined && voto.codigoParlamentar !== null) {
      idsSenadorVotantes.add(Number(voto.codigoParlamentar));
    }
  }
}
console.log(`Senadores votantes únicos nas votações: ${idsSenadorVotantes.size}`);

const cacheLegs = join(CACHE, "senadores-legislaturas.json");
let senadoresLegs = {};
if (existsSync(cacheLegs)) {
  senadoresLegs = JSON.parse(readFileSync(cacheLegs, "utf8"));
} else {
  for (const leg of [55, 56, 57]) {
    process.stdout.write(`  Baixando lista da legislatura ${leg}... `);
    const url = `https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/${leg}`;
    const data = await curlJson(url);
    const parls = data?.ListaParlamentarLegislatura?.Parlamentares?.Parlamentar ?? [];
    for (const p of parls) {
      const ident = p.IdentificacaoParlamentar;
      const cod = Number(ident.CodigoParlamentar);
      if (!senadoresLegs[cod]) {
        senadoresLegs[cod] = {
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
  writeFileSync(cacheLegs, `${JSON.stringify(senadoresLegs)}\n`);
}

const todosIdsSenador = new Set([...idsSenadorVotantes, ...Object.keys(senadoresLegs).map(Number)]);
console.log(`Total de senadores mapeados no período: ${todosIdsSenador.size}`);

console.log("\n3. Buscando dados detalhados dos senadores (data de nascimento, filiação)...");
const cacheDetalhes = join(CACHE, "senadores-detalhe.json");
let detalhesSenadores = existsSync(cacheDetalhes) ? JSON.parse(readFileSync(cacheDetalhes, "utf8")) : {};

const idsFaltando = [...todosIdsSenador].filter((id) => !detalhesSenadores[id]);
if (idsFaltando.length > 0) {
  console.log(`  Buscando detalhes de ${idsFaltando.length} senadores na API...`);
  const resultados = await emParalelo(idsFaltando, CONCORRENCIA_DETALHES, async (id) => {
    try {
      const url = `https://legis.senado.leg.br/dadosabertos/senador/${id}`;
      return await curlJson(url, 3);
    } catch {
      return null;
    }
  });
  idsFaltando.forEach((id, i) => {
    const raw = resultados[i];
    const parl = raw?.DetalheParlamentar?.Parlamentar;
    const ident = parl?.IdentificacaoParlamentar;
    const basicos = parl?.DadosBasicosParlamentar;
    detalhesSenadores[id] = {
      id,
      nome: ident?.NomeParlamentar ?? senadoresLegs[id]?.nome ?? `Senador ${id}`,
      nomeCompleto: ident?.NomeCompletoParlamentar ?? senadoresLegs[id]?.nomeCompleto ?? `Senador ${id}`,
      sexo: ident?.SexoParlamentar ?? null,
      uf: ident?.UfParlamentar ?? senadoresLegs[id]?.uf ?? null,
      partido: ident?.SiglaPartidoParlamentar ?? senadoresLegs[id]?.partido ?? null,
      dataNascimento: basicos?.DataNascimento ?? null,
      naturalidade: basicos?.Naturalidade ?? null,
      ufNaturalidade: basicos?.UfNaturalidade ?? null,
    };
  });
  writeFileSync(cacheDetalhes, `${JSON.stringify(detalhesSenadores)}\n`);
}
console.log(`Detalhes carregados para ${Object.keys(detalhesSenadores).length} senadores.`);

console.log("\n4. Indexando senadores e partidos...");
const listaSenadores = [...idsSenadorVotantes].sort((a, b) => a - b);
const totalSenadores = listaSenadores.length;
const posicaoSenador = new Map(listaSenadores.map((id, index) => [id, index]));

const nomesPartido = new Map();
function normalizarPartido(sigla) {
  if (!sigla || typeof sigla !== "string") return "S/PARTIDO";
  const s = sigla.trim().toUpperCase();
  return s.length === 0 ? "S/PARTIDO" : s;
}

for (const v of todasVotacoesBrutas) {
  for (const voto of v.votos ?? []) {
    const p = normalizarPartido(voto.siglaPartidoParlamentar);
    if (!nomesPartido.has(p)) nomesPartido.set(p, nomesPartido.size);
  }
}
const listaPartidos = [...nomesPartido.keys()];
console.log(`Partidos únicos identificados: ${listaPartidos.length}`);

console.log("\n5. Ordenando votações cronologicamente e eliminando duplicatas...");
const mapaVotacoes = new Map();
for (const v of todasVotacoesBrutas) {
  const idVotacao = `SF-${v.codigoSessaoVotacao}`;
  if (!mapaVotacoes.has(idVotacao)) {
    mapaVotacoes.set(idVotacao, v);
  }
}

const votacoesOrdenadas = [...mapaVotacoes.values()].sort((a, b) => {
  const dataA = a.dataSessao ?? "";
  const dataB = b.dataSessao ?? "";
  if (dataA !== dataB) return dataA < dataB ? -1 : 1;
  return (a.codigoSessaoVotacao ?? 0) - (b.codigoSessaoVotacao ?? 0);
});
console.log(`Total de votações únicas no histórico: ${votacoesOrdenadas.length}`);

console.log("\n6. Construindo matriz de votos e calculando métricas...");
const totalVotacoes = votacoesOrdenadas.length;
const matrizVotos = new Uint8Array(totalVotacoes * totalSenadores);
const matrizPartidos = new Uint8Array(totalVotacoes * totalSenadores);

let totalRegistrosVoto = 0;
votacoesOrdenadas.forEach((v, idxVotacao) => {
  const base = idxVotacao * totalSenadores;
  for (const voto of v.votos ?? []) {
    const cod = Number(voto.codigoParlamentar);
    const idxSenador = posicaoSenador.get(cod);
    if (idxSenador === undefined) continue;
    const codVoto = normalizarVoto(voto.siglaVotoParlamentar);
    const codPartido = nomesPartido.get(normalizarPartido(voto.siglaPartidoParlamentar)) ?? 0;
    matrizVotos[base + idxSenador] = codVoto;
    matrizPartidos[base + idxSenador] = codPartido + 1;
    if (codVoto !== 0) totalRegistrosVoto += 1;
  }
});

const participacoes = new Int32Array(totalSenadores);
const comMaioria = new Int32Array(totalSenadores);
const bancadaAferivel = new Int32Array(totalSenadores);
const filiacoes = Array.from({ length: totalSenadores }, () => []);

const colunasVotacao = [
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

const votacoesProcessadas = votacoesOrdenadas.map((v, ordem) => {
  const idVotacao = `SF-${v.codigoSessaoVotacao}`;
  const base = ordem * totalSenadores;
  const contagem = [0, 0, 0, 0, 0, 0, 0];
  const votosSimPorPartido = new Int32Array(listaPartidos.length);
  const votosNaoPorPartido = new Int32Array(listaPartidos.length);
  const membrosPartido = new Map();
  let participantes = 0;

  for (let s = 0; s < totalSenadores; s += 1) {
    const codVoto = matrizVotos[base + s];
    if (codVoto === 0) continue;
    participantes += 1;
    contagem[codVoto] += 1;
    participacoes[s] += 1;

    const partidoIdx = matrizPartidos[base + s] - 1;
    if (partidoIdx >= 0) {
      const fil = filiacoes[s];
      const ultima = fil.at(-1);
      if (ultima === undefined || ultima[0] !== partidoIdx) fil.push([partidoIdx, ordem]);
    }

    if (codVoto === 1) votosSimPorPartido[partidoIdx] += 1;
    else if (codVoto === 2) votosNaoPorPartido[partidoIdx] += 1;

    if (codVoto === 1 || codVoto === 2) {
      const lista = membrosPartido.get(partidoIdx);
      if (lista === undefined) membrosPartido.set(partidoIdx, [s]);
      else lista.push(s);
    }
  }

  const efetivos = contagem[1] + contagem[2];
  let somaRice = 0;
  let aferiveis = 0;
  let desercoes = 0;

  for (const [partidoIdx, lista] of membrosPartido) {
    const totalBancada = votosSimPorPartido[partidoIdx] + votosNaoPorPartido[partidoIdx];
    if (totalBancada < MINIMO_BANCADA) continue;
    somaRice += Math.abs(votosSimPorPartido[partidoIdx] - votosNaoPorPartido[partidoIdx]);
    aferiveis += totalBancada;

    if (votosSimPorPartido[partidoIdx] === votosNaoPorPartido[partidoIdx]) continue;
    const maioria = votosSimPorPartido[partidoIdx] > votosNaoPorPartido[partidoIdx] ? 1 : 2;

    for (const senadorIdx of lista) {
      bancadaAferivel[senadorIdx] += 1;
      if (matrizVotos[base + senadorIdx] === maioria) {
        comMaioria[senadorIdx] += 1;
      } else {
        desercoes += 1;
      }
    }
  }

  const aprovada =
    v.resultadoVotacao === "A"
      ? true
      : v.resultadoVotacao === "R"
      ? false
      : contagem[1] > contagem[2];

  const dataHora = v.dataSessao ? `${v.dataSessao}T14:00:00` : null;
  const proposicao = v.identificacao ?? null;
  const descricao = v.descricaoVotacao ?? "";

  return [
    idVotacao,
    dataHora,
    "PLEN",
    proposicao,
    aprovada,
    contagem[1],
    contagem[2],
    contagem[3],
    contagem[4],
    contagem[5],
    participantes,
    efetivos === 0 ? null : arredondar(Math.min(contagem[1], contagem[2]) / efetivos, 4),
    aferiveis === 0 ? null : arredondar(somaRice / aferiveis, 4),
    desercoes,
    descricao,
    matrizVotos.subarray(base, base + totalSenadores).join(""),
    v.idProcesso ?? null,
  ];
});

const colunasSenador = [
  "id",
  "nome",
  "nomeCompleto",
  "uf",
  "participacoes",
  "votosComMaioriaDoPartido",
  "votosEmBancadaAferivel",
  "dataNascimento",
];

const senadoresEstruturados = listaSenadores.map((id, index) => {
  const det = detalhesSenadores[id] ?? {};
  return [
    id,
    det.nome ?? `Senador ${id}`,
    det.nomeCompleto ?? `Senador ${id}`,
    det.uf ?? "",
    participacoes[index],
    comMaioria[index],
    bancadaAferivel[index],
    det.dataNascimento ?? null,
  ];
});

const dadosFinais = {
  fonte: {
    portal: "https://legis.senado.leg.br/dadosabertos",
    anos: ANOS,
    coletadoEm: new Date().toISOString(),
  },
  resumo: {
    votacoes: votacoesProcessadas.length,
    registrosDeVoto: totalRegistrosVoto,
    cadastrosDeSenador: totalSenadores,
    partidos: listaPartidos.length,
    cadastrosComMaisDeUmaSigla: filiacoes.filter((f) => f.length > 1).length,
  },
  alfabetoVotos: VOTO_ROTULO,
  minimoBancadaAferivel: MINIMO_BANCADA,
  partidos: listaPartidos,
  colunasSenador,
  senadores: senadoresEstruturados,
  filiacoes,
  colunas: colunasVotacao,
  votacoes: votacoesProcessadas,
};

const partes = [
  "{",
  ...Object.entries(dadosFinais)
    .filter(([chave]) => chave !== "votacoes")
    .map(([chave, valor]) => `  ${JSON.stringify(chave)}: ${JSON.stringify(valor, null, 2).replaceAll("\n", "\n  ")},`),
  '  "votacoes": [',
  votacoesProcessadas.map((votacao) => `    ${JSON.stringify(votacao)}`).join(",\n"),
  "  ]",
  "}",
];

const caminhoSaida = join(ROOT, "data", "votacoes-senado.json");
mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(caminhoSaida, `${partes.join("\n")}\n`);

console.log("\n=======================================================");
console.log(`Votações nominais do Senado ${ANOS.at(0)}–${ANOS.at(-1)}`);
console.log(`Votações: ${votacoesProcessadas.length}`);
console.log(`Registros nominais de voto: ${totalRegistrosVoto}`);
console.log(`Cadastros de senador: ${totalSenadores}`);
console.log(`Partidos: ${listaPartidos.length}`);
console.log(`Arquivo gerado: data/votacoes-senado.json`);
console.log("=======================================================\n");
