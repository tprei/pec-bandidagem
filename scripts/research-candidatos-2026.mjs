import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import lockfile from "proper-lockfile";
import Ajv from "ajv";
import { CACHE_DIR, beginRun, claimJob, closeState, ensureJob, findOpenRemote, getJob, listRecords, migrateLegacy, openState, recoverUncertain, releaseJob, reserveBudget, retryJob, runCosts, runState, saveResult, saveSources, settleBudget, stableHash, status as stateStatus, updateRequest, upsertRequest } from "./research/state.mjs";
import { braveContext, braveNews, exaSearch, makeExa, mergeSources, perplexityPoll, perplexitySubmit, ProviderError } from "./research/providers.mjs";
import { idle, queues, request } from "./research/scheduler.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const RUBRIC = JSON.parse(readFileSync(join(DATA, "curadoria.json"), "utf8")).pesquisa;
const ROSTER = JSON.parse(readFileSync(join(DATA, "candidatos-2026.json"), "utf8"));
const SCHEMA_VERSION = 2;
const MODEL = process.env.PERPLEXITY_MODEL ?? "openai/gpt-5.6-sol";
const ACTION_TYPES = ["voto", "legislacao", "politica_publica", "gestao_publica", "obra_publica", "declaracao", "licitacao_contrato", "corrupcao_improbidade", "processo_investigacao", "conflito_interesses_familia", "conduta_pessoal"];
const ROLES = ["autor", "coautor", "votou", "sancionou", "regulamentou", "executou", "administrou", "financiou", "anunciou", "defendeu", "beneficiario", "alvo_de_apuracao"];
const RESULTS = ["proposto", "aprovado", "implementado", "concluido", "revertido", "suspenso", "nao_realizado", "em_apuracao", "nao_se_aplica"];
const SENSITIVE = new Set(["licitacao_contrato", "corrupcao_improbidade", "processo_investigacao", "conflito_interesses_familia", "conduta_pessoal"]);
let stopping = false;
let activeQueues = null;
let shutdownSignal = null;
let forceExitTimer = null;
function requestShutdown(signal, exitCode) {
  if (stopping) {
    if (!forceExitTimer) {
      forceExitTimer = setTimeout(() => { emit({ event: "watchdog_forced_exit", signal, segundos: 30 }); process.exit(exitCode); }, 30000);
      forceExitTimer.unref();
    }
    return;
  }
  stopping = true;
  process.exitCode = exitCode;
  shutdownSignal?.abort();
  emit({ event: "shutdown_requested", signal });
}
process.on("SIGINT", () => requestShutdown("SIGINT", 130));
process.on("SIGTERM", () => requestShutdown("SIGTERM", 143));

