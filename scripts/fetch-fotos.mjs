import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIMULTANEOS = 6;
const TENTATIVAS = 3;

const dados = JSON.parse(
  readFileSync(join(ROOT, "data", "votos-pec-blindagem.json"), "utf8"),
);
const deputados = dados.deputados;
if (!Array.isArray(deputados)) {
  throw new Error("data/votos-pec-blindagem.json não tem a lista de deputados");
}
const semUrl = deputados.filter((d) => !d.urlFoto);
if (semUrl.length > 0) {
  throw new Error(`deputados sem urlFoto: ${semUrl.map((d) => d.id).join(", ")}`);
}

mkdirSync(join(ROOT, "fotos"), { recursive: true });

function destino(id) {
  return join(ROOT, "fotos", `${id}.jpg`);
}

function jaExiste(id) {
  try {
    return statSync(destino(id)).size > 0;
  } catch {
    return false;
  }
}

async function baixar({ id, urlFoto }) {
  let ultimaCausa = "";
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    try {
      const res = await fetch(urlFoto);
      if (!res.ok) {
        throw new Error(`GET ${urlFoto} failed with HTTP ${res.status}`);
      }
      const corpo = Buffer.from(await res.arrayBuffer());
      if (corpo.length === 0) {
        throw new Error(`GET ${urlFoto} devolveu resposta vazia`);
      }
      writeFileSync(destino(id), corpo);
      return;
    } catch (causa) {
      ultimaCausa = causa instanceof Error ? causa.message : String(causa);
      if (tentativa < TENTATIVAS) {
        await new Promise((resolver) => setTimeout(resolver, 400 * tentativa));
      }
    }
  }
  throw new Error(ultimaCausa);
}

const pendentes = deputados.filter((d) => !jaExiste(d.id));
const pulados = deputados.length - pendentes.length;
const baixados = [];
const falhados = [];

let cursor = 0;
async function trabalhar() {
  while (cursor < pendentes.length) {
    const deputado = pendentes[cursor];
    cursor += 1;
    try {
      await baixar(deputado);
      baixados.push(deputado.id);
    } catch (causa) {
      falhados.push(`${deputado.id} (${causa})`);
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(SIMULTANEOS, pendentes.length) }, trabalhar),
);

if (falhados.length > 0) {
  throw new Error(`falha ao baixar ${falhados.length} foto(s): ${falhados.join(", ")}`);
}

console.log(`Total de fotos: ${deputados.length}`);
console.log(`Baixadas agora: ${baixados.length}`);
console.log(`Já existentes: ${pulados}`);
console.log(`Falharam: ${falhados.length}`);
