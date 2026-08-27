import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "camara");
const PORTAL = "https://dadosabertos.camara.leg.br/arquivos";
const ANOS = [2021, 2022, 2023, 2024, 2025, 2026];
const TENTATIVAS = 8;
const MINIMO_BANCADA = 5;

const VOTO_CODIGO = new Map([
  ["", 6],
  ["Sim", 1],
  ["Não", 2],
  ["Abstenção", 3],
  ["Obstrução", 4],
  ["Artigo 17", 5],
]);

const VOTO_ROTULO = {
  0: "sem registro nesta votação",
  1: "Sim",
  2: "Não",
  3: "Abstenção",
  4: "Obstrução",
  5: "Artigo 17 (Presidência)",
  6: "registro em branco",
};

function url(tipo, ano) {
  return `${PORTAL}/${tipo}/csv/${tipo}-${ano}.csv`;
}

function caminho(tipo, ano) {
  return join(CACHE, `${tipo}-${ano}.csv`);
}

async function esperar(ms) {
  await new Promise((resolver) => setTimeout(resolver, ms));
}

function lerManifesto() {
  const arquivo = join(CACHE, "manifesto.json");
  return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, "utf8")) : {};
}

function gravarManifesto(manifesto) {
  writeFileSync(join(CACHE, "manifesto.json"), `${JSON.stringify(manifesto, null, 2)}\n`);
}

async function medirRemoto(endereco) {
  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    try {
      const resposta = await fetch(endereco, { method: "HEAD", signal: AbortSignal.timeout(60_000) });
      if (!resposta.ok) throw new Error(`HEAD respondeu ${resposta.status} ${resposta.statusText}`);
      const tamanho = Number(resposta.headers.get("content-length"));
      if (!Number.isInteger(tamanho) || tamanho <= 0) throw new Error("content-length ausente ou inutilizável");
      const etag = resposta.headers.get("etag");
      if (etag === null) throw new Error("etag ausente");
      return { tamanho, etag };
    } catch (erro) {
      ultimoErro = erro;
      await esperar(2000 * tentativa);
    }
  }
  throw new Error(`não foi possível medir ${endereco}: ${ultimoErro.message}`);
}

function resumoArquivo(destino) {
  return createHash("sha256").update(readFileSync(destino)).digest("hex");
}

function anotar(manifesto, chave, remoto, destino) {
  manifesto[chave] = {
    tamanho: remoto.tamanho,
    etag: remoto.etag,
    bytes: statSync(destino).size,
    sha256: resumoArquivo(destino),
  };
  gravarManifesto(manifesto);
}

async function baixar(endereco, destino, manifesto) {
  const chave = destino.slice(CACHE.length + 1);
  const remoto = await medirRemoto(endereco);
  const registro = manifesto[chave];
  const local = existsSync(destino) ? statSync(destino).size : 0;
  const confiavel =
    local > 0 &&
    registro?.etag === remoto.etag &&
    registro.tamanho === remoto.tamanho &&
    registro.bytes === local &&
    registro.sha256 === resumoArquivo(destino);

  if (confiavel && local === remoto.tamanho) return false;
  if (local > 0 && !confiavel) rmSync(destino);

  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    const obtido = existsSync(destino) ? statSync(destino).size : 0;
    if (obtido === remoto.tamanho) {
      anotar(manifesto, chave, remoto, destino);
      return true;
    }
    if (obtido > remoto.tamanho) {
      throw new Error(`${chave} tem ${obtido} bytes, mais que os ${remoto.tamanho} da origem`);
    }
    try {
      const cabecalhos = obtido > 0 ? { range: `bytes=${obtido}-`, "if-range": remoto.etag } : {};
      const resposta = await fetch(endereco, { headers: cabecalhos, signal: AbortSignal.timeout(600_000) });
      if (resposta.body === null) throw new Error("resposta sem corpo");

      let anexar = obtido > 0;
      if (anexar && resposta.status === 200) anexar = false;
      else if (anexar) {
        if (resposta.status !== 206) throw new Error(`retomada recusada com ${resposta.status}`);
        const faixa = resposta.headers.get("content-range");
        const exigida = `bytes ${obtido}-${remoto.tamanho - 1}/${remoto.tamanho}`;
        if (faixa !== exigida) throw new Error(`content-range ${faixa} não corresponde a ${exigida}`);
      } else if (!resposta.ok) {
        throw new Error(`respondeu ${resposta.status} ${resposta.statusText}`);
      }

      await pipeline(Readable.fromWeb(resposta.body), createWriteStream(destino, { flags: anexar ? "a" : "w" }));
    } catch (erro) {
      ultimoErro = erro;
      if (existsSync(destino)) anotar(manifesto, chave, remoto, destino);
      await esperar(1000 * tentativa);
      continue;
    }
    anotar(manifesto, chave, remoto, destino);
  }

  const obtido = existsSync(destino) ? statSync(destino).size : 0;
  if (obtido !== remoto.tamanho) {
    throw new Error(`${chave} ficou em ${obtido} de ${remoto.tamanho} bytes após ${TENTATIVAS} tentativas: ${ultimoErro?.message}`);
  }
  anotar(manifesto, chave, remoto, destino);
  return true;
}

