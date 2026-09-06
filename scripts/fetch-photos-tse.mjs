import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "tse", "fotos");
const PHOTOS_DEST = join(ROOT, "fotos-tse");
const BASE_URL = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos";
const RETRIES = 8;

const STATES = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "BR",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
];

const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
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

function stateUrl(state) {
  return `${BASE_URL}/foto_cand2026_${state}_div.zip`;
}

function stateZipDest(state) {
  return join(CACHE, `foto_cand2026_${state}_div.zip`);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readManifest() {
  const file = join(CACHE, "manifesto.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

function writeManifest(manifest) {
  writeFileSync(join(CACHE, "manifesto.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function probeRemote(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { ...HEADERS, range: "bytes=0-0" },
        signal: AbortSignal.timeout(60_000),
      });
      const status = response.status;
      const cr = response.headers.get("content-range");
      const cl = response.headers.get("content-length");
      const etag = response.headers.get("etag");
      await response.body?.cancel();

      if (!response.ok && status !== 206) {
        throw new Error(`respondeu ${status} ${response.statusText}`);
      }
      let size = null;
      if (status === 206 && cr) {
        const match = /^bytes \d+-\d+\/(\d+)$/.exec(cr);
        if (match) size = Number(match[1]);
      }
      if (size === null && cl) {
        size = Number(cl);
      }
      if (!Number.isInteger(size) || size <= 0) {
        throw new Error(`tamanho inválido (${size}), status ${status}`);
      }
      if (etag === null) throw new Error("etag ausente");
      return { size, etag };
    } catch (error) {
      lastError = error;
      await sleep(1000 * attempt);
    }
  }
  throw new Error(`não foi possível medir ${url}: ${lastError.message}`);
}

function fileSummary(dest) {
  return createHash("sha256").update(readFileSync(dest)).digest("hex");
}

function log(manifest, key, remote, dest) {
  manifest[key] = {
    tamanho: remote.size,
    etag: remote.etag,
    bytes: statSync(dest).size,
    sha256: fileSummary(dest),
  };
  writeManifest(manifest);
}

async function downloadFile(url, dest, manifest) {
  const key = dest.slice(CACHE.length + 1);
  const remote = await probeRemote(url);
  const record = manifest[key];
  const local = existsSync(dest) ? statSync(dest).size : 0;
  const isTrusted =
    local > 0 &&
    record?.etag === remote.etag &&
    (record.tamanho ?? record.size) === remote.size &&
    record.bytes === local &&
    record.sha256 === fileSummary(dest);

  if (isTrusted && local === remote.size) return false;
  if (local > 0 && !isTrusted) rmSync(dest);

  let lastError = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    const obtained = existsSync(dest) ? statSync(dest).size : 0;
    if (obtained === remote.size) {
      log(manifest, key, remote, dest);
      return true;
    }
    if (obtained > remote.size) {
      throw new Error(`${key} tem ${obtained} bytes, mais que os ${remote.size} da origem`);
    }
    try {
      const headers = {
        ...HEADERS,
        ...(obtained > 0 ? { range: `bytes=${obtained}-`, "if-range": remote.etag } : {}),
      };
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(600_000) });
      if (response.body === null) throw new Error("resposta sem corpo");

      let append = obtained > 0;
      if (append && response.status === 200) append = false;
      else if (append) {
        if (response.status !== 206) throw new Error(`retomada recusada com ${response.status}`);
        const range = response.headers.get("content-range");
        const expected = `bytes ${obtained}-${remote.size - 1}/${remote.size}`;
        if (range !== expected) throw new Error(`content-range ${range} não corresponde a ${expected}`);
      } else if (!response.ok) {
        throw new Error(`respondeu ${response.status} ${response.statusText}`);
      }

      await pipeline(Readable.fromWeb(response.body), createWriteStream(dest, { flags: append ? "a" : "w" }));
    } catch (error) {
      lastError = error;
      if (existsSync(dest)) log(manifest, key, remote, dest);
      await sleep(1000 * attempt);
      continue;
    }
    log(manifest, key, remote, dest);
  }

  const obtained = existsSync(dest) ? statSync(dest).size : 0;
  if (obtained !== remote.size) {
    throw new Error(
      `${key} ficou em ${obtained} de ${remote.size} bytes após ${RETRIES} tentativas: ${lastError?.message}`,
    );
  }
  log(manifest, key, remote, dest);
  return true;
}

