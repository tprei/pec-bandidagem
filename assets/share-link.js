export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ELECTORAL_UNIT_TO_STATE = {
  1: "AC",
  2: "AL",
  3: "AP",
  4: "AM",
  5: "BA",
  6: "CE",
  7: "DF",
  8: "ES",
  9: "GO",
  10: "MA",
  11: "MT",
  12: "MS",
  13: "MG",
  14: "PA",
  15: "PB",
  16: "PR",
  17: "PE",
  18: "PI",
  19: "RJ",
  20: "RN",
  21: "RS",
  22: "RO",
  23: "RR",
  24: "SC",
  25: "SP",
  26: "SE",
  27: "TO",
  28: "BR",
};
export const TEMPLATES = ["booth", "ballot"];
export const TYPE_BY_CODE = { C: "candidate", D: "duel", P: "issue", L: "list" };
export const DOMAIN = "votosecreto.com.br";

const ALPHABET_MAP = Object.fromEntries([...ALPHABET].map((char, index) => [char, index]));
const NORMALIZE_MAP = { I: "1", L: "1", O: "0" };

const BITS_SEQUENCE = 22n;
const BITS_REF = 27n;
const REF_MASK = (1n << BITS_REF) - 1n;
const SEQUENCE_MASK = (1n << BITS_SEQUENCE) - 1n;

function b32Encode(value, length) {
  let str = "";
  for (let i = length - 1; i >= 0; i--) {
    const digit = Number((value >> BigInt(i * 5)) & 31n);
    str += ALPHABET[digit];
  }
  return str;
}

function b32Decode(str) {
  let value = 0n;
  for (let i = 0; i < str.length; i++) {
    const index = ALPHABET_MAP[str[i]];
    if (index === undefined) return null;
    value = (value << 5n) | BigInt(index);
  }
  return value;
}

function encodeRef(sq) {
  const num = Number(sq);
  const electoralUnit = Math.floor(num / 1e10);
  const sequence = Math.round(num % 1e10);
  if (!ELECTORAL_UNIT_TO_STATE[electoralUnit] || sequence < 0 || sequence >= 2 ** Number(BITS_SEQUENCE)) {
    throw new RangeError(`sq out of supported range: ${sq}`);
  }
  return (BigInt(electoralUnit) << BITS_SEQUENCE) | BigInt(sequence);
}

function decodeRef(ref) {
  const electoralUnit = Number(ref >> BITS_SEQUENCE);
  const sequence = Number(ref & SEQUENCE_MASK);
  if (!ELECTORAL_UNIT_TO_STATE[electoralUnit] || sequence < 0 || sequence >= 2 ** Number(BITS_SEQUENCE)) {
    return null;
  }
  return electoralUnit * 1e10 + sequence;
}

export function stateFromSq(sq) {
  return ELECTORAL_UNIT_TO_STATE[Math.floor(Number(sq) / 1e10)];
}

export function buildUrl(stance, id) {
  return `https://${DOMAIN}/#/${stance}/${id}`;
}

export function linkText(stance, id) {
  return `${DOMAIN}/#/${stance}/${id}`;
}

