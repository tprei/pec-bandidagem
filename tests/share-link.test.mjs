import test from "node:test";
import assert from "node:assert/strict";
import {
  ALPHABET,
  ELECTORAL_UNIT_TO_STATE,
  TEMPLATES,
  TYPE_BY_CODE,
  DOMAIN,
  encodePost,
  decodePost,
  stateFromSq,
  buildUrl,
  linkText,
  extractRoute,
} from "../assets/share-link.js";

const SQ_SP = 250002541303;
const SQ_AC = 10002532416;
const SQ_BR = 280002542548;

test("ufDoSq maps correct UFs", () => {
  assert.equal(stateFromSq(SQ_SP), "SP");
  assert.equal(stateFromSq(SQ_AC), "AC");
  assert.equal(stateFromSq(SQ_BR), "BR");
  assert.equal(stateFromSq(990000000000), undefined);
});

test("exported constants are well-formed", () => {
  assert.equal(ALPHABET.length, 32);
  assert.equal(ELECTORAL_UNIT_TO_STATE[25], "SP");
  assert.deepEqual(TEMPLATES, ["booth", "ballot"]);
  assert.equal(TYPE_BY_CODE.C, "candidate");
  assert.equal(DOMAIN, "votosecreto.com.br");
});

test("tipo C (candidato) round-trip and length", () => {
  const post = {
    type: "candidate",
    template: "booth",
    sq: SQ_SP,
    reasons: [0, 2, 5, 7],
  };
  const id = encodePost(post);
  assert.equal(id.length, 9, "C with motivos [0,2,5,7] must be 9 chars");
  assert.equal(id[0], "C");

  const dec = decodePost(id);
  assert.deepEqual(dec, {
    type: "candidate",
    template: "booth",
    sq: SQ_SP,
    reasons: [0, 2, 5, 7],
  });
});

test("tipo C with no motivos", () => {
  const post = { type: "candidate", template: "ballot", sq: SQ_AC, reasons: [] };
  const id = encodePost(post);
  assert.equal(id.length, 9);
  const dec = decodePost(id);
  assert.deepEqual(dec, {
    type: "candidate",
    template: "ballot",
    sq: SQ_AC,
    reasons: [],
  });
});

test("tipo D (duelo) round-trip and length", () => {
  const post = {
    type: "duel",
    template: "ballot",
    rejected: SQ_SP,
    chosen: SQ_AC,
  };
  const id = encodePost(post);
  assert.equal(id.length, 12);
  assert.equal(id[0], "D");

  const dec = decodePost(id);
  assert.deepEqual(dec, {
    type: "duel",
    template: "ballot",
    rejected: SQ_SP,
    chosen: SQ_AC,
  });
});

test("tipo P (pauta) round-trip", () => {
  const post = {
    type: "issue",
    template: "booth",
    axes: [3, 0],
    faces: [SQ_SP, SQ_AC, SQ_BR],
  };
  const id = encodePost(post);
  assert.equal(id.length, 20);
  assert.equal(id[0], "P");

  const dec = decodePost(id);
  assert.deepEqual(dec, {
    type: "issue",
    template: "booth",
    axes: [0, 3],
    faces: [SQ_SP, SQ_AC, SQ_BR],
  });
});

test("tipo L (lista) with 9 faces gives 53 chars and round-trips", () => {
  const faces = [SQ_SP, SQ_AC, SQ_BR, SQ_SP, SQ_AC, SQ_BR, SQ_SP, SQ_AC, SQ_BR];
  const post = {
    type: "list",
    template: "booth",
    faces,
  };
  const id = encodePost(post);
  assert.equal(id.length, 53, "L with 9 faces gives 53 chars");
  assert.equal(id[0], "L");

  const dec = decodePost(id);
  assert.deepEqual(dec, {
    type: "list",
    template: "booth",
    axes: [],
    faces,
  });

  const postWithAxes = {
    type: "list",
    template: "booth",
    axes: [1, 7],
    faces,
  };
  const idWithAxes = encodePost(postWithAxes);
  assert.equal(idWithAxes.length, 53);
  assert.deepEqual(decodePost(idWithAxes), {
    type: "list",
    template: "booth",
    axes: [1, 7],
    faces,
  });
});