function json(path, fallback = null) { return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback; }
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function emit(event) { console.log(JSON.stringify({ ...event, em: new Date().toISOString() })); }
function sleep(ms, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); resolve(); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
function option(name, fallback = undefined) { return parsed.values[name] ?? fallback; }
function listOption(name) { const value = option(name); return value ? String(value).split(",").map((item) => item.trim()).filter(Boolean) : []; }
function identity(candidato) {
  const col = Object.fromEntries(ROSTER.colunas.map((name, index) => [name, index]));
  const cargo = ROSTER.dicionarios.cargo[candidato[col.cargo]];
  const [uf] = ROSTER.dicionarios.unidadeEleitoral[candidato[col.ue]];
  return { sq: candidato[col.sq], nome: candidato[col.nome], nomeUrna: candidato[col.nomeUrna], nascimento: candidato[col.nascimento], uf, cargo: cargo.nome, partido: ROSTER.dicionarios.partido[candidato[col.partido]].sigla, numero: candidato[col.numero], ocupacao: ROSTER.dicionarios.ocupacao[candidato[col.ocupacao]] };
}
function candidates() {
  return ROSTER.candidatos.map(identity).sort((a, b) => a.sq - b.sq).filter((candidate) => option("sq") === undefined || candidate.sq === Number(option("sq"))).filter((candidate) => option("uf") === undefined || candidate.uf === option("uf")).filter((candidate) => option("cargo") === undefined || candidate.cargo === ROSTER.dicionarios.cargo[option("cargo")]?.nome).slice(0, option("limit") === undefined ? Infinity : Number(option("limit")));
}
function actionSchema() {
  const item = { type: "object", additionalProperties: false, properties: { titulo: { type: "string", minLength: 1 }, fato: { type: "string", minLength: 1 }, trecho: { type: "string", minLength: 1 }, leituraEditorial: { type: "string", minLength: 1 }, contexto: { type: "string", minLength: 1 }, ocorridoEm: { anyOf: [{ type: "string" }, { type: "null" }] }, tipo: { type: "string", enum: ACTION_TYPES }, conflito: { type: "string", enum: ["confirmado", "contestado", "inconclusivo"] }, papel: { type: "object", additionalProperties: false, properties: { tipo: { type: "string", enum: ROLES }, descricao: { type: "string", minLength: 1 } }, required: ["tipo", "descricao"] }, resultado: { type: "object", additionalProperties: false, properties: { estado: { type: "string", enum: RESULTS }, descricao: { type: "string", minLength: 1 } }, required: ["estado", "descricao"] }, referenciasFontes: { type: "array", items: { type: "string", pattern: "^src:[0-9]+$" } } }, required: ["titulo", "fato", "trecho", "leituraEditorial", "contexto", "ocorridoEm", "tipo", "conflito", "papel", "resultado", "referenciasFontes"] };
  return { type: "object", additionalProperties: false, properties: { identidadeConfirmada: { type: "boolean" }, justificativaIdentidade: { type: "string" }, favoraveis: { type: "array", maxItems: 5, items: item }, desfavoraveis: { type: "array", maxItems: 5, items: item }, followUps: { type: "array", maxItems: 2, items: { type: "object", additionalProperties: false, properties: { lado: { type: "string" }, tema: { type: "string" }, tipo: { type: "string", enum: ["oficial", "noticia", "semantica"] }, consulta: { type: "string" } }, required: ["lado", "tema", "tipo", "consulta"] } } }, required: ["identidadeConfirmada", "justificativaIdentidade", "favoraveis", "desfavoraveis", "followUps"] };
}
function prompt(candidate, sources, round) { return `Pesquise e classifique a vida pública inteira desta candidatura brasileira. Esta é a rodada ${round} de no máximo 2.\nIDENTIDADE: ${JSON.stringify(candidate)}\nRUBRICA EDITORIAL: ${JSON.stringify(RUBRIC)}\nFONTES REGISTRADAS: ${JSON.stringify(sources.map(({ id, title, url, publishedAt, excerpt, oficial }) => ({ id, title, url, publishedAt, excerpt, oficial })))}\nRetorne apenas JSON. Use somente IDs src:n presentes nas fontes. Fato e trecho devem ser verificáveis; nunca transforme acusação em fato: preserve conflito e estado processual. Se a identidade não for inequívoca, identidadeConfirmada=false e arrays vazios. Se houver menos de cinco ações defensáveis, retorne menos. FollowUps deve conter apenas lacunas que realmente precisem de nova busca.`; }
function modelText(response) {
  const textos = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value.type === "output_text" && typeof value.text === "string") textos.push(value.text);
    Object.values(value).forEach(visit);
  };
  visit(response.output);
  return textos.join("\n");
}
function responseSources(response, candidate, inputHash) {
  const sources = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value.url === "string" && typeof value.title === "string") sources.push({ sq: candidate.sq, inputHash, url: value.url, title: value.title, publishedAt: value.date ?? value.publishedDate ?? null, retrievedAt: new Date().toISOString(), excerpt: value.snippet ?? value.description ?? "", providers: [{ provider: "perplexity-legacy", requestKey: response.id }], oficial: /\.(gov|leg|jus|mp|def)\.br$/.test(new URL(value.url).hostname) });
    Object.values(value).forEach(visit);
  };
  visit(response);
  return [...new Map(sources.map((source) => [source.url, source])).values()].map((source, index) => ({ ...source, id: `src:${index + 1}` }));
}
function normalizeOutput(text, sources, candidate, response) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { identidadeConfirmada: false, justificativaIdentidade: "JSON inválido", favoraveis: [], desfavoraveis: [], followUps: [] }; }
  const validator = new Ajv({ allErrors: true }).compile(actionSchema());
  if (!validator(parsed) || !parsed.identidadeConfirmada) return { sq: candidate.sq, identidade: candidate, estado: "insuficiente", cobertura: { favoraveis: "insuficiente", desfavoraveis: "insuficiente" }, favoraveis: [], desfavoraveis: [], execucao: { schema: SCHEMA_VERSION, modelo: response.model ?? MODEL, responseId: response.id, justificativaIdentidade: parsed.justificativaIdentidade ?? null } };
  const normalize = (item, polarity) => {
    const refs = item.referenciasFontes.map((ref) => sources.find((source) => source.id === ref)).filter(Boolean);
    if (!refs.length) return null;
    const urls = refs.map((source) => source.url).sort();
    return { id: hash({ candidate: candidate.sq, polarity, fato: item.fato, papel: item.papel, resultado: item.resultado, urls }), polaridade: polarity, ...item, fontes: refs.map(({ id, title, url, publishedAt, retrievedAt, oficial, providers }) => ({ id, titulo: title, url, dominio: new URL(url).hostname.toLowerCase().replace(/^www\./, ""), publicadoEm: publishedAt, acessadoEm: retrievedAt, tipo: oficial ? "oficial" : "secundaria", provedores: providers })) };
  };
  const favoraveis = parsed.favoraveis.map((item) => normalize(item, "favoravel")).filter(Boolean).slice(0, 5);
  const desfavoraveis = parsed.desfavoraveis.map((item) => normalize(item, "desfavoravel")).filter(Boolean).slice(0, 5);
  return { sq: candidate.sq, identidade: candidate, estado: favoraveis.length || desfavoraveis.length ? "concluida" : "insuficiente", cobertura: { favoraveis: favoraveis.length === 5 ? "completa" : "insuficiente", desfavoraveis: desfavoraveis.length === 5 ? "completa" : "insuficiente" }, favoraveis, desfavoraveis, followUps: parsed.followUps, execucao: { schema: SCHEMA_VERSION, modelo: response.model ?? MODEL, responseId: response.id, pesquisadoEm: new Date().toISOString() } };
}
async function discover(candidate, inputHash, selectedProviders, queuesByProvider, signal) {
  const query = `${candidate.nomeUrna} ${candidate.nome}, ${candidate.cargo}, ${candidate.uf}, ${candidate.partido}, ${candidate.nascimento} direitos trabalhistas obras públicas privatização corrupção investigação família`;
  const jobs = [];
  if (selectedProviders.includes("exa")) { const key = hash({ provider: "exa", operation: "search", query, inputHash }); jobs.push(request(queuesByProvider.exaSearch, () => exaSearch(makeExa(), query, inputHash, candidate.sq, key, signal), { signal }).then((result) => ({ ...result, key })).catch((error) => ({ error, provider: "exa", key }))); }
  if (selectedProviders.includes("brave")) { const key = hash({ provider: "brave", operation: "context", query, inputHash }); jobs.push(request(queuesByProvider.brave, () => braveContext(query, inputHash, candidate.sq, key, signal), { signal }).then((result) => ({ ...result, key })).catch((error) => ({ error, provider: "brave", key }))); }
  const results = await Promise.all(jobs);
  for (const result of results) emit({ event: "discovery", provider: result.provider, sources: result.error ? 0 : result.sources.length, erro: result.error?.message ?? null });
  return { query, results, sources: mergeSources(results.filter((result) => !result.error).map((result) => result.sources)) };
}
async function followUpSources(followUps, candidate, inputHash, selectedProviders, queuesByProvider, signal) {
  const jobs = followUps.map((followUp) => {
    const query = `${candidate.nomeUrna} ${followUp.consulta}`;
    const provider = followUp.tipo === "noticia" && selectedProviders.includes("brave") ? "brave" : selectedProviders[0];
    const key = hash({ provider, operation: followUp.tipo, query, inputHash, round: 2 });
    const operation = provider === "brave" && followUp.tipo === "noticia"
      ? () => braveNews(query, inputHash, candidate.sq, key, "", signal)
      : provider === "brave"
        ? () => braveContext(query, inputHash, candidate.sq, key, signal)
        : () => exaSearch(makeExa(), query, inputHash, candidate.sq, key, signal);
    return request(provider === "brave" ? queuesByProvider.brave : queuesByProvider.exaSearch, operation, { signal }).catch((error) => ({ error }));
  });
  const results = await Promise.all(jobs);
  return mergeSources(results.filter((result) => !result.error).map((result) => result.sources));
}
async function processCandidate(db, candidate, configHash, selectedProviders, queuesByProvider, maxRounds, runId, budgetLimit, signal) {
  const current = getJob(db, candidate.sq, configHash);
  if (!option("refresh") && current && ["complete", "insufficient"].includes(current.status)) return "cached";
  ensureJob(db, candidate.sq, configHash);
  if (!claimJob(db, candidate.sq, configHash, `${process.pid}`, "discovering")) return "pending";
  const open = findOpenRemote(db, candidate.sq, configHash);
  let response;
  let registry = [];
  let reserved = 0;
  let requestKey = open?.request_key;
  let remoteId = open?.remote_id ?? null;
  try {
    if (open) {
      emit({ event: "resume_poll", sq: candidate.sq, responseId: open.remote_id, requestKey });
      releaseJob(db, candidate.sq, configHash, "synthesis_polling");
      response = await pollWithRetry(queuesByProvider.perplexity, open.remote_id, signal, requestKey, db);
      updateRequest(db, requestKey, { status: "completed", response_json: response, actual_cost_usd: response.usage?.cost?.total_cost ?? null });
      registry = responseSources(response, candidate, configHash);
    } else {
      const discovery = await discover(candidate, configHash, selectedProviders, queuesByProvider, signal);
      registry = discovery.sources;
      for (const source of registry) saveSources(db, [source]);
      if (!registry.length) throw new ProviderError("nenhuma fonte encontrada", { provider: selectedProviders.join(","), retryable: true });
      releaseJob(db, candidate.sq, configHash, "pending_synthesis");
      reserved = 0.225;
      if (!reserveBudget(db, runId, reserved, budgetLimit)) {
        releaseJob(db, candidate.sq, configHash, "pending_discovery");
        return "pending";
      }
      const payload = prompt(candidate, registry, 1);
      requestKey = hash({ provider: "perplexity", operation: "synthesis", payload, configHash, round: 1, maxRounds });
      const saved = upsertRequest(db, { requestKey, sq: candidate.sq, inputHash: configHash, provider: "perplexity", operation: "synthesis", payload, status: "pending", reservedCost: reserved });
      if (saved.status === "blocked_uncertain" || (saved.status === "pending" && saved.attempt_count > 0 && !saved.remote_id)) {
        releaseJob(db, candidate.sq, configHash, "blocked_uncertain");
        return "pending";
      }
      if (saved.status === "completed" && saved.response_json) response = JSON.parse(saved.response_json);
      else {
        const submitted = await request(queuesByProvider.perplexity, () => perplexitySubmit(payload, actionSchema(), requestKey, signal), { signal });
        remoteId = submitted.id;
        updateRequest(db, requestKey, { status: "synthesis_polling", remote_id: submitted.id, attempt_count: saved.attempt_count + 1 });
        releaseJob(db, candidate.sq, configHash, "synthesis_polling");
        emit({ event: "submitted", sq: candidate.sq, responseId: submitted.id, requestKey });
        response = await pollWithRetry(queuesByProvider.perplexity, submitted.id, signal, requestKey, db);
      }
      updateRequest(db, requestKey, { status: "completed", response_json: response, actual_cost_usd: response.usage?.cost?.total_cost ?? null });
    }
    let record = normalizeOutput(response.output_text ?? modelText(response), registry, candidate, response);
    if (open && !record.favoraveis.length && !record.desfavoraveis.length) {
      const shard = (candidate.sq % 256).toString(16).padStart(2, "0");
      const previous = json(join(ROOT, "data", "dex", "pesquisa", `${shard}.json`))?.candidatos?.[String(candidate.sq)];
      if (previous && (previous.favoraveis?.length || previous.desfavoraveis?.length)) {
        record = { ...previous, identidade: candidate, execucao: { schema: SCHEMA_VERSION, modelo: response.model ?? MODEL, responseId: response.id, recuperadoDe: "projecao-anterior" } };
      }
    }
    if (maxRounds === 2 && record.followUps?.length) {
      const extra = await followUpSources(record.followUps, candidate, configHash, selectedProviders, queuesByProvider, signal);
      if (extra.length && reserveBudget(db, runId, 0.225, budgetLimit)) {
        registry = mergeSources([registry, extra]);
        const payload = prompt(candidate, registry, 2);
        const round2Key = hash({ provider: "perplexity", operation: "synthesis", payload, configHash, round: 2 });
        const saved = upsertRequest(db, { requestKey: round2Key, sq: candidate.sq, inputHash: configHash, provider: "perplexity", operation: "synthesis", payload, status: "pending", reservedCost: 0.225 });
        if (saved.status === "completed" && saved.response_json) response = JSON.parse(saved.response_json);
        else if (saved.status === "synthesis_polling" && saved.remote_id) {
          remoteId = saved.remote_id;
          releaseJob(db, candidate.sq, configHash, "synthesis_polling");
          emit({ event: "resume_poll", sq: candidate.sq, responseId: saved.remote_id, requestKey: round2Key, search_round: 2 });
          response = await pollWithRetry(queuesByProvider.perplexity, saved.remote_id, signal, round2Key, db);
          updateRequest(db, round2Key, { status: "completed", response_json: response, actual_cost_usd: response.usage?.cost?.total_cost ?? null });
        } else if (saved.status === "blocked_uncertain" || (saved.status === "pending" && (saved.attempt_count > 0 || Date.now() - Date.parse(saved.created_at) > 60_000) && !saved.remote_id)) {
          releaseJob(db, candidate.sq, configHash, "blocked_uncertain");
          return "pending";
        } else {
          const submitted = await request(queuesByProvider.perplexity, () => perplexitySubmit(payload, actionSchema(), round2Key, signal), { signal });
          remoteId = submitted.id;
          updateRequest(db, round2Key, { status: "synthesis_polling", remote_id: submitted.id, attempt_count: saved.attempt_count + 1 });
          releaseJob(db, candidate.sq, configHash, "synthesis_polling");
          emit({ event: "submitted", sq: candidate.sq, responseId: submitted.id, requestKey: round2Key, search_round: 2 });
          response = await pollWithRetry(queuesByProvider.perplexity, submitted.id, signal, round2Key, db);
          updateRequest(db, round2Key, { status: "completed", response_json: response, actual_cost_usd: response.usage?.cost?.total_cost ?? null });
        }
        record = normalizeOutput(response.output_text ?? modelText(response), registry, candidate, response);
        reserved += 0.225;
      }
    }
    saveResult(db, { resultId: hash({ sq: candidate.sq, inputHash: configHash, responseId: response.id }), sq: candidate.sq, inputHash: configHash, state: record.estado === "concluida" ? "complete" : "insufficient", record });
    if (reserved) settleBudget(db, runId, reserved, response.usage?.cost?.total_cost ?? null);
    emit({ event: "completed", sq: candidate.sq, responseId: response.id, status: record.estado, favoraveis: record.favoraveis.length, desfavoraveis: record.desfavoraveis.length });
    return record.estado === "concluida" ? "complete" : "insufficient";
  } catch (error) {
    if (signal.aborted || stopping) {
      releaseJob(db, candidate.sq, configHash, remoteId ? "synthesis_polling" : "pending_discovery");
      throw error;
    }
    const permanent = error instanceof ProviderError && !error.retryable && !error.uncertain;
    releaseJob(db, candidate.sq, configHash, permanent ? "permanent_error" : error.uncertain ? "blocked_uncertain" : "retryable", error.retryAfterMs ? new Date(Date.now() + error.retryAfterMs).toISOString() : null, { message: error.message, provider: error.provider ?? null, status: error.status ?? null });
    if (reserved && permanent) settleBudget(db, runId, reserved, null);
    throw error;
  }
}
async function pollWithRetry(queue, id, signal, requestKey, db) {
  let wait = 5000;
  while (true) {
    const response = await request(queue, () => perplexityPoll(id, signal), { signal });
    if (response.status === "completed") return response;
    if (["failed", "cancelled", "incomplete"].includes(response.status)) {
      if (requestKey) updateRequest(db, requestKey, { status: response.status, response_json: response, error_json: { status: response.status } });
      throw new ProviderError(`Perplexity terminou com status ${response.status}`, { provider: "perplexity", status: response.status, retryable: false });
    }
    await sleep(wait, signal);
    if (signal?.aborted) throw new ProviderError("interrompido", { provider: "perplexity", uncertain: true });
    wait = Math.min(30000, wait * 2);
  }
}
function project(db) {
  const byUf = new Map();
  for (const row of listRecords(db)) {
    const record = row.record;
    for (const item of [...record.favoraveis, ...record.desfavoraveis]) for (const fonte of item.fontes) fonte.dominio ??= new URL(fonte.url).hostname.toLowerCase().replace(/^www\./, "");
    const uf = record.identidade.uf;
    if (!byUf.has(uf)) byUf.set(uf, []);
    byUf.get(uf).push(record);
  }
  const output = join(ROOT, "data", "pesquisa-candidatos-2026");
  mkdirSync(output, { recursive: true });
  for (const [uf, records] of byUf) {
    records.sort((a, b) => a.sq - b.sq);
    const path = join(output, `${uf}.json`);
    const temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify({ schema: SCHEMA_VERSION, rubrica: RUBRIC.id, geradoEm: new Date().toISOString(), candidatos: records }, null, 2)}\n`);
    renameSync(temp, path);
  }
}
async function pesquisar() {
  if (!process.env.PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY ausente");
  const braveKey = process.env.BRAVE_SEARCH_API_KEY ?? process.env.BRAVE_API_KEY;
  const requestedProviders = listOption("search-providers");
  const providers = requestedProviders.length > 0 && !requestedProviders.includes("auto") ? requestedProviders : [process.env.EXA_API_KEY ? "exa" : null, braveKey ? "brave" : null].filter(Boolean);
  if (providers.some((provider) => !["exa", "brave"].includes(provider))) throw new Error(`provedor de busca desconhecido: ${providers.join(",")}`);
  if (!providers.length) throw new Error("configure EXA_API_KEY ou BRAVE_SEARCH_API_KEY/BRAVE_API_KEY");
  const maxRounds = Number(option("max-search-rounds", 2));
  if (![1, 2].includes(maxRounds)) throw new Error("--max-search-rounds deve ser 1 ou 2");
  const budgetLimit = Number(option("max-cost-usd"));
  if (!Number.isFinite(budgetLimit) || budgetLimit <= 0) throw new Error("--max-cost-usd deve ser positivo");
  mkdirSync(CACHE_DIR, { recursive: true });
  let release = null;
  let db = null;
  let progressTimer = null;
  const controller = new AbortController();
  shutdownSignal = controller;
  try {
    release = await lockfile.lock(join(CACHE_DIR, "run"), { realpath: false, stale: 60000, update: 20000, retries: 0 });
    db = openState();
    migrateLegacy(db);
    const queuesByProvider = queues();
    activeQueues = queuesByProvider;
    const selected = candidates();
    const configBase = { rubric: RUBRIC, schema: actionSchema(), providers, model: MODEL, adapter: "providers-v2", maxRounds };
    const runId = stableHash({ configBase, pid: process.pid, started: new Date().toISOString() });
    beginRun(db, runId);
    const selectedState = selected.map((candidate) => {
      const inputHash = stableHash({ ...configBase, candidate });
      return { sq: candidate.sq, inputHash, before: Boolean(getJob(db, candidate.sq, inputHash)?.status && ["complete", "insufficient"].includes(getJob(db, candidate.sq, inputHash).status)) };
    });
    const progress = () => {
      const state = runState(db, selectedState);
      const terminal = state.newly_complete + state.newly_insufficient;
      const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
      emit({ event: "progress", ...state, eta_seconds: terminal >= 5 ? Math.ceil(state.remaining / (terminal / elapsed)) : null });
    };
    const startedAt = Date.now();
    progressTimer = setInterval(progress, 30000);
    progressTimer.unref();
    let next = 0;
    let failedThisRun = 0;
    const workerCount = Math.max(1, Number(option("candidate-concurrency", option("concurrency", 8))));
    const workers = Array.from({ length: workerCount }, async () => {
      while (next < selected.length && !stopping && !controller.signal.aborted) {
        const candidate = selected[next++];
        const inputHash = stableHash({ ...configBase, candidate });
        try { await processCandidate(db, candidate, inputHash, providers, queuesByProvider, maxRounds, runId, budgetLimit, controller.signal); }
        catch (error) {
          if (stopping || controller.signal.aborted) return;
          failedThisRun += 1;
          emit({ event: error.message === "budget_exhausted" ? "budget_exhausted" : "retryable", sq: candidate.sq, provider: error.provider ?? null, status: error.status ?? null, erro: error.message });
        }
      }
    });
    await Promise.all(workers);
    await idle(queuesByProvider);
    progress();
    const costs = runCosts(db, runId);
    if (!stopping) {
      project(db);
      const state = runState(db, selectedState);
      const terminal = state.newly_complete + state.newly_insufficient;
      const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
      emit({ event: "finished", selected: state.selected, cached: state.cached_before_run, completed_this_run: state.newly_complete, insufficient_this_run: state.newly_insufficient, failed_this_run: failedThisRun, polling: state.synthesis_polling, pending: state.pending + state.in_flight, remaining: state.remaining, interrupted: false, actual_cost_usd: costs.actual_cost_usd, reserved_cost_usd: costs.reserved_cost_usd, eta_seconds: terminal >= 5 ? Math.ceil(state.remaining / (terminal / elapsed)) : null });
    } else {
      const state = runState(db, selectedState);
      emit({ event: "interrupted", selected: state.selected, cached: state.cached_before_run, completed_this_run: state.newly_complete, insufficient_this_run: state.newly_insufficient, failed_this_run: failedThisRun, polling: state.synthesis_polling, pending: state.pending + state.in_flight, remaining: state.remaining, interrupted: true, actual_cost_usd: costs.actual_cost_usd, reserved_cost_usd: costs.reserved_cost_usd, eta_seconds: null });
    }
  } finally {
    clearInterval(progressTimer);
    activeQueues = null;
    try { if (release) await release(); } finally { try { if (db) closeState(db); } finally { clearTimeout(forceExitTimer); forceExitTimer = null; } }
  }
}
async function reviewCommand() {
  const reviewer = option("reviewer");
  if (!reviewer) throw new Error("--reviewer é obrigatório");
  const db = openState();
  const path = join(DATA, "pesquisa-candidatos-2026", "revisoes.json");
  const reviews = json(path, { schema: 1, decisoes: {} });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const records = listRecords(db, option("sq") === undefined ? null : Number(option("sq")));
    for (const row of records) {
      for (const item of [...row.record.favoraveis, ...row.record.desfavoraveis]) {
        if (!SENSITIVE.has(item.tipo) && item.conflito === "confirmado") continue;
        if (reviews.decisoes[item.id]?.estado === "aprovada" || reviews.decisoes[item.id]?.estado === "rejeitada") continue;
        console.log(`\n${row.record.identidade.nomeUrna} — ${item.polaridade} — ${item.titulo}\n${item.fato}\n${item.trecho}\n${item.fontes.map((fonte) => `${fonte.titulo} — ${fonte.url}`).join("\n")}`);
        const choice = (await rl.question("[a]provar [r]ejeitar [p]ostergar [q]sair: ")).trim().toLowerCase();
        if (choice === "q") return;
        if (!["a", "r", "p"].includes(choice)) continue;
        reviews.decisoes[item.id] = { estado: choice === "a" ? "aprovada" : choice === "r" ? "rejeitada" : "postergada", revisor: reviewer, decididoEm: new Date().toISOString() };
        mkdirSync(join(DATA, "pesquisa-candidatos-2026"), { recursive: true });
        const temp = `${path}.${process.pid}.tmp`;
        writeFileSync(temp, `${JSON.stringify(reviews, null, 2)}\n`);
        renameSync(temp, path);
      }
    }
  } finally {
    rl.close();
    closeState(db);
  }
}
function statusCommand() { const db = openState(); try { console.log(JSON.stringify(stateStatus(db, option("sq") === undefined ? null : Number(option("sq"))), null, 2)); } finally { closeState(db); } }
function migrateCommand() { const db = openState(); try { migrateLegacy(db); emit({ event: "migrated" }); } finally { closeState(db); } }
function retryCommand() { const db = openState(); const release = lockfile.lockSync(join(CACHE_DIR, "run"), { realpath: false, stale: 60000, update: 20000, retries: 0 }); try { const count = retryJob(db, Number(option("sq"))); emit({ event: "retry_queued", sq: Number(option("sq")), count }); } finally { release(); closeState(db); } }
function recoverCommand() { if (!parsed.values["resubmit-uncertain"]) throw new Error("--resubmit-uncertain é obrigatório"); const db = openState(); const release = lockfile.lockSync(join(CACHE_DIR, "run"), { realpath: false, stale: 60000, update: 20000, retries: 0 }); try { const count = recoverUncertain(db, Number(option("sq"))); emit({ event: "uncertain_recovered", sq: Number(option("sq")), count }); } finally { release(); closeState(db); } }
const parsed = parseArgs({ options: { sq: { type: "string" }, uf: { type: "string" }, cargo: { type: "string" }, limit: { type: "string" }, refresh: { type: "string" }, concurrency: { type: "string" }, "search-providers": { type: "string" }, "candidate-concurrency": { type: "string" }, "max-search-rounds": { type: "string" }, "max-cost-usd": { type: "string" }, reviewer: { type: "string" }, "resubmit-uncertain": { type: "boolean", default: false } }, strict: false, allowPositionals: true });
const mode = parsed.positionals[0] ?? "pesquisar";
if (mode === "pesquisar") await pesquisar();
else if (mode === "status") statusCommand();
else if (mode === "revisar") await reviewCommand();
else if (mode === "retry") retryCommand();
else if (mode === "recover") recoverCommand();
else throw new Error(`modo ainda não implementado: ${mode}`);
