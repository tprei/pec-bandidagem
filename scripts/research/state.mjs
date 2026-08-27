import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";

export const CACHE_DIR = join(dirname(new URL(import.meta.url).pathname), "../../.cache/pesquisa-candidatos-2026");
export const DB_PATH = join(CACHE_DIR, "state.sqlite");
export const SCHEMA_VERSION = 1;

function now() { return new Date().toISOString(); }
function sha(value) { return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
function exists(path) { return existsSync(path); }

export function openState() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH, { timeout: 5000 });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS candidate_jobs (sq INTEGER NOT NULL, input_hash TEXT NOT NULL, status TEXT NOT NULL, search_round INTEGER NOT NULL DEFAULT 0, lease_owner TEXT, lease_expires_at TEXT, next_attempt_at TEXT, active_result_id TEXT, error_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (sq, input_hash));
CREATE TABLE IF NOT EXISTS provider_requests (request_key TEXT PRIMARY KEY, sq INTEGER NOT NULL, input_hash TEXT NOT NULL, provider TEXT NOT NULL, operation TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL, remote_id TEXT, response_json TEXT, headers_json TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, reserved_cost_usd REAL NOT NULL DEFAULT 0, actual_cost_usd REAL, error_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources (source_id TEXT PRIMARY KEY, sq INTEGER NOT NULL, input_hash TEXT NOT NULL, canonical_url TEXT NOT NULL, title TEXT NOT NULL, published_at TEXT, retrieved_at TEXT NOT NULL, excerpt TEXT NOT NULL, providers_json TEXT NOT NULL, raw_json TEXT NOT NULL, UNIQUE (sq, input_hash, canonical_url));
CREATE TABLE IF NOT EXISTS results (result_id TEXT PRIMARY KEY, sq INTEGER NOT NULL, input_hash TEXT NOT NULL, state TEXT NOT NULL, record_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (run_id TEXT PRIMARY KEY, actual_cost_usd REAL NOT NULL DEFAULT 0, estimated_cost_usd REAL NOT NULL DEFAULT 0, reserved_cost_usd REAL NOT NULL DEFAULT 0, unknown_cost_usd REAL NOT NULL DEFAULT 0, summary_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS imports (path TEXT PRIMARY KEY, sha256 TEXT NOT NULL, imported_at TEXT NOT NULL);`);
  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('schema', ?)").run(String(SCHEMA_VERSION));
  return db;
}

export function closeState(db) { db.close(); }

export function migrateLegacy(db) {
  const files = exists(CACHE_DIR) ? readdirSync(CACHE_DIR).filter((name) => name.endsWith(".jsonl")) : [];
  for (const file of files) {
    const path = join(CACHE_DIR, file);
    const content = readFileSync(path, "utf8");
    const digest = sha(content);
    if (db.prepare("SELECT 1 FROM imports WHERE path = ? AND sha256 = ?").get(path, digest)) continue;
    let ordinal = 0;
    for (const line of content.split("\n")) {
      if (!line) continue;
      ordinal += 1;
      let value;
      try { value = JSON.parse(line); } catch { if (line === content.trimEnd().split("\n").at(-1)) continue; throw new Error(`JSONL inválido: ${path}:${ordinal}`); }
      if (!Number.isInteger(value.sq)) continue;
      const inputHash = value.inputHash ?? value.record?.execucao?.inputHash ?? "legacy";
      const timestamp = value.em ?? now();
      const status = value.event === "submitted" ? "synthesis_polling" : value.record ? (value.record.estado === "evidencia_insuficiente" ? "insufficient" : value.record.estado === "falhou" ? "permanent_error" : "complete") : value.event === "submission_uncertain" ? "blocked_uncertain" : "pending_synthesis";
      db.prepare("INSERT OR IGNORE INTO candidate_jobs(sq,input_hash,status,search_round,lease_owner,lease_expires_at,next_attempt_at,active_result_id,error_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(value.sq, inputHash, status, 0, null, null, timestamp, null, value.erro ? JSON.stringify({ message: value.erro }) : null, timestamp, timestamp);
      if (value.responseId) db.prepare("INSERT OR IGNORE INTO provider_requests(request_key,sq,input_hash,provider,operation,payload_json,status,remote_id,response_json,headers_json,attempt_count,next_attempt_at,reserved_cost_usd,actual_cost_usd,error_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?, ?)").run(`legacy:${value.sq}:${value.responseId}`, value.sq, inputHash, "perplexity", "synthesis", "{}", status, value.responseId, null, null, 0, timestamp, 0, null, null, timestamp, timestamp);
      if (value.record) db.prepare("INSERT OR IGNORE INTO results(result_id,sq,input_hash,state,record_json,created_at) VALUES(?,?,?,?,?,?)").run(`legacy:${value.sq}:${inputHash}`, value.sq, inputHash, status, JSON.stringify(value.record), timestamp);
    }
    db.prepare("INSERT INTO imports(path,sha256,imported_at) VALUES(?,?,?)").run(path, digest, now());
  }
}

export function ensureJob(db, sq, inputHash, status = "pending_discovery") {
  const stamp = now();
  db.prepare("INSERT OR IGNORE INTO candidate_jobs(sq,input_hash,status,created_at,updated_at) VALUES(?,?,?,?,?)").run(sq, inputHash, status, stamp, stamp);
}
export function getJob(db, sq, inputHash) { return db.prepare("SELECT * FROM candidate_jobs WHERE sq = ? AND input_hash = ?").get(sq, inputHash); }
export function findOpenRemote(db, sq, inputHash) { return db.prepare("SELECT * FROM provider_requests WHERE sq = ? AND input_hash = ? AND remote_id IS NOT NULL AND status IN ('synthesis_submitted','synthesis_polling','submitted') ORDER BY updated_at DESC LIMIT 1").get(sq, inputHash); }
export function claimJob(db, sq, inputHash, owner, status) {
  const lease = new Date(Date.now() + 600_000).toISOString();
  const result = db.prepare("UPDATE candidate_jobs SET status=?,lease_owner=?,lease_expires_at=?,updated_at=? WHERE sq=? AND input_hash=? AND (lease_expires_at IS NULL OR lease_expires_at < ? OR lease_owner=?)").run(status, owner, lease, now(), sq, inputHash, now(), owner);
  return result.changes === 1;
}
export function releaseJob(db, sq, inputHash, status, nextAttemptAt = null, error = null) { db.prepare("UPDATE candidate_jobs SET status=?,lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=?,error_json=?,updated_at=? WHERE sq=? AND input_hash=?").run(status, nextAttemptAt, error ? JSON.stringify(error) : null, now(), sq, inputHash); }
export function upsertRequest(db, request) {
  const stamp = now();
  db.prepare("INSERT OR IGNORE INTO provider_requests(request_key,sq,input_hash,provider,operation,payload_json,status,attempt_count,reserved_cost_usd,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(request.requestKey, request.sq, request.inputHash, request.provider, request.operation, JSON.stringify(request.payload), request.status ?? "pending", 0, request.reservedCost ?? 0, stamp, stamp);
  return db.prepare("SELECT * FROM provider_requests WHERE request_key = ?").get(request.requestKey);
}
export function updateRequest(db, requestKey, patch) {
  const fields = []; const values = [];
  for (const [key, value] of Object.entries(patch)) { fields.push(`${key}=?`); values.push(key.endsWith("_json") && value !== null ? JSON.stringify(value) : value); }
  fields.push("updated_at=?"); values.push(now(), requestKey);
  db.prepare(`UPDATE provider_requests SET ${fields.join(",")} WHERE request_key=?`).run(...values);
}
export function saveSources(db, sources) { for (const source of sources) db.prepare("INSERT OR REPLACE INTO sources(source_id,sq,input_hash,canonical_url,title,published_at,retrieved_at,excerpt,providers_json,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?)").run(`${source.sq}:${source.inputHash}:${source.id}`, source.sq, source.inputHash, source.url, source.title, source.publishedAt, source.retrievedAt, source.excerpt, JSON.stringify(source.providers), JSON.stringify(source.raw)); }
export function saveResult(db, result) { db.prepare("INSERT OR REPLACE INTO results(result_id,sq,input_hash,state,record_json,created_at) VALUES(?,?,?,?,?,?)").run(result.resultId, result.sq, result.inputHash, result.state, JSON.stringify(result.record), now()); db.prepare("UPDATE candidate_jobs SET status=?,active_result_id=?,lease_owner=NULL,lease_expires_at=NULL,updated_at=? WHERE sq=? AND input_hash=?").run(result.state, result.resultId, now(), result.sq, result.inputHash); }
export function listRecords(db, sq = null) { const filter = sq === null ? "" : "WHERE sq=?"; const args = sq === null ? [] : [sq]; const rows = db.prepare(`WITH latest AS (SELECT candidate_jobs.*,ROW_NUMBER() OVER (PARTITION BY candidate_jobs.sq ORDER BY candidate_jobs.updated_at DESC) AS rank FROM candidate_jobs ${filter}) SELECT results.* FROM results JOIN latest ON latest.active_result_id=results.result_id WHERE latest.rank=1 ORDER BY results.sq`).all(...args); return rows.map((row) => ({ ...row, record: JSON.parse(row.record_json) })); }
export function status(db, sq = null) { const jobs = sq === null ? db.prepare("SELECT * FROM candidate_jobs ORDER BY sq").all() : db.prepare("SELECT * FROM candidate_jobs WHERE sq=? ORDER BY input_hash").all(sq); return jobs.map((job) => ({ ...job, requests: db.prepare("SELECT request_key,provider,operation,status,remote_id,attempt_count,next_attempt_at,reserved_cost_usd,actual_cost_usd,error_json FROM provider_requests WHERE sq=? ORDER BY created_at").all(job.sq), results: db.prepare("SELECT result_id,state,created_at FROM results WHERE sq=? ORDER BY created_at").all(job.sq) })); }
export function runState(db, selected) {
  const counts = { selected: selected.length, cached_before_run: 0, newly_complete: 0, newly_insufficient: 0, retryable: 0, permanent_error: 0, synthesis_polling: 0, pending: 0, in_flight: 0 };
  for (const { sq, inputHash, before } of selected) {
    const job = getJob(db, sq, inputHash);
    if (before) counts.cached_before_run += 1;
    if (job?.status === "complete") {
      if (!before) counts.newly_complete += 1;
    } else if (job?.status === "insufficient") {
      if (!before) counts.newly_insufficient += 1;
    } else if (job?.status === "retryable") counts.retryable += 1;
    else if (job?.status === "permanent_error") counts.permanent_error += 1;
    else if (job?.status === "synthesis_polling") counts.synthesis_polling += 1;
    else if (job?.lease_owner) counts.in_flight += 1;
    else counts.pending += 1;
  }
  counts.remaining = counts.retryable + counts.permanent_error + counts.synthesis_polling + counts.pending + counts.in_flight;
  return counts;
}
export function runCosts(db, runId) { return db.prepare("SELECT actual_cost_usd,reserved_cost_usd FROM runs WHERE run_id=?").get(runId) ?? { actual_cost_usd: 0, reserved_cost_usd: 0 }; }
export function stableHash(value) { return sha(value); }
export function beginRun(db, runId) {
  db.prepare("INSERT OR IGNORE INTO runs(run_id,summary_json,created_at) VALUES(?,?,?)").run(runId, JSON.stringify({}), new Date().toISOString());
}
export function reserveBudget(db, runId, amount, limit) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT actual_cost_usd,estimated_cost_usd,reserved_cost_usd FROM runs WHERE run_id=?").get(runId);
    if (!row || row.actual_cost_usd + row.estimated_cost_usd + row.reserved_cost_usd + amount > limit) {
      db.exec("ROLLBACK");
      return false;
    }
    db.prepare("UPDATE runs SET reserved_cost_usd=reserved_cost_usd+? WHERE run_id=?").run(amount, runId);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function settleBudget(db, runId, reserved, actual = null) {
  const observed = Number.isFinite(actual) ? actual : reserved;
  db.prepare("UPDATE runs SET reserved_cost_usd=MAX(0,reserved_cost_usd-?),actual_cost_usd=actual_cost_usd+?,summary_json=? WHERE run_id=?").run(reserved, observed, JSON.stringify({ updatedAt: new Date().toISOString() }), runId);
}
export function retryJob(db, sq) {
  return db.prepare("UPDATE candidate_jobs SET status='pending_discovery',next_attempt_at=NULL,error_json=NULL,updated_at=? WHERE sq=? AND status IN ('retryable','permanent_error','insufficient')").run(new Date().toISOString(), sq).changes;
}
export function recoverUncertain(db, sq) {
  return db.prepare("UPDATE candidate_jobs SET status='pending_discovery',next_attempt_at=NULL,error_json=NULL,updated_at=? WHERE sq=? AND status='blocked_uncertain'").run(new Date().toISOString(), sq).changes;
}
