import { inflateRawSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL = "https://dadosabertos.tse.jus.br/dataset/candidatos-2026";
const ZIP = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip";
const MEMBRO = "consulta_cand_2026_BRASIL.csv";

const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  accept: "*/*",
  "accept-language": "pt-BR,pt;q=0.9",
  referer: PORTAL,
};

const NULO = new Set(["#NULO", "#NULO#", "#NE", "#NE#", ""]);

async function baixarZip(url) {
  const resposta = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(120_000) });
  if (!resposta.ok) {
    throw new Error(`${url} respondeu ${resposta.status} ${resposta.statusText}`);
  }
  const zip = Buffer.from(await resposta.arrayBuffer());
  if (zip.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(`${url} respondeu ${zip.length} bytes que não começam com um cabeçalho ZIP`);
  }
  return zip;
}

function acharFimCentral(zip) {
  for (let posicao = zip.length - 22; posicao >= 0; posicao -= 1) {
    if (zip.readUInt32LE(posicao) !== 0x06054b50) continue;
    if (zip.readUInt16LE(posicao + 20) === zip.length - posicao - 22) return posicao;
  }
  throw new Error("fim do diretório central do ZIP não encontrado");
}

function lerMembroZip(zip, nome) {
  const fimCentral = acharFimCentral(zip);
  const disco = zip.readUInt16LE(fimCentral + 4);
  const discoCentral = zip.readUInt16LE(fimCentral + 6);
  if (disco !== 0 || discoCentral !== 0) {
    throw new Error(`ZIP dividido em múltiplos discos (${disco}/${discoCentral}) não é suportado`);
  }
  const totalEntradas = zip.readUInt16LE(fimCentral + 10);
  if (totalEntradas === 0xffff) {
    throw new Error("ZIP64 não é suportado");
  }
  let posicao = zip.readUInt32LE(fimCentral + 16);

  for (let entrada = 0; entrada < totalEntradas; entrada += 1) {
    if (zip.readUInt32LE(posicao) !== 0x02014b50) {
      throw new Error(`assinatura inválida na entrada ${entrada} do diretório central`);
    }
    const bandeiras = zip.readUInt16LE(posicao + 8);
    const compressao = zip.readUInt16LE(posicao + 10);
    const tamanhoComprimido = zip.readUInt32LE(posicao + 20);
    const tamanhoNome = zip.readUInt16LE(posicao + 28);
    const tamanhoExtra = zip.readUInt16LE(posicao + 30);
    const tamanhoComentario = zip.readUInt16LE(posicao + 32);
    const inicioLocal = zip.readUInt32LE(posicao + 42);
    const nomeEntrada = zip.toString("latin1", posicao + 46, posicao + 46 + tamanhoNome);

    if (nomeEntrada === nome) {
      if ((bandeiras & 0x0001) !== 0) throw new Error(`${nome} está criptografado`);
      if (zip.readUInt32LE(inicioLocal) !== 0x04034b50) {
        throw new Error(`cabeçalho local inválido para ${nome}`);
      }
      const tamanhoNomeLocal = zip.readUInt16LE(inicioLocal + 26);
      const tamanhoExtraLocal = zip.readUInt16LE(inicioLocal + 28);
      const inicioDados = inicioLocal + 30 + tamanhoNomeLocal + tamanhoExtraLocal;
      const fimDados = inicioDados + tamanhoComprimido;
      if (fimDados > zip.length) throw new Error(`dados de ${nome} passam do fim do arquivo`);
      const dados = zip.subarray(inicioDados, fimDados);
      if (compressao === 0) return dados;
      if (compressao === 8) return inflateRawSync(dados);
      throw new Error(`método de compressão ${compressao} não suportado em ${nome}`);
    }

    posicao += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }

  throw new Error(`${nome} não encontrado no ZIP`);
}