test("decodificar validation and error cases", () => {
  assert.equal(decodePost("Z000"), null, "unknown tipo letter Z is null");
  assert.equal(decodePost(""), null);
  assert.equal(decodePost("C"), null);

  const validC = encodePost({
    type: "candidate",
    template: "booth",
    sq: SQ_SP,
    reasons: [0, 2],
  });
  assert.equal(decodePost(validC + "1"), null, "C id with trailing char is null");

  // Lowercase and Crockford normalization (O -> 0, I/L -> 1)
  const canonicalDec = decodePost(validC);
  const lowerId = validC.toLowerCase();
  assert.deepEqual(decodePost(lowerId), canonicalDec);

  // If we replace characters with O or I or L where valid:
  const idWithO = validC.replace(/0/g, "O");
  const idWithI = validC.replace(/1/g, "I");
  const idWithL = validC.replace(/1/g, "L");
  assert.deepEqual(decodePost(idWithO), canonicalDec);
  assert.deepEqual(decodePost(idWithI), canonicalDec);
  assert.deepEqual(decodePost(idWithL), canonicalDec);

  assert.equal(
    decodePost(encodePost({ type: "list", template: "booth", axes: [], faces: [SQ_SP] }).replace(/^L/, "P")),
    null,
    "pauta without eixos is null",
  );
});

test("codificar bounds checks", () => {
  assert.throws(
    () => encodePost({ type: "candidate", template: "booth", sq: SQ_SP, reasons: [0, 1, 2, 3, 4] }),
    RangeError,
  );
  assert.throws(() => encodePost({ type: "list", template: "booth", faces: [] }), RangeError);
  assert.throws(
    () => encodePost({ type: "list", template: "booth", faces: Array(10).fill(SQ_SP) }),
    RangeError,
  );
  assert.throws(() => encodePost({ type: "candidate", template: "booth", sq: 990000000000 }), RangeError);
  assert.throws(() => encodePost({ type: "issue", template: "booth", axes: [], faces: [SQ_SP] }), RangeError);
  assert.throws(
    () => encodePost({ type: "issue", template: "booth", axes: [8], faces: [SQ_SP] }),
    RangeError,
  );
});

test("montarUrl and textoLink", () => {
  assert.equal(buildUrl("nao", "C01234567"), "https://votosecreto.com.br/#/nao/C01234567");
  assert.equal(linkText("voto", "C01234567"), "votosecreto.com.br/#/voto/C01234567");
});

test("extrairRota parses URLs and pasted texts", () => {
  assert.deepEqual(extractRoute("Veja https://votosecreto.com.br/#/nao/C0ABCDEF1 agora"), {
    stance: "nao",
    id: "C0ABCDEF1",
  });
  assert.deepEqual(extractRoute("votosecreto.com.br/#/voto/D0123456789A"), {
    stance: "voto",
    id: "D0123456789A",
  });
  assert.deepEqual(extractRoute("https://votosecreto.com.br/#/ficha/250002541303"), { sq: 250002541303 });
  assert.equal(extractRoute("https://example.com/outra-coisa"), null);
  assert.equal(extractRoute(""), null);
  assert.equal(extractRoute(null), null);
});

test("envolver appends ellipsis when text wraps past maxLinhas", async () => {
  const { wrapText } = await import("../assets/poster.js");
  const ctx = {
    measureText: (str) => ({ width: str.length * 10 }),
  };
  const text = "primeira linha aqui segunda linha aqui terceira linha ali";
  const lines2 = wrapText(ctx, text, 200, 2);
  assert.equal(lines2.length, 2);
  assert.ok(lines2[1].endsWith("…"), "last line must end with ellipsis when truncated");

  const lines3 = wrapText(ctx, text, 200, 3);
  assert.equal(lines3.length, 3);
  assert.ok(!lines3[2].endsWith("…"), "3 lines fit without ellipsis");
});
