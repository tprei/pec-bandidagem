import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONCURRENCY = 6;
const MAX_RETRIES = 3;

const data = JSON.parse(readFileSync(join(ROOT, "data", "votos-pec-blindagem.json"), "utf8"));
const deputies = data.deputados;
if (!Array.isArray(deputies)) {
  throw new Error("data/votos-pec-blindagem.json não tem a lista de deputados");
}
const withoutUrl = deputies.filter((d) => !d.urlFoto);
if (withoutUrl.length > 0) {
  throw new Error(`deputados sem urlFoto: ${withoutUrl.map((d) => d.id).join(", ")}`);
}

mkdirSync(join(ROOT, "fotos"), { recursive: true });

function getDestinationPath(id) {
  return join(ROOT, "fotos", `${id}.jpg`);
}

function alreadyExists(id) {
  try {
    return statSync(getDestinationPath(id)).size > 0;
  } catch {
    return false;
  }
}

async function downloadPhoto({ id, urlFoto }) {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(urlFoto);
      if (!res.ok) {
        throw new Error(`GET ${urlFoto} failed with HTTP ${res.status}`);
      }
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length === 0) {
        throw new Error(`GET ${urlFoto} devolveu resposta vazia`);
      }
      writeFileSync(getDestinationPath(id), body);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }
  throw new Error(lastError);
}

const pending = deputies.filter((d) => !alreadyExists(d.id));
const skipped = deputies.length - pending.length;
const downloaded = [];
const failed = [];

let cursor = 0;
async function processQueue() {
  while (cursor < pending.length) {
    const deputy = pending[cursor];
    cursor += 1;
    try {
      await downloadPhoto(deputy);
      downloaded.push(deputy.id);
    } catch (error) {
      failed.push(`${deputy.id} (${error})`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, processQueue));

if (failed.length > 0) {
  throw new Error(`falha ao baixar ${failed.length} foto(s): ${failed.join(", ")}`);
}

console.log(`Total de fotos: ${deputies.length}`);
console.log(`Baixadas agora: ${downloaded.length}`);
console.log(`Já existentes: ${skipped}`);
console.log(`Falharam: ${failed.length}`);
