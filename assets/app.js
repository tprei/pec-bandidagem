const DATA_URL = "data/votos-pec-blindagem.json";

const ROUND_PREDICATE = {
  qualquer: (d) => d.votouSim === true,
  ambos: (d) => d.turno1 === "Sim" && d.turno2 === "Sim",
  t1: (d) => d.turno1 === "Sim",
  t2: (d) => d.turno2 === "Sim",
};

const VOTE_LABEL = { Sim: "Sim", Nao: "Não", Abstencao: "Abstenção", Ausente: "Ausente" };

const VOTE_CLASS = { Sim: "sim", Nao: "nao", Abstencao: "abstencao", Ausente: "ausente" };

const SORT_ORDERS = new Set(["partido", "nome", "uf"]);

const DEFAULT_PHOTO =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 128"><rect width="96" height="128" fill="#e3ddcd"/><circle cx="48" cy="46" r="20" fill="#b4a98f"/><path d="M12 128c4-30 22-42 36-42s32 12 36 42z" fill="#b4a98f"/></svg>',
  );

const collator = new Intl.Collator("pt-BR");

const state = {
  ready: false,
  deputies: [],
  search: "",
  party: "",
  state: "",
  round: "qualquer",
  sort: "partido",
};

const elements = {
  filterBar: document.getElementById("filter-bar"),
  chips: document.getElementById("chips"),
  legend: document.getElementById("legend"),
  counter: document.getElementById("counter"),
  list: document.getElementById("list"),
  statusPanel: document.getElementById("status-panel"),
  loading: document.getElementById("loading"),
  search: document.getElementById("search"),
  party: document.getElementById("party"),
  state: document.getElementById("state"),
  round: document.getElementById("round"),
  sort: document.getElementById("sort"),
  clear: document.getElementById("clear"),
  stats: document.getElementById("stats"),
  statYesAny: document.getElementById("stat-yes-any"),
  statYesBoth: document.getElementById("stat-yes-both"),
  statDate: document.getElementById("stat-date"),
  highlightNumeral: document.getElementById("destaque-numeral"),
};

function normalizeText(text) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function validateRecord(d) {
  if (typeof d.nome !== "string" || !d.nome) throw new Error(`deputado sem nome: ${JSON.stringify(d)}`);
  if (typeof d.partido !== "string" || !d.partido) throw new Error(`partido ausente em ${d.nome}`);
  if (typeof d.uf !== "string" || !d.uf) throw new Error(`UF ausente em ${d.nome}`);
  for (const field of ["turno1", "turno2"]) {
    if (!Object.hasOwn(VOTE_LABEL, d[field])) {
      throw new Error(`valor inesperado em ${field} para ${d.nome}: ${JSON.stringify(d[field])}`);
    }
  }
  if (typeof d.votouSim !== "boolean") throw new Error(`votouSim não booleano para ${d.nome}`);
}

async function loadData() {
  let response;
  try {
    response = await fetch(DATA_URL);
  } catch (networkError) {
    throw new Error(`falha de rede ao buscar ${DATA_URL}: ${networkError.message}`, { cause: networkError });
  }
  if (!response.ok) throw new Error(`resposta HTTP ${response.status} ao buscar ${DATA_URL}`);
  return response.json();
}

function filterByRound() {
  return state.deputies.filter(ROUND_PREDICATE[state.round]);
}

function matchesFilters(deputy) {
  if (state.party && deputy.partido !== state.party) return false;
  if (state.state && deputy.uf !== state.state) return false;
  if (state.search && !normalizeText(deputy.nome).includes(normalizeText(state.search))) return false;
  return true;
}

function sortDeputies(list, counts) {
  const byName = (a, b) => collator.compare(a.nome, b.nome);
  const comparators = {
    partido: (a, b) =>
      (counts?.get(b.partido) ?? 0) - (counts?.get(a.partido) ?? 0) ||
      collator.compare(a.partido, b.partido) ||
      byName(a, b),
    nome: byName,
    uf: (a, b) => collator.compare(a.uf, b.uf) || byName(a, b),
  };
  return list.slice().sort(comparators[state.sort]);
}

