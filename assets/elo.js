export const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const UE_PARA_UF = {
  1: "AC", 2: "AL", 3: "AP", 4: "AM", 5: "BA", 6: "CE", 7: "DF", 8: "ES", 9: "GO", 10: "MA",
  11: "MT", 12: "MS", 13: "MG", 14: "PA", 15: "PB", 16: "PR", 17: "PE", 18: "PI", 19: "RJ", 20: "RN",
  21: "RS", 22: "RO", 23: "RR", 24: "SC", 25: "SP", 26: "SE", 27: "TO", 28: "BR",
};
export const MODELOS = ["cabine", "cedula"];
export const TIPOS = { C: "candidato", D: "duelo", P: "pauta", L: "lista" };
export const DOMINIO = "votosecreto.com.br";

const MAPA_ALFABETO = Object.fromEntries([...ALFABETO].map((c, i) => [c, i]));
const MAPA_NORMALIZAR = { I: "1", L: "1", O: "0" };

function b32Encode(val, len) {
  let s = "";
  for (let i = len - 1; i >= 0; i--) {
    const digito = Number((val >> BigInt(i * 5)) & 31n);
    s += ALFABETO[digito];
  }
  return s;
}

function b32Decode(str) {
  let val = 0n;
  for (let i = 0; i < str.length; i++) {
    const idx = MAPA_ALFABETO[str[i]];
    if (idx === undefined) return null;
    val = (val << 5n) | BigInt(idx);
  }
  return val;
}

function codificarRef(sq) {
  const n = Number(sq);
  const ue = Math.floor(n / 1e10);
  const seq = Math.round(n % 1e10);
  if (!UE_PARA_UF[ue] || seq < 0 || seq >= 2 ** 22) {
    throw new RangeError(`sq fora dos limites suportados: ${sq}`);
  }
  return (BigInt(ue) << 22n) | BigInt(seq);
}

function decodificarRef(ref) {
  const ue = Number(ref >> 22n);
  const seq = Number(ref & ((1n << 22n) - 1n));
  if (!UE_PARA_UF[ue] || seq < 0 || seq >= 2 ** 22) return null;
  return ue * 1e10 + seq;
}

export function ufDoSq(sq) {
  return UE_PARA_UF[Math.floor(Number(sq) / 1e10)];
}

export function montarUrl(postura, id) {
  return `https://${DOMINIO}/#/${postura}/${id}`;
}

