import Exa from "exa-js";
import normalizeUrl from "normalize-url";

export const ADAPTER_VERSION = "providers-v2";
const BRAVE = "https://api.search.brave.com/res/v1";

export class ProviderError extends Error {
  constructor(message, { provider, status = null, retryAfterMs = null, retryable = false, uncertain = false, headers = {} } = {}) {
    super(message);
    this.provider = provider;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.retryable = retryable;
    this.uncertain = uncertain;
    this.headers = headers;
  }
}

function retryAfter(headers) {
  const value = headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}
function headersObject(headers) { return Object.fromEntries(headers.entries()); }
function canonical(url) { return normalizeUrl(url, { stripHash: true, removeQueryParameters: [/^utm_/i, "fbclid", "gclid"], sortQueryParameters: true }); }
function host(url) { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
function oficial(url) { return /\.(gov|leg|jus|mp|def)\.br$/.test(host(url)); }
function source(provider, result, excerpt, inputHash, sq, requestKey) {
  const url = canonical(result.url);
  return { sq, inputHash, url, title: result.title ?? url, publishedAt: result.publishedDate ?? result.page_age ?? null, retrievedAt: new Date().toISOString(), excerpt: excerpt ?? result.description ?? result.text ?? result.snippets?.[0] ?? "", providers: [{ provider, requestKey }], raw: result, oficial: oficial(url) };
}

export function makeExa() { return process.env.EXA_API_KEY ? new Exa(process.env.EXA_API_KEY) : null; }
export async function exaSearch(exa, query, inputHash, sq, requestKey) {
  try {
    const result = await exa.search(query, { type: "auto", numResults: 20, contents: { highlights: { query, maxCharacters: 2000 } } });
    return { provider: "exa", requestId: result.requestId ?? null, cost: result.costDollars?.total ?? null, headers: {}, raw: result, sources: (result.results ?? []).map((item) => source("exa", item, item.highlights?.join(" ") ?? item.text, inputHash, sq, requestKey)) };
  } catch (error) { throw new ProviderError(error.message, { provider: "exa", retryable: /429|5\d\d|timeout|network/i.test(error.message), uncertain: true }); }
}
export async function exaContents(exa, urls, query, inputHash, sq, requestKey) {
  if (!urls.length) return { provider: "exa", sources: [], statuses: [] };
  try {
    const result = await exa.getContents(urls, { highlights: { query, maxCharacters: 2000 } });
    const statuses = result.statuses ?? [];
    return { provider: "exa", requestId: result.requestId ?? null, cost: result.costDollars?.total ?? null, headers: {}, raw: result, statuses, sources: (result.results ?? []).map((item) => source("exa", item, item.highlights?.join(" ") ?? item.text, inputHash, sq, requestKey)) };
  } catch (error) { throw new ProviderError(error.message, { provider: "exa", retryable: /429|5\d\d|timeout|network/i.test(error.message), uncertain: true }); }
}
async function bravePost(endpoint, payload) {
  let response;
  try {
    response = await fetch(`${BRAVE}${endpoint}`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY ?? process.env.BRAVE_API_KEY }, body: JSON.stringify(payload), signal: AbortSignal.timeout(120_000) });
  } catch (error) { throw new ProviderError(error.message, { provider: "brave", retryable: true, uncertain: true }); }
  const headers = headersObject(response.headers);
  if (!response.ok) throw new ProviderError(`${response.status}: ${await response.text()}`, { provider: "brave", status: response.status, retryAfterMs: retryAfter(response.headers), retryable: response.status === 429 || response.status >= 500, headers });
  return { raw: await response.json(), headers };
}
export async function braveContext(query, inputHash, sq, requestKey) {
  let result;
  try {
    result = await bravePost("/llm/context", { q: query, country: "BR", search_lang: "pt-br", count: 20, maximum_number_of_urls: 20, maximum_number_of_tokens: 8192, maximum_number_of_tokens_per_url: 2048, context_threshold_mode: "balanced", enable_source_metadata: true });
  } catch (error) {
    if (error.status !== 400 || !error.message.includes("OPTION_NOT_IN_PLAN")) throw error;
    result = await bravePost("/web/search", { q: query, country: "BR", search_lang: "pt-br", count: 20, extra_snippets: true });
  }
  const generic = result.raw.grounding?.generic ?? result.raw.web?.results ?? [];
  return { provider: "brave", headers: result.headers, raw: result.raw, sources: generic.map((item) => source("brave", item, item.snippets?.join(" ") ?? item.description ?? item.extra_snippets?.join(" "), inputHash, sq, requestKey)) };
}
export async function braveNews(query, inputHash, sq, requestKey, freshness = "") {
  const result = await bravePost("/news/search", { q: query, country: "BR", search_lang: "pt-br", ui_lang: "pt-BR", count: 20, extra_snippets: true, ...(freshness ? { freshness } : {}) });
  const items = result.raw.results ?? result.raw.news?.results ?? [];
  return { provider: "brave", headers: result.headers, raw: result.raw, sources: items.map((item) => source("brave", { ...item, page_age: item.page_age }, item.description ?? item.extra_snippets?.join(" "), inputHash, sq, requestKey)) };
}
export async function perplexitySubmit(input, schema, requestKey) {
  let response;
  try {
    response = await fetch("https://api.perplexity.ai/v1/agent", { method: "POST", headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` }, body: JSON.stringify({ model: process.env.PERPLEXITY_MODEL ?? "openai/gpt-5.6-sol", background: true, input, response_format: { type: "json_schema", json_schema: { name: "pesquisa_candidato", schema } } }), signal: AbortSignal.timeout(120_000) });
  } catch (error) { throw new ProviderError(error.message, { provider: "perplexity", retryable: false, uncertain: true }); }
  if (!response.ok) throw new ProviderError(`${response.status}: ${await response.text()}`, { provider: "perplexity", status: response.status, retryAfterMs: retryAfter(response.headers), retryable: response.status === 429 || response.status >= 500 });
  return response.json();
}
export async function perplexityPoll(id) {
  let response;
  try { response = await fetch(`https://api.perplexity.ai/v1/agent/${id}`, { headers: { accept: "application/json", authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` }, signal: AbortSignal.timeout(120_000) }); } catch (error) { throw new ProviderError(error.message, { provider: "perplexity", retryable: true }); }
  if (!response.ok) throw new ProviderError(`${response.status}: ${await response.text()}`, { provider: "perplexity", status: response.status, retryAfterMs: retryAfter(response.headers), retryable: response.status === 429 || response.status >= 500 });
  return response.json();
}
export function mergeSources(sourceLists) {
  const merged = new Map();
  for (const item of sourceLists.flat()) {
    const current = merged.get(item.url);
    if (!current) merged.set(item.url, item);
    else current.providers.push(...item.providers);
  }
  return [...merged.values()].sort((a, b) => Number(b.oficial) - Number(a.oficial) || b.providers.length - a.providers.length || a.url.localeCompare(b.url)).map((item, index) => ({ ...item, id: `src:${index + 1}` }));
}