function percorrerCsv(arquivo, aoLer) {
  const bruto = readFileSync(arquivo, "utf8");
  const texto = bruto.charCodeAt(0) === 0xfeff ? bruto.slice(1) : bruto;
  let cabecalho = null;
  let indices = null;
  let linha = [];
  let campo = "";
  let citado = false;

  const fecharLinha = () => {
    linha.push(campo);
    campo = "";
    if (cabecalho === null) {
      cabecalho = linha;
      indices = Object.fromEntries(cabecalho.map((chave, posicao) => [chave, posicao]));
    } else {
      if (linha.length !== cabecalho.length) {
        throw new Error(`${arquivo}: linha com ${linha.length} colunas, esperado ${cabecalho.length}`);
      }
      aoLer(linha, indices);
    }
    linha = [];
  };

  for (let i = 0; i < texto.length; i += 1) {
    const caractere = texto[i];
    if (citado) {
      if (caractere !== '"') campo += caractere;
      else if (texto[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else citado = false;
      continue;
    }
    if (caractere === '"' && campo === "") citado = true;
    else if (caractere === ";") {
      linha.push(campo);
      campo = "";
    } else if (caractere === "\n") fecharLinha();
    else if (caractere !== "\r") campo += caractere;
  }
  if (citado) throw new Error(`${arquivo}: termina com aspas abertas`);
  if (campo !== "" || linha.length > 0) fecharLinha();
}

function inteiro(valor, contexto) {
  if (!/^-?\d+$/.test(valor)) throw new Error(`inteiro inválido em ${contexto}: ${JSON.stringify(valor)}`);
  return Number(valor);
}

function booleano(valor, contexto) {
  if (valor === "1") return true;
  if (valor === "0") return false;
  throw new Error(`booleano inválido em ${contexto}: ${JSON.stringify(valor)}`);
}

function arredondar(valor, casas) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

function reservar(mapa, chave) {
  let indice = mapa.get(chave);
  if (indice === undefined) {
    indice = mapa.size;
    mapa.set(chave, indice);
  }
  return indice;
}

function predominante(contagens) {
  let escolhido = null;
  let melhor = -1;
  for (const [valor, quantas] of contagens) {
    if (quantas > melhor) {
      escolhido = valor;
      melhor = quantas;
    }
  }
  return escolhido;
}

mkdirSync(CACHE, { recursive: true });

const manifesto = lerManifesto();
for (const ano of ANOS) {
  for (const tipo of ["votacoes", "votacoesVotos"]) {
    const baixou = await baixar(url(tipo, ano), caminho(tipo, ano), manifesto);
    const tamanho = statSync(caminho(tipo, ano)).size;
    console.log(`${baixou ? "baixado" : "em cache"} ${tipo}-${ano}.csv ${tamanho} bytes`);
  }
}

const metadados = new Map();
for (const ano of ANOS) {
  percorrerCsv(caminho("votacoes", ano), (linha, indices) => {
    const id = linha[indices.id];
    if (metadados.has(id)) throw new Error(`votação ${id} aparece em mais de um arquivo`);
    metadados.set(id, {
      dataHora: linha[indices.dataHoraRegistro],
      orgao: linha[indices.siglaOrgao],
      aprovacao: linha[indices.aprovacao],
      proposicao: linha[indices.ultimaApresentacaoProposicao_idProposicao],
      descricao: linha[indices.descricao],
    });
  });
}

const idsVotacao = new Map();
const idsDeputado = new Map();
const idsPartido = new Map();
const nomes = [];
const ufs = [];
const seqVotacao = [];
const seqDeputado = [];
const seqCodigo = [];
const seqPartido = [];

for (const ano of ANOS) {
  percorrerCsv(caminho("votacoesVotos", ano), (linha, indices) => {
    const codigo = VOTO_CODIGO.get(linha[indices.voto]);
    if (codigo === undefined) {
      throw new Error(`voto desconhecido em ${linha[indices.idVotacao]}: ${JSON.stringify(linha[indices.voto])}`);
    }
    const deputado = reservar(idsDeputado, linha[indices.deputado_id]);
    const grafias = nomes[deputado] ?? (nomes[deputado] = new Map());
    grafias.set(linha[indices.deputado_nome], (grafias.get(linha[indices.deputado_nome]) ?? 0) + 1);
    const siglas = ufs[deputado] ?? (ufs[deputado] = new Map());
    siglas.set(linha[indices.deputado_siglaUf], (siglas.get(linha[indices.deputado_siglaUf]) ?? 0) + 1);
    seqVotacao.push(reservar(idsVotacao, linha[indices.idVotacao]));
    seqDeputado.push(deputado);
    seqCodigo.push(codigo);
    seqPartido.push(reservar(idsPartido, linha[indices.deputado_siglaPartido]));
  });
}

for (const id of idsVotacao.keys()) {
  if (!metadados.has(id)) throw new Error(`votação ${id} tem votos mas não tem metadados`);
}
if (idsPartido.size > 255) throw new Error(`${idsPartido.size} partidos não cabem em um byte`);

const totalDeputados = idsDeputado.size;
const cronologica = [...idsVotacao.keys()].sort((a, b) => {
  const ma = metadados.get(a);
  const mb = metadados.get(b);
  if (ma.dataHora !== mb.dataHora) return ma.dataHora < mb.dataHora ? -1 : 1;
  return a < b ? -1 : 1;
});
const posicao = new Int32Array(idsVotacao.size);
cronologica.forEach((id, ordem) => {
  posicao[idsVotacao.get(id)] = ordem;
});

const matriz = new Uint8Array(cronologica.length * totalDeputados);
const bancada = new Uint8Array(cronologica.length * totalDeputados);
for (let i = 0; i < seqVotacao.length; i += 1) {
  const alvo = posicao[seqVotacao[i]] * totalDeputados + seqDeputado[i];
  if (matriz[alvo] !== 0) {
    throw new Error(`deputado ${seqDeputado[i]} tem dois votos na votação ${cronologica[posicao[seqVotacao[i]]]}`);
  }
  matriz[alvo] = seqCodigo[i];
  bancada[alvo] = seqPartido[i] + 1;
}

const participacoes = new Int32Array(totalDeputados);
const comMaioria = new Int32Array(totalDeputados);
const fieisPossiveis = new Int32Array(totalDeputados);
const filiacoes = Array.from({ length: totalDeputados }, () => []);

const colunas = [
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

const votacoes = cronologica.map((id, ordem) => {
  const meta = metadados.get(id);
  const base = ordem * totalDeputados;
  const contagem = [0, 0, 0, 0, 0, 0, 0];
  const sim = new Int32Array(idsPartido.size);
  const nao = new Int32Array(idsPartido.size);
  const membros = new Map();
  let participantes = 0;

  for (let deputado = 0; deputado < totalDeputados; deputado += 1) {
    const codigo = matriz[base + deputado];
    if (codigo === 0) continue;
    participantes += 1;
    contagem[codigo] += 1;
    const partido = bancada[base + deputado] - 1;
    const filiacao = filiacoes[deputado];
    const ultima = filiacao.at(-1);
    if (ultima === undefined || ultima[0] !== partido) filiacao.push([partido, ordem]);
    participacoes[deputado] += 1;
    if (codigo !== 1 && codigo !== 2) continue;
    if (codigo === 1) sim[partido] += 1;
    else nao[partido] += 1;
    const lista = membros.get(partido);
    if (lista === undefined) membros.set(partido, [deputado]);
    else lista.push(deputado);
  }

  const efetivos = contagem[1] + contagem[2];
  let somaRice = 0;
  let aferiveis = 0;
  let desercoes = 0;
  for (const [partido, lista] of membros) {
    const total = sim[partido] + nao[partido];
    if (total < MINIMO_BANCADA) continue;
    somaRice += Math.abs(sim[partido] - nao[partido]);
    aferiveis += total;
    if (sim[partido] === nao[partido]) continue;
    const maioria = sim[partido] > nao[partido] ? 1 : 2;
    for (const deputado of lista) {
      fieisPossiveis[deputado] += 1;
      if (matriz[base + deputado] === maioria) comMaioria[deputado] += 1;
      else desercoes += 1;
    }
  }

  return [
    id,
    meta.dataHora,
    meta.orgao,
    meta.proposicao === "0" ? null : inteiro(meta.proposicao, `proposição de ${id}`),
    meta.aprovacao === "" ? null : booleano(meta.aprovacao, `aprovação de ${id}`),
    contagem[1],
    contagem[2],
    contagem[3],
    contagem[4],
    contagem[5],
    participantes,
    efetivos === 0 ? null : arredondar(Math.min(contagem[1], contagem[2]) / efetivos, 4),
    aferiveis === 0 ? null : arredondar(somaRice / aferiveis, 4),
    desercoes,
    meta.descricao,
    matriz.subarray(base, base + totalDeputados).join(""),
  ];
});

const somaParticipantes = votacoes.reduce((total, votacao) => total + votacao[10], 0);
if (somaParticipantes !== seqVotacao.length) {
  throw new Error(`participantes somam ${somaParticipantes}, mas há ${seqVotacao.length} registros de voto`);
}

const dados = {
  fonte: {
    portal: PORTAL,
    arquivos: ANOS.flatMap((ano) => [url("votacoes", ano), url("votacoesVotos", ano)]),
    anos: ANOS,
    coletadoEm: new Date().toISOString(),
  },
  resumo: {
    votacoes: votacoes.length,
    registrosDeVoto: seqVotacao.length,
    cadastrosDeDeputado: totalDeputados,
    partidos: idsPartido.size,
    cadastrosComMaisDeUmaSigla: filiacoes.filter((filiacao) => filiacao.length > 1).length,
  },
  alfabetoVotos: VOTO_ROTULO,
  minimoBancadaAferivel: MINIMO_BANCADA,
  partidos: [...idsPartido.keys()],
  colunasDeputado: ["id", "nome", "uf", "participacoes", "votosComMaioriaDoPartido", "votosEmBancadaAferivel"],
  deputados: [...idsDeputado.keys()].map((id, indice) => [
    inteiro(id, `id de deputado ${id}`),
    predominante(nomes[indice]),
    predominante(ufs[indice]),
    participacoes[indice],
    comMaioria[indice],
    fieisPossiveis[indice],
  ]),
  filiacoes,
  colunas,
  votacoes,
};

const partes = [
  "{",
  ...Object.entries(dados)
    .filter(([chave]) => chave !== "votacoes")
    .map(([chave, valor]) => `  ${JSON.stringify(chave)}: ${JSON.stringify(valor, null, 2).replaceAll("\n", "\n  ")},`),
  '  "votacoes": [',
  votacoes.map((votacao) => `    ${JSON.stringify(votacao)}`).join(",\n"),
  "  ]",
  "}",
];

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(join(ROOT, "data", "votacoes-camara.json"), `${partes.join("\n")}\n`);

const comPoder = votacoes.filter((votacao) => votacao[11] !== null && votacao[11] >= 0.05);
const linhaPura = comPoder.filter((votacao) => votacao[12] > 0.95);
console.log(`\nVotações nominais da Câmara ${ANOS.at(0)}-${ANOS.at(-1)}`);
console.log(`Votações: ${votacoes.length}`);
console.log(`Registros de voto: ${seqVotacao.length}`);
console.log(`Cadastros de deputado: ${totalDeputados} (${dados.resumo.cadastrosComMaisDeUmaSigla} com mais de uma sigla)`);
console.log(`Com poder discriminante (minoria >= 5%): ${comPoder.length}`);
console.log(`  dessas, linha partidária quase pura (Rice > 0,95): ${linhaPura.length}`);
console.log(`Deserções somadas: ${votacoes.reduce((total, votacao) => total + votacao[13], 0)}`);