function setFilter(field, value) {
  if (state[field] === value) return;
  state[field] = value;
  render();
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  const roundFromUrl = params.get("turno");
  if (roundFromUrl && Object.hasOwn(ROUND_PREDICATE, roundFromUrl)) state.round = roundFromUrl;
  if (SORT_ORDERS.has(params.get("ordem"))) state.sort = params.get("ordem");
  if (params.has("busca")) state.search = params.get("busca");
  if (params.has("partido")) state.party = params.get("partido");
  if (params.has("uf")) state.state = params.get("uf").toUpperCase();
}

function updateUrl() {
  const params = new URLSearchParams();
  if (state.search) params.set("busca", state.search);
  if (state.party) params.set("partido", state.party);
  if (state.state) params.set("uf", state.state);
  if (state.round !== "qualquer") params.set("turno", state.round);
  if (state.sort !== "partido") params.set("ordem", state.sort);
  const query = params.toString();
  history.replaceState(null, "", query ? `?${query}` : location.pathname);
}

function countByParty(deputies) {
  const counts = new Map();
  for (const deputy of deputies) {
    counts.set(deputy.partido, (counts.get(deputy.partido) ?? 0) + 1);
  }
  return counts;
}

function renderPartySelect(counts) {
  const fragment = document.createDocumentFragment();
  fragment.append(new Option("Todos os partidos", ""));
  const parties = [...counts.keys()].sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || collator.compare(a, b),
  );
  for (const party of parties) {
    fragment.append(new Option(`${party} (${counts.get(party)})`, party));
  }
  elements.party.replaceChildren(fragment);
}

function renderChips(counts) {
  const fragment = document.createDocumentFragment();
  const parties = [...counts.keys()].sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || collator.compare(a, b),
  );
  for (const party of parties) {
    const chip = createElement("button", "chip", `${party} ${counts.get(party)}`);
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(party === state.party));
    chip.addEventListener("click", () => setFilter("party", party === state.party ? "" : party));
    fragment.append(chip);
  }
  elements.chips.replaceChildren(fragment);
}

function syncControls() {
  elements.search.value = state.search;
  elements.round.value = state.round;
  elements.sort.value = state.sort;
  elements.state.value = [...elements.state.options].some((option) => option.value === state.state)
    ? state.state
    : "";
  elements.party.value = [...elements.party.options].some((option) => option.value === state.party)
    ? state.party
    : "";
}

function createBadge(roundLabel, voteValue) {
  const span = createElement("span", `badge badge--${VOTE_CLASS[voteValue]}`);
  span.title = `${roundLabel} turno: ${VOTE_LABEL[voteValue]}`;
  span.append(
    createElement("span", "badge__turno", roundLabel),
    createElement("span", "badge__voto", VOTE_LABEL[voteValue]),
  );
  return span;
}

function renderRows(visible) {
  const fragment = document.createDocumentFragment();
  for (const deputy of visible) {
    const yesCount = (deputy.turno1 === "Sim" ? 1 : 0) + (deputy.turno2 === "Sim" ? 1 : 0);
    const intensityClass =
      yesCount === 2 ? " deputado--sim-ambos" : yesCount === 1 ? " deputado--sim-um" : "";
    const item = createElement("li", `deputado${intensityClass}`);

    const photoFrame = createElement("div", "foto-moldura");
    const photo = document.createElement("img");
    photo.className = "foto";
    photo.width = 64;
    photo.height = 64;
    photo.loading = "lazy";
    photo.alt = deputy.nome;
    photo.src = `fotos/${deputy.id}.jpg`;
    photo.addEventListener("error", () => {
      photo.src = DEFAULT_PHOTO;
    });
    photoFrame.append(photo);

    const info = createElement("div", "info");
    const nameLink = createElement("a", "nome", deputy.nome);
    nameLink.href = deputy.urlPerfil;
    nameLink.target = "_blank";
    nameLink.rel = "noopener";

    const detail = createElement("div", "detalhe");
    detail.append(
      createElement("span", "party", deputy.partido),
      document.createTextNode(" · "),
      createElement("span", "uf", deputy.uf),
    );
    info.append(nameLink, detail);

    const voteBadges = createElement("div", "votos");
    voteBadges.append(createBadge("1º", deputy.turno1), createBadge("2º", deputy.turno2));

    item.append(photoFrame, info, voteBadges);
    fragment.append(item);
  }
  if (!visible.length) {
    fragment.append(createElement("li", "vazia", "Nenhum deputado encontrado com esses filtros."));
  }
  elements.list.replaceChildren(fragment);
}

