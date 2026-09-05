import test from "node:test";
import assert from "node:assert/strict";
import {
  ALFABETO,
  UE_PARA_UF,
  MODELOS,
  TIPOS,
  DOMINIO,
  codificar,
  decodificar,
  ufDoSq,
  montarUrl,
  textoLink,
  extrairRota,
} from "../assets/elo.js";

const SQ_SP = 250002541303;
const SQ_AC = 10002532416;
const SQ_BR = 280002542548;

test("ufDoSq maps correct UFs", () => {
  assert.equal(ufDoSq(SQ_SP), "SP");
  assert.equal(ufDoSq(SQ_AC), "AC");
  assert.equal(ufDoSq(SQ_BR), "BR");
  assert.equal(ufDoSq(990000000000), undefined);
});

test("tipo C (candidato) round-trip and length", () => {
  const post = {
    tipo: "candidato",
    modelo: "cabine",
    sq: SQ_SP,
    motivos: [0, 2, 5, 7],
  };
  const id = codificar(post);
  assert.equal(id.length, 9, "C with motivos [0,2,5,7] must be 9 chars");
  assert.equal(id[0], "C");

  const dec = decodificar(id);
  assert.deepEqual(dec, {
    tipo: "candidato",
    modelo: "cabine",
    sq: SQ_SP,
    motivos: [0, 2, 5, 7],
  });
});

test("tipo C with no motivos", () => {
  const post = { tipo: "candidato", modelo: "cedula", sq: SQ_AC, motivos: [] };
  const id = codificar(post);
  assert.equal(id.length, 9);
  const dec = decodificar(id);
  assert.deepEqual(dec, {
    tipo: "candidato",
    modelo: "cedula",
    sq: SQ_AC,
    motivos: [],
  });
});

test("tipo D (duelo) round-trip and length", () => {
  const post = {
    tipo: "duelo",
    modelo: "cedula",
    nao: SQ_SP,
    sim: SQ_AC,
  };
  const id = codificar(post);
  assert.equal(id.length, 12);
  assert.equal(id[0], "D");

  const dec = decodificar(id);
  assert.deepEqual(dec, {
    tipo: "duelo",
    modelo: "cedula",
    nao: SQ_SP,
    sim: SQ_AC,
  });
});

test("tipo P (pauta) round-trip", () => {
  const post = {
    tipo: "pauta",
    modelo: "cabine",
    eixo: 3,
    faces: [SQ_SP, SQ_AC, SQ_BR],
  };
  const id = codificar(post);
  assert.equal(id[0], "P");

  const dec = decodificar(id);
  assert.deepEqual(dec, {
    tipo: "pauta",
    modelo: "cabine",
    eixo: 3,
    faces: [SQ_SP, SQ_AC, SQ_BR],
  });
});

test("tipo L (lista) with 9 faces gives 51 chars and round-trips", () => {
  const faces = [
    SQ_SP, SQ_AC, SQ_BR,
    SQ_SP, SQ_AC, SQ_BR,
    SQ_SP, SQ_AC, SQ_BR,
  ];
  const post = {
    tipo: "lista",
    modelo: "cabine",
    faces,
  };
  const id = codificar(post);
  assert.equal(id.length, 51, "L with 9 faces gives 51 chars");
  assert.equal(id[0], "L");

  const dec = decodificar(id);
  assert.deepEqual(dec, {
    tipo: "lista",
    modelo: "cabine",
    faces,
  });
});

test("decodificar validation and error cases", () => {
  assert.equal(decodificar("Z000"), null, "unknown tipo letter Z is null");
  assert.equal(decodificar(""), null);
  assert.equal(decodificar("C"), null);

  const validC = codificar({
    tipo: "candidato",
    modelo: "cabine",
    sq: SQ_SP,
    motivos: [0, 2],
  });
  assert.equal(decodificar(validC + "1"), null, "C id with trailing char is null");

  // Lowercase and Crockford normalization (O -> 0, I/L -> 1)
  const canonicalDec = decodificar(validC);
  const lowerId = validC.toLowerCase();
  assert.deepEqual(decodificar(lowerId), canonicalDec);

  // If we replace characters with O or I or L where valid:
  const idWithO = validC.replace(/0/g, "O");
  const idWithI = validC.replace(/1/g, "I");
  const idWithL = validC.replace(/1/g, "L");
  assert.deepEqual(decodificar(idWithO), canonicalDec);
  assert.deepEqual(decodificar(idWithI), canonicalDec);
  assert.deepEqual(decodificar(idWithL), canonicalDec);
});

test("codificar bounds checks", () => {
  assert.throws(
    () => codificar({ tipo: "candidato", modelo: "cabine", sq: SQ_SP, motivos: [0, 1, 2, 3, 4] }),
    RangeError,
  );
  assert.throws(
    () => codificar({ tipo: "lista", modelo: "cabine", faces: [] }),
    RangeError,
  );
  assert.throws(
    () => codificar({ tipo: "lista", modelo: "cabine", faces: Array(10).fill(SQ_SP) }),
    RangeError,
  );
  assert.throws(
    () => codificar({ tipo: "candidato", modelo: "cabine", sq: 990000000000 }),
    RangeError,
  );
});

test("montarUrl and textoLink", () => {
  assert.equal(
    montarUrl("nao", "C01234567"),
    "https://votosecreto.com.br/#/nao/C01234567",
  );
  assert.equal(
    textoLink("voto", "C01234567"),
    "votosecreto.com.br/#/voto/C01234567",
  );
});

test("extrairRota parses URLs and pasted texts", () => {
  assert.deepEqual(
    extrairRota("Veja https://votosecreto.com.br/#/nao/C0ABCDEF1 agora"),
    { postura: "nao", id: "C0ABCDEF1" },
  );
  assert.deepEqual(
    extrairRota("votosecreto.com.br/#/voto/D0123456789A"),
    { postura: "voto", id: "D0123456789A" },
  );
  assert.deepEqual(
    extrairRota("https://votosecreto.com.br/#/ficha/250002541303"),
    { sq: 250002541303 },
  );
  assert.equal(extrairRota("https://example.com/outra-coisa"), null);
  assert.equal(extrairRota(""), null);
  assert.equal(extrairRota(null), null);
});