function findCentralDirectoryEnd(zip) {
  for (let position = zip.length - 22; position >= 0; position -= 1) {
    if (zip.readUInt32LE(position) !== 0x06054b50) continue;
    if (zip.readUInt16LE(position + 20) === zip.length - position - 22) return position;
  }
  throw new Error("fim do diretório central do ZIP não encontrado");
}

function extractPhotosFromZip(zipBuffer, destDir) {
  const centralEnd = findCentralDirectoryEnd(zipBuffer);
  const disk = zipBuffer.readUInt16LE(centralEnd + 4);
  const centralDisk = zipBuffer.readUInt16LE(centralEnd + 6);
  if (disk !== 0 || centralDisk !== 0) {
    throw new Error(`ZIP dividido em múltiplos discos (${disk}/${centralDisk}) não é suportado`);
  }
  const totalEntries = zipBuffer.readUInt16LE(centralEnd + 10);
  if (totalEntries === 0xffff) {
    throw new Error("ZIP64 não é suportado");
  }
  let position = zipBuffer.readUInt32LE(centralEnd + 16);
  let total = 0;

  for (let entry = 0; entry < totalEntries; entry += 1) {
    if (zipBuffer.readUInt32LE(position) !== 0x02014b50) {
      throw new Error(`assinatura inválida na entrada ${entry} do diretório central`);
    }
    const flags = zipBuffer.readUInt16LE(position + 8);
    const compression = zipBuffer.readUInt16LE(position + 10);
    const compressedSize = zipBuffer.readUInt32LE(position + 20);
    const nameLength = zipBuffer.readUInt16LE(position + 28);
    const extraLength = zipBuffer.readUInt16LE(position + 30);
    const commentLength = zipBuffer.readUInt16LE(position + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(position + 42);
    const entryName = zipBuffer.toString("latin1", position + 46, position + 46 + nameLength);
    if (entryName.toLowerCase() === "leiame.pdf") {
      position += 46 + nameLength + extraLength + commentLength;
      continue;
    }

    const match = /^F[A-Z]{2}(\d+)_div\.jpg$/i.exec(entryName);
    if (!match) {
      throw new Error(`nome de arquivo inesperado no ZIP: ${entryName}`);
    }
    const sq = match[1];

    if ((flags & 0x0001) !== 0) throw new Error(`${entryName} está criptografado`);
    if (zipBuffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`cabeçalho local inválido para ${entryName}`);
    }
    const localNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > zipBuffer.length) throw new Error(`dados de ${entryName} passam do fim do arquivo`);
    const data = zipBuffer.subarray(dataStart, dataEnd);
    const content = compression === 0 ? data : compression === 8 ? inflateRawSync(data) : null;
    if (content === null)
      throw new Error(`método de compressão ${compression} não suportado em ${entryName}`);

    writeFileSync(join(destDir, `${sq}.jpg`), content);
    total += 1;

    position += 46 + nameLength + extraLength + commentLength;
  }
  return total;
}

mkdirSync(CACHE, { recursive: true });
mkdirSync(PHOTOS_DEST, { recursive: true });

const manifest = readManifest();
let totalPhotos = 0;

for (const state of STATES) {
  const url = stateUrl(state);
  const destZip = stateZipDest(state);
  await downloadFile(url, destZip, manifest);
  const zipBuffer = readFileSync(destZip);
  const extractedCount = extractPhotosFromZip(zipBuffer, PHOTOS_DEST);
  totalPhotos += extractedCount;
  console.log(`ok ${state}: ${extractedCount} fotos`);
}

console.log(`Total de fotos extraídas: ${totalPhotos}`);