export function textoLink(postura, id) {
  return `${DOMINIO}/#/${postura}/${id}`;
}
export function extrairRota(texto) {
  if (!texto || typeof texto !== "string") return null;
  const mFicha = texto.match(/(?:#\/|\/|^)ficha\/(\d+)/);
  if (mFicha) return { sq: Number(mFicha[1]) };
  const mPost = texto.match(/(?:#\/|\/|\b)(nao|voto)\/([0-9A-Za-z]+)/);
  if (mPost) return { postura: mPost[1], id: mPost[2].toUpperCase() };
  return null;
}

export function codificar(post) {
  if (!post || typeof post !== "object") throw new TypeError("post inválido");
  const modeloIdx = MODELOS.indexOf(post.modelo ?? "cabine");
  if (modeloIdx === -1) throw new RangeError(`modelo desconhecido: ${post.modelo}`);

  if (post.tipo === "candidato") {
    const motivos = post.motivos ?? [];
    if (motivos.length > 4) throw new RangeError("motivos excede o limite de 4");
    let motivosBits = 0;
    for (const m of motivos) {
      if (typeof m !== "number" || m < 0 || m > 7) throw new RangeError(`motivo inválido: ${m}`);
      motivosBits |= (1 << m);
    }
    const ref = codificarRef(post.sq);
    const val = (BigInt(modeloIdx) << 35n) | (BigInt(motivosBits) << 27n) | ref;
    return "C" + b32Encode(val, 8);
  }

  if (post.tipo === "duelo") {
    const refNao = codificarRef(post.nao);
    const refSim = codificarRef(post.sim);
    const val = (BigInt(modeloIdx) << 54n) | (refNao << 27n) | refSim;
    return "D" + b32Encode(val, 11);
  }

  if (post.tipo === "pauta") {
    const eixo = Number(post.eixo ?? 0);
    if (eixo < 0 || eixo > 15) throw new RangeError(`eixo inválido: ${eixo}`);
    const faces = post.faces ?? [];
    const n = faces.length;
    if (n < 1 || n > 9) throw new RangeError("faces deve ter entre 1 e 9 itens");
    let val = (BigInt(modeloIdx) << BigInt(8 + 27 * n)) | (BigInt(eixo) << BigInt(4 + 27 * n)) | (BigInt(n) << BigInt(27 * n));
    for (let i = 0; i < n; i++) {
      const ref = codificarRef(faces[i]);
      val |= (ref << BigInt(27 * (n - 1 - i)));
    }
    const len = Math.ceil((9 + 27 * n) / 5);
    return "P" + b32Encode(val, len);
  }

  if (post.tipo === "lista") {
    const faces = post.faces ?? [];
    const n = faces.length;
    if (n < 1 || n > 9) throw new RangeError("faces deve ter entre 1 e 9 itens");
    let val = (BigInt(modeloIdx) << BigInt(4 + 27 * n)) | (BigInt(n) << BigInt(27 * n));
    for (let i = 0; i < n; i++) {
      const ref = codificarRef(faces[i]);
      val |= (ref << BigInt(27 * (n - 1 - i)));
    }
    const len = Math.ceil((5 + 27 * n) / 5);
    return "L" + b32Encode(val, len);
  }

  throw new RangeError(`tipo de post desconhecido: ${post.tipo}`);
}

export function decodificar(id) {
  if (typeof id !== "string" || id.length < 2) return null;
  const tipoChar = id[0].toUpperCase();
  if (!TIPOS[tipoChar]) return null;

  let payload = "";
  for (let i = 1; i < id.length; i++) {
    const ch = id[i].toUpperCase();
    payload += MAPA_NORMALIZAR[ch] ?? ch;
  }

  const val = b32Decode(payload);
  if (val === null) return null;

  if (tipoChar === "C") {
    if (payload.length !== 8) return null;
    if (val >= (1n << 36n)) return null;
    const modelo = MODELOS[Number((val >> 35n) & 1n)];
    const motivosBits = Number((val >> 27n) & 255n);
    const motivos = [];
    for (let i = 0; i < 8; i++) {
      if ((motivosBits & (1 << i)) !== 0) motivos.push(i);
    }
    if (motivos.length > 4) return null;
    const sq = decodificarRef(val & ((1n << 27n) - 1n));
    if (sq === null) return null;
    return { tipo: "candidato", modelo, sq, motivos };
  }

  if (tipoChar === "D") {
    if (payload.length !== 11) return null;
    if (val >= (1n << 55n)) return null;
    const modelo = MODELOS[Number((val >> 54n) & 1n)];
    const nao = decodificarRef((val >> 27n) & ((1n << 27n) - 1n));
    const sim = decodificarRef(val & ((1n << 27n) - 1n));
    if (nao === null || sim === null) return null;
    return { tipo: "duelo", modelo, nao, sim };
  }

  if (tipoChar === "P") {
    let n = 0;
    for (let candidate = 1; candidate <= 9; candidate++) {
      if (Math.ceil((9 + 27 * candidate) / 5) === payload.length) {
        n = candidate;
        break;
      }
    }
    if (n === 0) return null;
    const totalBits = 9 + 27 * n;
    if (val >= (1n << BigInt(totalBits))) return null;
    const modelo = MODELOS[Number((val >> BigInt(8 + 27 * n)) & 1n)];
    const eixo = Number((val >> BigInt(4 + 27 * n)) & 15n);
    const decodedN = Number((val >> BigInt(27 * n)) & 15n);
    if (decodedN !== n) return null;
    const faces = [];
    for (let i = 0; i < n; i++) {
      const ref = (val >> BigInt(27 * (n - 1 - i))) & ((1n << 27n) - 1n);
      const sq = decodificarRef(ref);
      if (sq === null) return null;
      faces.push(sq);
    }
    return { tipo: "pauta", modelo, eixo, faces };
  }

  if (tipoChar === "L") {
    let n = 0;
    for (let candidate = 1; candidate <= 9; candidate++) {
      if (Math.ceil((5 + 27 * candidate) / 5) === payload.length) {
        n = candidate;
        break;
      }
    }
    if (n === 0) return null;
    const totalBits = 5 + 27 * n;
    if (val >= (1n << BigInt(totalBits))) return null;
    const modelo = MODELOS[Number((val >> BigInt(4 + 27 * n)) & 1n)];
    const decodedN = Number((val >> BigInt(27 * n)) & 15n);
    if (decodedN !== n) return null;
    const faces = [];
    for (let i = 0; i < n; i++) {
      const ref = (val >> BigInt(27 * (n - 1 - i))) & ((1n << 27n) - 1n);
      const sq = decodificarRef(ref);
      if (sq === null) return null;
      faces.push(sq);
    }
    return { tipo: "lista", modelo, faces };
  }

  return null;
}