function render() {
  if (!state.ready) return;

  const roundPool = filterByRound();
  if (state.party && !roundPool.some((d) => d.partido === state.party)) state.party = "";
  if (state.state && !roundPool.some((d) => d.uf === state.state)) state.state = "";

  const counts = countByParty(roundPool);
  const visible = sortDeputies(roundPool.filter(matchesFilters), counts);

  elements.filterBar.hidden = false;
  elements.chips.hidden = false;
  if (elements.legend) elements.legend.hidden = false;
  elements.loading.remove();

  renderPartySelect(counts);
  renderChips(counts);
  syncControls();

  elements.counter.replaceChildren(
    document.createTextNode("Mostrando "),
    createElement("strong", "", String(visible.length)),
    document.createTextNode(` de ${roundPool.length} deputados`),
  );

  renderRows(visible);
  updateUrl();
}

function showError(error) {
  elements.loading.remove();

  const article = createElement("article", "erro");
  article.append(createElement("h2", "", "Não foi possível carregar os dados"));
  article.append(createElement("p", "", `Falha ao ler ${DATA_URL} (${error.message}).`));

  const instruction = createElement("p");
  instruction.append(
    document.createTextNode("Este site lê o JSON por fetch e precisa ser servido por HTTP: rode "),
    createElement("code", "", "python3 -m http.server 8000"),
    document.createTextNode(" na raiz do projeto e abra "),
    createElement("code", "", "http://localhost:8000"),
    document.createTextNode("."),
  );
  article.append(instruction);

  elements.statusPanel.replaceChildren(article);
}

function populateStateSelect() {
  const sortedStates = [...new Set(state.deputies.map((d) => d.uf))].sort(collator.compare);
  const fragment = document.createDocumentFragment();
  fragment.append(new Option("Todos os estados", ""));
  for (const uf of sortedStates) fragment.append(new Option(uf, uf));
  elements.state.replaceChildren(fragment);
}

function renderStats(data) {
  if (elements.highlightNumeral && data.resumo?.simEmAlgumTurno) {
    elements.highlightNumeral.textContent = String(data.resumo.simEmAlgumTurno);
  }
  if (elements.statYesAny && data.resumo?.simEmAlgumTurno) {
    elements.statYesAny.textContent = String(data.resumo.simEmAlgumTurno);
  }
  if (elements.statYesBoth && data.resumo?.simNosDoisTurnos) {
    elements.statYesBoth.textContent = String(data.resumo.simNosDoisTurnos);
  }
  if (elements.statDate) {
    const rawData = data.votacoes?.[0]?.data || data.votacoes?.[0]?.dataHora;
    if (rawData) {
      const p = rawData.slice(0, 10).split("-");
      elements.statDate.textContent = p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : rawData;
    }
  }
  if (elements.stats) elements.stats.hidden = false;
}

async function init() {
  readUrl();
  try {
    const data = await loadData();
    if (!Array.isArray(data.deputados)) throw new Error(`${DATA_URL} não contém a lista "deputados"`);
    data.deputados.forEach(validateRecord);
    state.deputies = data.deputados;
    state.ready = true;
    populateStateSelect();
    renderStats(data);
  } catch (error) {
    showError(error);
    return;
  }
  render();
}

elements.search.addEventListener("input", () => setFilter("search", elements.search.value.trim()));
elements.party.addEventListener("change", () => setFilter("party", elements.party.value));
elements.state.addEventListener("change", () => setFilter("state", elements.state.value));
elements.round.addEventListener("change", () => setFilter("round", elements.round.value));
elements.sort.addEventListener("change", () => setFilter("sort", elements.sort.value));
elements.clear.addEventListener("click", () => {
  Object.assign(state, { search: "", party: "", state: "", round: "qualquer", sort: "partido" });
  render();
});

init();