export function extractRoute(text) {
  if (!text || typeof text !== "string") return null;
  const dossierMatch = text.match(/(?:#\/|\/|^)ficha\/(\d+)/);
  if (dossierMatch) return { sq: Number(dossierMatch[1]) };
  const postMatch = text.match(/(?:#\/|\/|\b)(nao|voto)\/([0-9A-Za-z]+)/);
  if (postMatch) return { stance: postMatch[1], id: postMatch[2].toUpperCase() };
  return null;
}

function encodeGrid(letter, templateIndex, axes, faces) {
  let axesBits = 0;
  for (const axis of axes) {
    if (typeof axis !== "number" || axis < 0 || axis > 7) throw new RangeError(`invalid axis: ${axis}`);
    axesBits |= 1 << axis;
  }
  const count = faces.length;
  if (count < 1 || count > 9) throw new RangeError("faces must have between 1 and 9 items");
  const facesBits = BigInt(count) * BITS_REF;
  let value =
    (BigInt(templateIndex) << (facesBits + 12n)) |
    (BigInt(axesBits) << (facesBits + 4n)) |
    (BigInt(count) << facesBits);
  for (let i = 0; i < count; i++) {
    value |= encodeRef(faces[i]) << (BITS_REF * BigInt(count - 1 - i));
  }
  return letter + b32Encode(value, Math.ceil((13 + 27 * count) / 5));
}

function decodeGrid(type, value, payloadLength) {
  let count = 0;
  for (let k = 1; k <= 9; k++) {
    if (Math.ceil((13 + 27 * k) / 5) === payloadLength) {
      count = k;
      break;
    }
  }
  if (count === 0) return null;
  const totalBits = BigInt(13 + 27 * count);
  if (value >= 1n << totalBits) return null;
  const facesBits = BigInt(count) * BITS_REF;
  const template = TEMPLATES[Number((value >> (facesBits + 12n)) & 1n)];
  const axesBits = Number((value >> (facesBits + 4n)) & 255n);
  const axes = [];
  for (let i = 0; i < 8; i++) {
    if ((axesBits & (1 << i)) !== 0) axes.push(i);
  }
  if (Number((value >> facesBits) & 15n) !== count) return null;
  const faces = [];
  for (let i = 0; i < count; i++) {
    const sq = decodeRef((value >> (BITS_REF * BigInt(count - 1 - i))) & REF_MASK);
    if (sq === null) return null;
    faces.push(sq);
  }
  return { type, template, axes, faces };
}

export function encodePost(post) {
  if (!post || typeof post !== "object") throw new TypeError("invalid post");
  const templateIndex = TEMPLATES.indexOf(post.template ?? "booth");
  if (templateIndex === -1) throw new RangeError(`unknown template: ${post.template}`);

  if (post.type === "candidate") {
    const reasons = post.reasons ?? [];
    if (reasons.length > 4) throw new RangeError("reasons exceeds limit of 4");
    let reasonsBits = 0;
    for (const reason of reasons) {
      if (typeof reason !== "number" || reason < 0 || reason > 7) {
        throw new RangeError(`invalid reason: ${reason}`);
      }
      reasonsBits |= 1 << reason;
    }
    const ref = encodeRef(post.sq);
    const value = (BigInt(templateIndex) << 35n) | (BigInt(reasonsBits) << 27n) | ref;
    return "C" + b32Encode(value, 8);
  }

  if (post.type === "duel") {
    const rejectedRef = encodeRef(post.rejected);
    const chosenRef = encodeRef(post.chosen);
    const value = (BigInt(templateIndex) << 54n) | (rejectedRef << 27n) | chosenRef;
    return "D" + b32Encode(value, 11);
  }

  if (post.type === "issue") {
    const axes = post.axes ?? [];
    if (axes.length < 1 || axes.length > 8) throw new RangeError("axes must have between 1 and 8 items");
    return encodeGrid("P", templateIndex, axes, post.faces ?? []);
  }

  if (post.type === "list") {
    const axes = post.axes ?? [];
    if (axes.length > 8) throw new RangeError("axes exceeds limit of 8");
    return encodeGrid("L", templateIndex, axes, post.faces ?? []);
  }

  throw new RangeError(`unknown post type: ${post.type}`);
}

export function decodePost(id) {
  if (typeof id !== "string" || id.length < 2) return null;
  const typeCode = id[0].toUpperCase();
  if (!TYPE_BY_CODE[typeCode]) return null;

  let payload = "";
  for (let i = 1; i < id.length; i++) {
    const char = id[i].toUpperCase();
    payload += NORMALIZE_MAP[char] ?? char;
  }

  const value = b32Decode(payload);
  if (value === null) return null;

  if (typeCode === "C") {
    if (payload.length !== 8) return null;
    if (value >= 1n << 36n) return null;
    const template = TEMPLATES[Number((value >> 35n) & 1n)];
    const reasonsBits = Number((value >> 27n) & 255n);
    const reasons = [];
    for (let i = 0; i < 8; i++) {
      if ((reasonsBits & (1 << i)) !== 0) reasons.push(i);
    }
    if (reasons.length > 4) return null;
    const sq = decodeRef(value & REF_MASK);
    if (sq === null) return null;
    return { type: "candidate", template, sq, reasons };
  }

  if (typeCode === "D") {
    if (payload.length !== 11) return null;
    if (value >= 1n << 55n) return null;
    const template = TEMPLATES[Number((value >> 54n) & 1n)];
    const rejected = decodeRef((value >> 27n) & REF_MASK);
    const chosen = decodeRef(value & REF_MASK);
    if (rejected === null || chosen === null) return null;
    return { type: "duel", template, rejected, chosen };
  }

  if (typeCode === "P") {
    const grid = decodeGrid("issue", value, payload.length);
    return grid && grid.axes.length > 0 ? grid : null;
  }

  if (typeCode === "L") {
    return decodeGrid("list", value, payload.length);
  }

  return null;
}