function lerCsv(texto, separador = ";") {
  const linhas = [];
  let linha = [];
  let campo = "";
  let citado = false;

  for (let i = 0; i < texto.length; i += 1) {
    const caractere = texto[i];
    if (citado) {
      if (caractere !== '"') {
        campo += caractere;
      } else if (texto[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else {
        citado = false;
      }
      continue;
    }
    if (caractere === '"' && campo === "") citado = true;
    else if (caractere === separador) {
      linha.push(campo);
      campo = "";
    } else if (caractere === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else if (caractere !== "\r") campo += caractere;
  }
  if (citado) throw new Error("CSV termina com aspas abertas");
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  const [cabecalho, ...corpo] = linhas;
  return corpo
    .filter((valores) => valores.length > 1 || valores[0] !== "")
    .map((valores) => {
      if (valores.length !== cabecalho.length) {
        throw new Error(`linha com ${valores.length} colunas, esperado ${cabecalho.length}`);
      }
      return Object.fromEntries(cabecalho.map((chave, indice) => [chave, valores[indice]]));
    });
}

function texto(valor) {
  return NULO.has(valor) ? null : valor;
}

function numero(valor) {
  if (!/^-?\d+$/.test(valor)) throw new Error(`valor numérico inválido: ${valor}`);
  return Number(valor);
}

function dataIso(valor) {
  const partes = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (partes === null) throw new Error(`data inválida: ${valor}`);
  const [, dia, mes, ano] = partes;
  const iso = `${ano}-${mes}-${dia}`;
  if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) {
    throw new Error(`data inexistente no calendário: ${valor}`);
  }
  return iso;
}

function unico(registros, chave) {
  const valores = new Set(registros.map((registro) => registro[chave]));
  if (valores.size !== 1) {
    throw new Error(`${chave} deveria ser constante, encontrei ${valores.size} valores`);
  }
  return [...valores][0];
}

function dicionario(registros, chaveCodigo, montar) {
  const mapa = new Map();
  for (const registro of registros) {
    const bruto = registro[chaveCodigo];
    if (NULO.has(bruto) || bruto === "-1") continue;
    const codigo = numero(bruto);
    const valor = montar(registro);
    if (valor === undefined || (typeof valor === "object" && Object.values(valor).includes(undefined))) {
      throw new Error(`descrição ausente para ${chaveCodigo}=${bruto}`);
    }
    const anterior = mapa.get(codigo);
    if (anterior === undefined) {
      mapa.set(codigo, valor);
      continue;
    }
    if (JSON.stringify(anterior) !== JSON.stringify(valor)) {
      throw new Error(`${chaveCodigo}=${bruto} descreve dois valores diferentes`);
    }
  }
  return Object.fromEntries([...mapa.entries()].sort(([a], [b]) => a - b));
}

function mapaUnico(registros, chaveCodigo, chaveValor) {
  const mapa = new Map();
  for (const registro of registros) {
    const codigo = registro[chaveCodigo];
    const valor = registro[chaveValor];
    if (valor === undefined) throw new Error(`coluna ${chaveValor} ausente no CSV`);
    const anterior = mapa.get(codigo);
    if (anterior === undefined) mapa.set(codigo, valor);
    else if (anterior !== valor) {
      throw new Error(`${chaveCodigo}=${codigo} aparece como ${anterior} e ${valor}`);
    }
  }
  return mapa;
}

function contar(registros, extrair) {
  const totais = new Map();
  for (const registro of registros) {
    const chave = extrair(registro);
    totais.set(chave, (totais.get(chave) ?? 0) + 1);
  }
  return Object.fromEntries([...totais.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR")));
}

const zip = await baixarZip(ZIP);
const registros = lerCsv(new TextDecoder("latin1").decode(lerMembroZip(zip, MEMBRO)));
if (registros.length === 0) throw new Error(`${MEMBRO} veio sem registros`);

const eleicao = {
  ano: numero(unico(registros, "ANO_ELEICAO")),
  turno: numero(unico(registros, "NR_TURNO")),
  tipo: unico(registros, "NM_TIPO_ELEICAO"),
  data: dataIso(unico(registros, "DT_ELEICAO")),
};
if (eleicao.ano !== 2026) throw new Error(`ANO_ELEICAO inesperado: ${eleicao.ano}`);

const eleicoes = dicionario(registros, "CD_ELEICAO", (registro) => ({
  descricao: registro.DS_ELEICAO,
  abrangencia: registro.TP_ABRANGENCIA,
}));

const cargos = dicionario(registros, "CD_CARGO", (registro) => ({
  nome: registro.DS_CARGO,
  eleicao: numero(registro.CD_ELEICAO),
}));

const unidadeNome = mapaUnico(registros, "SG_UE", "NM_UE");
const unidades = [...unidadeNome.keys()].sort();
const unidadeIndice = new Map(unidades.map((sigla, indice) => [sigla, indice]));

const ufsNascimento = [...new Set(registros.map((registro) => registro.SG_UF_NASCIMENTO))].sort();
const ufNascimentoIndice = new Map(ufsNascimento.map((sigla, indice) => [sigla, indice]));

const coligacoes = new Map();
for (const registro of registros) {
  const sequencial = registro.SQ_COLIGACAO;
  const valor = {
    sq: numero(sequencial),
    nome: registro.NM_COLIGACAO,
    tipo: registro.TP_AGREMIACAO,
    composicao: registro.DS_COMPOSICAO_COLIGACAO,
  };
  const anterior = coligacoes.get(sequencial);
  if (anterior === undefined) coligacoes.set(sequencial, valor);
  else if (JSON.stringify(anterior) !== JSON.stringify(valor)) {
    throw new Error(`SQ_COLIGACAO=${sequencial} descreve duas coligações diferentes`);
  }
}
const coligacaoIndice = new Map([...coligacoes.keys()].map((sequencial, indice) => [sequencial, indice]));

for (const registro of registros) {
  if (registro.SG_UF !== registro.SG_UE) {
    throw new Error(`SG_UF (${registro.SG_UF}) diverge de SG_UE (${registro.SG_UE})`);
  }
}

const colunas = [
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

const candidatos = registros
  .map((registro) => [
    numero(registro.SQ_CANDIDATO),
    numero(registro.CD_CARGO),
    unidadeIndice.get(registro.SG_UE),
    numero(registro.NR_CANDIDATO),
    registro.NM_CANDIDATO,
    registro.NM_URNA_CANDIDATO,
    texto(registro.NM_SOCIAL_CANDIDATO),
    numero(registro.NR_PARTIDO),
    registro.NR_FEDERACAO === "-1" ? null : numero(registro.NR_FEDERACAO),
    coligacaoIndice.get(registro.SQ_COLIGACAO),
    ufNascimentoIndice.get(registro.SG_UF_NASCIMENTO),
    dataIso(registro.DT_NASCIMENTO),
    numero(registro.CD_GENERO),
    numero(registro.CD_GRAU_INSTRUCAO),
    numero(registro.CD_ESTADO_CIVIL),
    numero(registro.CD_COR_RACA),
    numero(registro.CD_OCUPACAO),
  ])
  .sort((a, b) => a[0] - b[0]);

const sequenciais = new Set(candidatos.map((candidato) => candidato[0]));
if (sequenciais.size !== candidatos.length) {
  throw new Error(`SQ_CANDIDATO repetido: ${candidatos.length} linhas, ${sequenciais.size} sequenciais`);
}

const dados = {
  fonte: {
    portal: PORTAL,
    arquivo: ZIP,
    membro: MEMBRO,
    geradoEm: `${dataIso(unico(registros, "DT_GERACAO"))}T${unico(registros, "HH_GERACAO")}-03:00`,
    coletadoEm: new Date().toISOString(),
  },
  eleicao,
  eleicoes,
  resumo: {
    totalCandidatos: candidatos.length,
    porCargo: contar(registros, (registro) => registro.DS_CARGO),
    porUnidadeEleitoral: contar(registros, (registro) => registro.SG_UE),
  },
  dicionarios: {
    cargo: cargos,
    unidadeEleitoral: unidades.map((sigla) => [sigla, unidadeNome.get(sigla)]),
    ufNascimento: ufsNascimento,
    partido: dicionario(registros, "NR_PARTIDO", (registro) => ({
      sigla: registro.SG_PARTIDO,
      nome: registro.NM_PARTIDO,
    })),
    federacao: dicionario(registros, "NR_FEDERACAO", (registro) => ({
      sigla: registro.SG_FEDERACAO,
      nome: registro.NM_FEDERACAO,
      composicao: registro.DS_COMPOSICAO_FEDERACAO,
    })),
    coligacao: [...coligacoes.values()],
    genero: dicionario(registros, "CD_GENERO", (registro) => registro.DS_GENERO),
    instrucao: dicionario(registros, "CD_GRAU_INSTRUCAO", (registro) => registro.DS_GRAU_INSTRUCAO),
    estadoCivil: dicionario(registros, "CD_ESTADO_CIVIL", (registro) => registro.DS_ESTADO_CIVIL),
    corRaca: dicionario(registros, "CD_COR_RACA", (registro) => registro.DS_COR_RACA),
    ocupacao: dicionario(registros, "CD_OCUPACAO", (registro) => registro.DS_OCUPACAO),
  },
  colunas,
  candidatos,
};

const partes = [
  "{",
  ...Object.entries(dados)
    .filter(([chave]) => chave !== "candidatos")
    .map(([chave, valor]) => `${JSON.stringify(chave)}: ${JSON.stringify(valor, null, 2).replaceAll("\n", "\n  ")},`)
    .map((bloco) => `  ${bloco}`),
  '  "candidatos": [',
  candidatos.map((candidato) => `    ${JSON.stringify(candidato)}`).join(",\n"),
  "  ]",
  "}",
];

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(join(ROOT, "data", "candidatos-2026.json"), `${partes.join("\n")}\n`);

console.log(`Candidaturas 2026 (TSE) — ${MEMBRO}`);
console.log(`Gerado pelo TSE em: ${dados.fonte.geradoEm}`);
console.log(`Total de candidaturas: ${candidatos.length}`);
for (const [cargo, total] of Object.entries(dados.resumo.porCargo)) {
  console.log(`  ${cargo}: ${total}`);
}
console.log(`Partidos: ${Object.keys(dados.dicionarios.partido).length}`);
console.log(`Federações: ${Object.keys(dados.dicionarios.federacao).length}`);
console.log(`Coligações: ${dados.dicionarios.coligacao.length}`);
