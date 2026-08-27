import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "tse", "fotos");
const DESTINO_FOTOS = join(ROOT, "fotos-tse");
const BASE_URL = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos";
const TENTATIVAS = 8;

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "BR", "CE", "DF", "ES", "GO",
  "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ",
  "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

const CABECALHOS = {
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Linux"',
  "upgrade-insecure-requests": "1",
};

function urlUf(uf) {
  return `${BASE_URL}/foto_cand2026_${uf}_div.zip`;
}

function destinoZip(uf) {
  return join(CACHE, `foto_cand2026_${uf}_div.zip`);
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
      const resposta = await fetch(endereco, {
        headers: { ...CABECALHOS, range: "bytes=0-0" },
        signal: AbortSignal.timeout(60_000),
      });
      const status = resposta.status;
      const cr = resposta.headers.get("content-range");
      const cl = resposta.headers.get("content-length");
      const etag = resposta.headers.get("etag");
      await resposta.body?.cancel();

      if (!resposta.ok && status !== 206) {
        throw new Error(`respondeu ${status} ${resposta.statusText}`);
      }
      let tamanho = null;
      if (status === 206 && cr) {
        const match = /^bytes \d+-\d+\/(\d+)$/.exec(cr);
        if (match) tamanho = Number(match[1]);
      }
      if (tamanho === null && cl) {
        tamanho = Number(cl);
      }
      if (!Number.isInteger(tamanho) || tamanho <= 0) {
        throw new Error(`tamanho inválido (${tamanho}), status ${status}`);
      }
      if (etag === null) throw new Error("etag ausente");
      return { tamanho, etag };
    } catch (erro) {
      ultimoErro = erro;
      await esperar(1000 * tentativa);
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
      const cabecalhos = {
        ...CABECALHOS,
        ...(obtido > 0 ? { range: `bytes=${obtido}-`, "if-range": remoto.etag } : {}),
      };
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

function acharFimCentral(zip) {
  for (let posicao = zip.length - 22; posicao >= 0; posicao -= 1) {
    if (zip.readUInt32LE(posicao) !== 0x06054b50) continue;
    if (zip.readUInt16LE(posicao + 20) === zip.length - posicao - 22) return posicao;
  }
  throw new Error("fim do diretório central do ZIP não encontrado");
}

function extrairFotosZip(zipBuffer, destinoDir) {
  const fimCentral = acharFimCentral(zipBuffer);
  const disco = zipBuffer.readUInt16LE(fimCentral + 4);
  const discoCentral = zipBuffer.readUInt16LE(fimCentral + 6);
  if (disco !== 0 || discoCentral !== 0) {
    throw new Error(`ZIP dividido em múltiplos discos (${disco}/${discoCentral}) não é suportado`);
  }
  const totalEntradas = zipBuffer.readUInt16LE(fimCentral + 10);
  if (totalEntradas === 0xffff) {
    throw new Error("ZIP64 não é suportado");
  }
  let posicao = zipBuffer.readUInt32LE(fimCentral + 16);
  let total = 0;

  for (let entrada = 0; entrada < totalEntradas; entrada += 1) {
    if (zipBuffer.readUInt32LE(posicao) !== 0x02014b50) {
      throw new Error(`assinatura inválida na entrada ${entrada} do diretório central`);
    }
    const bandeiras = zipBuffer.readUInt16LE(posicao + 8);
    const compressao = zipBuffer.readUInt16LE(posicao + 10);
    const tamanhoComprimido = zipBuffer.readUInt32LE(posicao + 20);
    const tamanhoNome = zipBuffer.readUInt16LE(posicao + 28);
    const tamanhoExtra = zipBuffer.readUInt16LE(posicao + 30);
    const tamanhoComentario = zipBuffer.readUInt16LE(posicao + 32);
    const inicioLocal = zipBuffer.readUInt32LE(posicao + 42);
    const nomeEntrada = zipBuffer.toString("latin1", posicao + 46, posicao + 46 + tamanhoNome);
    if (nomeEntrada.toLowerCase() === "leiame.pdf") {
      posicao += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
      continue;
    }

    const casamento = /^F[A-Z]{2}(\d+)_div\.jpg$/i.exec(nomeEntrada);
    if (!casamento) {
      throw new Error(`nome de arquivo inesperado no ZIP: ${nomeEntrada}`);
    }
    const sq = casamento[1];

    if ((bandeiras & 0x0001) !== 0) throw new Error(`${nomeEntrada} está criptografado`);
    if (zipBuffer.readUInt32LE(inicioLocal) !== 0x04034b50) {
      throw new Error(`cabeçalho local inválido para ${nomeEntrada}`);
    }
    const tamanhoNomeLocal = zipBuffer.readUInt16LE(inicioLocal + 26);
    const tamanhoExtraLocal = zipBuffer.readUInt16LE(inicioLocal + 28);
    const inicioDados = inicioLocal + 30 + tamanhoNomeLocal + tamanhoExtraLocal;
    const fimDados = inicioDados + tamanhoComprimido;
    if (fimDados > zipBuffer.length) throw new Error(`dados de ${nomeEntrada} passam do fim do arquivo`);
    const dados = zipBuffer.subarray(inicioDados, fimDados);
    const conteudo = compressao === 0 ? dados : compressao === 8 ? inflateRawSync(dados) : null;
    if (conteudo === null) throw new Error(`método de compressão ${compressao} não suportado em ${nomeEntrada}`);

    writeFileSync(join(destinoDir, `${sq}.jpg`), conteudo);
    total += 1;

    posicao += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  return total;
}

mkdirSync(CACHE, { recursive: true });
mkdirSync(DESTINO_FOTOS, { recursive: true });

const manifesto = lerManifesto();
let totalFotosGeral = 0;

for (const uf of UFS) {
  const url = urlUf(uf);
  const arqDestino = destinoZip(uf);
  await baixar(url, arqDestino, manifesto);
  const zipBuffer = readFileSync(arqDestino);
  const extraidas = extrairFotosZip(zipBuffer, DESTINO_FOTOS);
  totalFotosGeral += extraidas;
  console.log(`ok ${uf}: ${extraidas} fotos`);
}

console.log(`Total de fotos extraídas: ${totalFotosGeral}`);
