import { stateFromSq, encodePost, decodePost, linkText, buildUrl, extractRoute } from "./share-link.js";
import { drawCard, drawStory, renderCard, renderStory, renderStickerSheet, drawQr } from "./poster.js";

const STORAGE_STATE = "vs.state";
const STORAGE_ALL_STATES = "vs.allStates";
const STORAGE_INSTALL_DISMISSED = "vs.installDismissed";
const INITIAL_LIMIT = 40;
const RADAR_THRESHOLD = 3;

const VERB = {
  blindagem: {
    defende: "Votou CONTRA a blindagem",
    contra: "Votou A FAVOR da blindagem",
    curto: { defende: "CONTRA a blindagem", contra: "PELA blindagem" },
    inFavor: "Votou CONTRA a blindagem",
    against: "Votou A FAVOR da blindagem",
  },
  jornada: {
    defende: "Votou pela redução da jornada",
    contra: "Votou CONTRA a redução da jornada",
    curto: { defende: "PELO fim da 6x1", contra: "CONTRA o fim da 6x1" },
    inFavor: "Votou pela redução da jornada",
    against: "Votou CONTRA a redução da jornada",
  },
  anistia: {
    defende: "Votou CONTRA a anistia golpista",
    contra: "Votou pela ANISTIA aos golpistas",
    curto: { defende: "CONTRA a anistia golpista", contra: "PELA anistia golpista" },
    inFavor: "Votou CONTRA a anistia golpista",
    against: "Votou pela ANISTIA aos golpistas",
  },
  trabalhista: {
    defende: "Votou CONTRA cortar direitos trabalhistas",
    contra: "Votou para CORTAR direitos trabalhistas",
    curto: { defende: "CONTRA o corte de direitos", contra: "PELO corte de direitos trabalhistas" },
    inFavor: "Votou CONTRA cortar direitos trabalhistas",
    against: "Votou para CORTAR direitos trabalhistas",
  },
  clt: {
    defende: "Votou CONTRA a reforma trabalhista de 2017",
    contra: "Votou A FAVOR da reforma trabalhista de 2017",
    curto: { defende: "CONTRA a reforma da CLT", contra: "PELA reforma da CLT" },
    inFavor: "Votou CONTRA a reforma trabalhista de 2017",
    against: "Votou A FAVOR da reforma trabalhista de 2017",
  },
  previdencia: {
    defende: "Votou CONTRA a reforma da Previdência",
    contra: "Votou A FAVOR da reforma da Previdência",
    curto: { defende: "CONTRA a reforma da Previdência", contra: "PELA reforma da Previdência" },
    inFavor: "Votou CONTRA a reforma da Previdência",
    against: "Votou A FAVOR da reforma da Previdência",
  },
  eletrobras: {
    defende: "Votou CONTRA privatizar a Eletrobras",
    contra: "Votou para PRIVATIZAR a Eletrobras",
    curto: { defende: "CONTRA a privatização da Eletrobras", contra: "PELA privatização da Eletrobras" },
    inFavor: "Votou CONTRA privatizar a Eletrobras",
    against: "Votou para PRIVATIZAR a Eletrobras",
  },
  ricos: {
    defende: "Votou para TAXAR os super-ricos",
    contra: "Votou CONTRA taxar os super-ricos",
    curto: { defende: "PELA taxação dos super-ricos", contra: "CONTRA a taxação dos super-ricos" },
    inFavor: "Votou para TAXAR os super-ricos",
    against: "Votou CONTRA taxar os super-ricos",
  },
};

const AXIS_ORDER = [
  "blindagem",
  "jornada",
  "anistia",
  "trabalhista",
  "clt",
  "previdencia",
  "eletrobras",
  "ricos",
];

const SHORT_LABEL = {
  blindagem: {
    contra: "PELA blindagem",
    defende: "CONTRA a blindagem",
    against: "PELA blindagem",
    inFavor: "CONTRA a blindagem",
  },
  jornada: {
    contra: "CONTRA o fim da 6x1",
    defende: "PELO fim da 6x1",
    against: "CONTRA o fim da 6x1",
    inFavor: "PELO fim da 6x1",
  },
  anistia: {
    contra: "PELA anistia golpista",
    defende: "CONTRA a anistia golpista",
    against: "PELA anistia golpista",
    inFavor: "CONTRA a anistia golpista",
  },
  trabalhista: {
    contra: "PELO corte de direitos trabalhistas",
    defende: "CONTRA o corte de direitos",
    against: "PELO corte de direitos trabalhistas",
    inFavor: "CONTRA o corte de direitos",
  },
  clt: {
    contra: "PELA reforma da CLT",
    defende: "CONTRA a reforma da CLT",
    against: "PELA reforma da CLT",
    inFavor: "CONTRA a reforma da CLT",
  },
  previdencia: {
    contra: "PELA reforma da Previdência",
    defende: "CONTRA a reforma da Previdência",
    against: "PELA reforma da Previdência",
    inFavor: "CONTRA a reforma da Previdência",
  },
  eletrobras: {
    contra: "PELA privatização da Eletrobras",
    defende: "CONTRA a privatização da Eletrobras",
    against: "PELA privatização da Eletrobras",
    inFavor: "CONTRA a privatização da Eletrobras",
  },
  ricos: {
    contra: "CONTRA a taxação dos super-ricos",
    defende: "PELA taxação dos super-ricos",
    against: "CONTRA a taxação dos super-ricos",
    inFavor: "PELA taxação dos super-ricos",
  },
};

const ISSUE_TITLE = {
  blindagem: {
    contra: "QUEM VOTOU PELA BLINDAGEM",
    defende: "QUEM VOTOU CONTRA A BLINDAGEM",
    against: "QUEM VOTOU PELA BLINDAGEM",
    inFavor: "QUEM VOTOU CONTRA A BLINDAGEM",
  },
  jornada: {
    contra: "QUEM VOTOU CONTRA O FIM DA 6x1",
    defende: "QUEM VOTOU PELO FIM DA 6x1",
    against: "QUEM VOTOU CONTRA O FIM DA 6x1",
    inFavor: "QUEM VOTOU PELO FIM DA 6x1",
  },
  anistia: {
    contra: "QUEM VOTOU PELA ANISTIA GOLPISTA",
    defende: "QUEM BARROU A ANISTIA GOLPISTA",
    against: "QUEM VOTOU PELA ANISTIA GOLPISTA",
    inFavor: "QUEM BARROU A ANISTIA GOLPISTA",
  },
  trabalhista: {
    contra: "QUEM CORTOU DIREITOS NA PANDEMIA",
    defende: "QUEM DEFENDEU DIREITOS NA PANDEMIA",
    against: "QUEM CORTOU DIREITOS NA PANDEMIA",
    inFavor: "QUEM DEFENDEU DIREITOS NA PANDEMIA",
  },
  clt: {
    contra: "QUEM VOTOU PELA REFORMA DA CLT",
    defende: "QUEM VOTOU CONTRA A REFORMA DA CLT",
    against: "QUEM VOTOU PELA REFORMA DA CLT",
    inFavor: "QUEM VOTOU CONTRA A REFORMA DA CLT",
  },
  previdencia: {
    contra: "QUEM VOTOU PELA REFORMA DA PREVIDÊNCIA",
    defende: "QUEM VOTOU CONTRA A REFORMA DA PREVIDÊNCIA",
    against: "QUEM VOTOU PELA REFORMA DA PREVIDÊNCIA",
    inFavor: "QUEM VOTOU CONTRA A REFORMA DA PREVIDÊNCIA",
  },
  eletrobras: {
    contra: "QUEM PRIVATIZOU A ELETROBRAS",
    defende: "QUEM VOTOU CONTRA PRIVATIZAR A ELETROBRAS",
    against: "QUEM PRIVATIZOU A ELETROBRAS",
    inFavor: "QUEM VOTOU CONTRA PRIVATIZAR A ELETROBRAS",
  },
  ricos: {
    contra: "QUEM VOTOU CONTRA TAXAR OS SUPER-RICOS",
    defende: "QUEM VOTOU PARA TAXAR OS SUPER-RICOS",
    against: "QUEM VOTOU CONTRA TAXAR OS SUPER-RICOS",
    inFavor: "QUEM VOTOU PARA TAXAR OS SUPER-RICOS",
  },
};

const TOPIC_YES = {
  blindagem: "blindagem",
  jornada: "fim da 6x1",
  anistia: "anistia golpista",
  trabalhista: "corte de direitos",
  clt: "reforma da CLT",
  previdencia: "ref. da Previdência",
  eletrobras: "privatização",
  ricos: "taxar super-ricos",
};

const DEFENDS_YES = { jornada: true, ricos: true };

const OFFICE_LABELS = {
  1: "Presidente",
  2: "Vice-Presidente",
  3: "Governador",
  4: "Vice-Governador",
  5: "Senador",
  6: "Dep. Federal",
  7: "Dep. Estadual",
  8: "Dep. Distrital",
  9: "1º Suplente",
  10: "2º Suplente",
};

const PROFILE_LABELS = {
  novo: "Estreante",
  reeleicao: "Reeleição",
  outro: "Já teve mandato",
};

const appState = {
  index: null,
  state: null,
  allStates: false,
  files: new Map(),
  curation: null,
  route: null,
  stance: "nao",
  template: "booth",
  candidate: null,
  duel: null,
  issue: null,
  list: null,
  reasons: null,
  axes: null,
  textFilter: "",
  filters: { sort: "against", office: "todos", profile: "todos" },
  activeTab: "catalogo",
  installPrompt: null,
  sort: "against",
  office: "todos",
  profile: "todos",
  section: "historico",
  limit: INITIAL_LIMIT,
  radarView: "partido",
  partyFilter: null,
  issueFilter: null,
  draft: null,
  toastTimer: null,
  scanStream: null,
  scanInterval: null,

  // Compatibility aliases
  get q() {
    return this.textFilter;
  },
  set q(val) {
    this.textFilter = val;
  },
  get indice() {
    return this.index;
  },
  set indice(v) {
    this.index = v;
  },
  get uf() {
    return this.state;
  },
  set uf(v) {
    this.state = v;
  },
  get todasUfs() {
    return this.allStates;
  },
  set todasUfs(v) {
    this.allStates = v;
  },
  get arquivos() {
    return this.files;
  },
  set arquivos(v) {
    this.files = v;
  },
  get rascunho() {
    return this.draft;
  },
  set rascunho(v) {
    this.draft = v;
  },
  get secao() {
    return this.section;
  },
  set secao(v) {
    this.section = v;
  },
  get limite() {
    return this.limit;
  },
  set limite(v) {
    this.limit = v;
  },
  get ordem() {
    return this.sort;
  },
  set ordem(v) {
    this.sort = v;
  },
  get cargo() {
    return this.office;
  },
  set cargo(v) {
    this.office = v;
  },
  get perfil() {
    return this.profile;
  },
  set perfil(v) {
    this.profile = v;
  },
  get vistaRadar() {
    return this.radarView;
  },
  set vistaRadar(v) {
    this.radarView = v;
  },
  get filtroPartido() {
    return this.partyFilter;
  },
  set filtroPartido(v) {
    this.partyFilter = v;
  },
  get filtroPauta() {
    return this.issueFilter;
  },
  set filtroPauta(v) {
    this.issueFilter = v;
  },
};

function flatten(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatNumberBr(valor) {
  return Number(valor).toLocaleString("pt-BR");
}

function createElement(tag, classe, texto) {
  const no = document.createElement(tag);
  if (classe !== undefined) no.className = classe;
  if (texto !== undefined) no.textContent = texto;
  return no;
}

function titleCase(str) {
  return String(str ?? "")
    .toLowerCase()
    .replace(/(^|\s|-)([a-zà-ú])/g, (m) => m.toUpperCase());
}

function joinWithAnd(lista) {
  if (!lista || lista.length === 0) return "";
  if (lista.length === 1) return lista[0];
  return lista.slice(0, -1).join(", ") + " e " + lista[lista.length - 1];
}

async function fetchJson(caminho) {
  const r = await fetch(caminho);
  if (!r.ok) throw new Error(`${caminho} status ${r.status}`);
  return r.json();
}

function initialsOf(nome) {
  const partes = String(nome ?? "")
    .split(/\s+/)
    .filter((p) => p.length > 2);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return "VS";
}

function mapFields(par) {
  const c = par.arquivo.indices;
  const l = par.linha;
  return {
    sq: l[c.sq],
    numero: l[c.numero],
    ballotNumber: l[c.numero],
    nome: l[c.nome],
    name: l[c.nome],
    nomeCompleto: l[c.nomeCompleto],
    fullName: l[c.nomeCompleto],
    cargo: l[c.cargo],
    office: l[c.cargo],
    partido: l[c.partido],
    party: l[c.partido],
    coligacao: l[c.coligacao],
    coalition: l[c.coligacao],
    badge: l[c.badge],
    foto: l[c.foto],
    photo: l[c.foto],
    perfil: l[c.perfil],
    profile: l[c.perfil],
    ficha: l[c.ficha],
    dossier: l[c.ficha],
  };
}

function scoreCandidate(ficha, eixo) {
  const vazio = {
    estado: "sem-registro",
    state: "sem-registro",
    defende: 0,
    inFavor: 0,
    contra: 0,
    against: 0,
    outros: [],
    others: [],
    valor: null,
    value: null,
  };
  if (ficha === null) return vazio;
  let defende = 0;
  let contra = 0;
  const outros = [];
  for (const votacao of eixo.votacoes) {
    const codigo = ficha.votos[votacao.id];
    if (codigo === eixo.defendeOEleitor) defende += 1;
    else if (codigo === eixo.contraOEleitor) contra += 1;
    else if (codigo !== 0 && codigo !== undefined) outros.push(codigo);
  }
  const total = defende + contra;
  if (total === 0) {
    if (outros.length === 0) return vazio;
    return {
      estado: "sem-lado",
      state: "sem-lado",
      defende,
      inFavor: defende,
      contra,
      against: contra,
      outros,
      others: outros,
      valor: null,
      value: null,
    };
  }
  const valor = defende / total;
  const rotulo = valor === 1 ? "in-favor" : valor === 0 ? "against" : "mixed";
  return {
    estado: rotulo,
    state: rotulo,
    defende,
    inFavor: defende,
    contra,
    against: contra,
    outros,
    others: outros,
    valor,
    value: valor,
  };
}

function inFavorOfBlindagem(arquivo) {
  if (!arquivo) return 0;
  if (arquivo.inFavorBlindagem !== undefined) return arquivo.inFavorBlindagem;
  if (arquivo.aFavorBlindagem !== undefined) return arquivo.aFavorBlindagem;
  const eixo = appState.index.eixos.find((e) => e.id === "blindagem");
  let total = 0;
  for (const linha of arquivo.candidatos) {
    const ficha = linha[arquivo.indices.ficha];
    if (ficha && scoreCandidate(ficha, eixo).state === "against") total += 1;
  }
  arquivo.inFavorBlindagem = total;
  arquivo.aFavorBlindagem = total;
  return total;
}

function enrichCandidate(par) {
  const c = mapFields(par);
  const sq = c.sq;
  const memo = par.arquivo.vm?.get(sq);
  if (memo) return memo;

  const cargoCurto = OFFICE_LABELS[c.cargo] ?? "Candidato";
  const partido = appState.index.partidos[c.partido]?.sigla ?? String(c.partido);
  const temFicha = c.ficha !== null;
  const notas = {};
  let contra = 0;
  let def = 0;

  if (temFicha) {
    for (const eixo of appState.index.eixos) {
      const p = scoreCandidate(c.ficha, eixo);
      const est = p.state === "sem-registro" || p.state === "sem-lado" ? "none" : p.state;
      notas[eixo.id] = est;
      if (est === "against") contra++;
      if (est === "in-favor") def++;
    }
  } else {
    for (const eixo of AXIS_ORDER) {
      notas[eixo] = "none";
    }
  }

  let fotoSrc = null;
  if (c.foto === "t") fotoSrc = `fotos-tse/${sq}.jpg`;
  else if (c.foto === "c" && c.ficha?.camaraId) fotoSrc = `fotos/${c.ficha.camaraId}.jpg`;

  const noRadar = contra >= RADAR_THRESHOLD;
  const placar = `${contra} contra · ${def} a favor`;
  const fidelidade =
    c.ficha && c.ficha.bancadaAferivel
      ? `Votou com o próprio partido em ${Math.round((100 * c.ficha.comMaioria) / c.ficha.bancadaAferivel)}% das ${formatNumberBr(c.ficha.bancadaAferivel)} votações mensuráveis — fato, não virtude.`
      : "";

  const vm = {
    sq,
    numero: c.numero,
    ballotNumber: c.numero,
    nome: c.nome,
    name: c.nome,
    nomeCompleto: c.nomeCompleto,
    fullName: c.nomeCompleto,
    cargo: c.cargo,
    office: c.cargo,
    cargoCurto,
    officeShort: cargoCurto,
    partido,
    party: partido,
    perfil: c.perfil,
    profile: c.perfil,
    ficha: c.ficha,
    dossier: c.ficha,
    temFicha,
    hasDossier: temFicha,
    uf: par.arquivo.uf,
    state: par.arquivo.uf,
    notas,
    notes: notas,
    contra,
    against: contra,
    def,
    inFavor: def,
    fotoSrc,
    photoSrc: fotoSrc,
    iniciais: initialsOf(c.nome),
    initials: initialsOf(c.nome),
    matiz: (c.numero * 137) % 360,
    hue: (c.numero * 137) % 360,
    noRadar,
    onRadar: noRadar,
    placar,
    score: placar,
    fidelidade,
    loyalty: fidelidade,
  };

  if (!par.arquivo.vm) par.arquivo.vm = new Map();
  par.arquivo.vm.set(sq, vm);
  return vm;
}

async function loadIndex() {
  if (appState.index) return appState.index;
  appState.index = await fetchJson("data/dex/indice.json");
  return appState.index;
}

async function loadState(sigla) {
  if (!sigla) return null;
  const s = sigla.toUpperCase();
  if (appState.files.has(s)) return appState.files.get(s);
  const dados = await fetchJson(`data/dex/${s}.json`);
  dados.indices = Object.fromEntries(dados.colunas.map((col, idx) => [col, idx]));
  appState.files.set(s, dados);
  return dados;
}

async function loadAllStates() {
  await Promise.all(appState.index.ufs.map((u) => loadState(u.sigla)));
}

function getCandidatePool(uf) {
  const arqBr = appState.files.get("BR");
  const arqUf = uf && uf !== "BR" ? appState.files.get(uf) : null;
  const lista = [];
  if (arqBr) {
    for (const linha of arqBr.candidatos) {
      lista.push(enrichCandidate({ arquivo: arqBr, linha }));
    }
  }
  if (arqUf) {
    for (const linha of arqUf.candidatos) {
      lista.push(enrichCandidate({ arquivo: arqUf, linha }));
    }
  }
  return lista;
}

function getAllCandidatesPool() {
  const lista = [];
  for (const arq of appState.files.values()) {
    for (const linha of arq.candidatos) {
      lista.push(enrichCandidate({ arquivo: arq, linha }));
    }
  }
  return lista;
}

function stateOfPost(dados) {
  const sqs = [dados.sq, dados.nao, dados.sim, dados.rejected, dados.chosen, ...(dados.faces ?? [])].filter(
    Boolean,
  );
  const ufs = sqs.map((sq) => stateFromSq(sq)).filter(Boolean);
  return ufs.find((u) => u !== "BR") ?? ufs[0] ?? null;
}

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.removeAttribute("hidden");
  clearTimeout(appState.toastTimer);
  appState.toastTimer = setTimeout(() => {
    el.setAttribute("hidden", "");
  }, 2400);
}

function getDirection(c, ladoT, n = 3) {
  const ids = AXIS_ORDER.filter((id) => c.notas[id] === ladoT).slice(0, n);
  const favor = [];
  const contra = [];
  for (const id of ids) {
    const votouSim = (ladoT === "against") !== Boolean(DEFENDS_YES[id]);
    (votouSim ? favor : contra).push(TOPIC_YES[id]);
  }
  return { favor, contra, inFavor: favor, against: contra };
}

function getDirectionIds(ids, ladoT) {
  const favor = [];
  const contra = [];
  for (const item of ids) {
    const id = typeof item === "number" ? AXIS_ORDER[item] : item;
    if (!id || !TOPIC_YES[id]) continue;
    const votouSim = (ladoT === "against") !== Boolean(DEFENDS_YES[id]);
    (votouSim ? favor : contra).push(TOPIC_YES[id]);
  }
  return { favor, contra, inFavor: favor, against: contra };
}

function isEligibleOpponent(c, selSq, postura) {
  return c.temFicha && c.sq !== selSq && (postura === "nao" ? c.def >= 3 && c.contra === 0 : c.contra >= 3);
}

function isEligibleForIssue(c, eixos, lado) {
  return eixos.length > 0 && eixos.every((e) => c.notas[e] === lado);
}

function isEligibleForList(c, eixos) {
  return c.temFicha && c.contra >= 1 && eixos.every((e) => c.notas[e] === "against");
}

function buildPost(dados, poolCandidatos) {
  const tipoRaw = dados.type ?? dados.tipo ?? "candidate";
  const tipoMap = { candidato: "candidate", duelo: "duel", pauta: "issue", lista: "list" };
  const type = tipoMap[tipoRaw] ?? tipoRaw;

  const postura = dados.stance ?? dados.postura ?? "nao";
  const stance = postura;

  const modeloRaw = dados.template ?? dados.modelo ?? "booth";
  const modeloMap = { cabine: "booth", cedula: "ballot" };
  const template = modeloMap[modeloRaw] ?? modeloRaw;

  const lado = stance === "nao" ? "against" : "in-favor";
  const uf = dados.state || dados.uf || stateOfPost(dados) || appState.state || "SP";
  const state = uf;

  const arqBr = appState.files.get("BR");
  const arqUf = uf === "BR" ? null : appState.files.get(uf);
  const pelaBlindagem = inFavorOfBlindagem(arqBr) + inFavorOfBlindagem(arqUf);

  let idCodec = dados.id;
  if (!idCodec) {
    try {
      idCodec = encodePost(dados);
    } catch {
      idCodec = "";
    }
  }

  const link = idCodec ? linkText(stance, idCodec) : `votosecreto.com.br/#/${stance}/...`;
  const url = idCodec ? buildUrl(stance, idCodec) : `https://${link}`;

  if (type === "candidate") {
    const c = poolCandidatos.find((x) => x.sq === dados.sq) ?? {
      nome: "",
      name: "",
      numero: "",
      ballotNumber: "",
      partido: "",
      party: "",
      cargoCurto: "Candidato",
      officeShort: "Candidato",
      fotoSrc: null,
      photoSrc: null,
      iniciais: "VS",
      initials: "VS",
      matiz: 260,
      hue: 260,
      notas: {},
      notes: {},
    };

    const motivosDisp = AXIS_ORDER.filter((id) => c.notas[id] === lado);
    const motivosBrutos = dados.reasons ?? dados.motivos ?? motivosDisp.slice(0, 4);
    const motivosSel = motivosBrutos.map((m) => (typeof m === "number" ? AXIS_ORDER[m] : m)).filter(Boolean);
    const dirs = getDirectionIds(motivosSel, lado);

    let legenda;
    if (motivosSel.length === 0) {
      legenda =
        stance === "nao"
          ? `O voto é secreto. O meu não vai pro ${c.ballotNumber ?? c.numero}.`
          : `O voto é secreto. O meu vai pro ${c.ballotNumber ?? c.numero}: ${titleCase(c.name ?? c.nome)}.`;
    } else if (stance === "nao") {
      legenda = `O voto é secreto. O que ${titleCase(c.name ?? c.nome)} fez no Congresso, não: votou ${SHORT_LABEL[motivosSel[0]].contra.toLowerCase()}. NÃO VOTO no ${c.ballotNumber ?? c.numero}.`;
    } else {
      legenda = `Enquanto ${pelaBlindagem} candidaturas ${uf === "BR" ? "do Brasil" : `de ${uf}`} votavam pela blindagem, ${titleCase(c.name ?? c.nome)} votou ${SHORT_LABEL[motivosSel[0]].defende.toLowerCase()}. VOTO ${c.ballotNumber ?? c.numero}.`;
    }

    const storyTitle = "MEU VOTO É SECRETO MAS NESSE EU… 🤭";

    return {
      type,
      tipo: type,
      stance,
      postura: stance,
      template,
      modelo: template,
      state,
      uf: state,
      link,
      url,
      meta: `${c.officeShort ?? c.cargoCurto} · ${state} · 2026`,
      storyTitle,
      storyTitulo: storyTitle,
      caption: legenda,
      legenda,
      candidate: {
        name: c.name ?? c.nome,
        nome: c.name ?? c.nome,
        ballotNumber: c.ballotNumber ?? c.numero,
        numero: c.ballotNumber ?? c.numero,
        party: c.party ?? c.partido,
        partido: c.party ?? c.partido,
        officeShort: c.officeShort ?? c.cargoCurto,
        cargoCurto: c.officeShort ?? c.cargoCurto,
        photoSrc: c.photoSrc ?? c.fotoSrc,
        fotoSrc: c.photoSrc ?? c.fotoSrc,
        initials: c.initials ?? c.iniciais,
        iniciais: c.initials ?? c.iniciais,
        hue: c.hue ?? c.matiz,
        matiz: c.hue ?? c.matiz,
        inFavor: dirs.inFavor,
        favor: dirs.inFavor,
        against: dirs.against,
        contra: dirs.against,
        notes: c.notes ?? c.notas,
        notas: c.notes ?? c.notas,
      },
      candidato: {
        name: c.name ?? c.nome,
        nome: c.name ?? c.nome,
        ballotNumber: c.ballotNumber ?? c.numero,
        numero: c.ballotNumber ?? c.numero,
        party: c.party ?? c.partido,
        partido: c.party ?? c.partido,
        officeShort: c.officeShort ?? c.cargoCurto,
        cargoCurto: c.officeShort ?? c.cargoCurto,
        photoSrc: c.photoSrc ?? c.fotoSrc,
        fotoSrc: c.photoSrc ?? c.fotoSrc,
        initials: c.initials ?? c.iniciais,
        iniciais: c.initials ?? c.iniciais,
        hue: c.hue ?? c.matiz,
        matiz: c.hue ?? c.matiz,
        inFavor: dirs.inFavor,
        favor: dirs.inFavor,
        against: dirs.against,
        contra: dirs.against,
        notes: c.notes ?? c.notas,
        notas: c.notes ?? c.notas,
      },
      motivosSel,
      selectedReasons: motivosSel,
    };
  }

  if (type === "duel") {
    const rejectedSq = dados.rejected ?? dados.nao;
    const chosenSq = dados.chosen ?? dados.sim;

    const naoCand = poolCandidatos.find((x) => x.sq === rejectedSq) ?? {
      name: "",
      nome: "",
      numero: "",
      ballotNumber: "",
      party: "",
      partido: "",
      cargoCurto: "Candidato",
      officeShort: "Candidato",
      fotoSrc: null,
      photoSrc: null,
      iniciais: "VS",
      initials: "VS",
      matiz: 260,
      hue: 260,
      notas: {},
      notes: {},
    };
    const simCand = poolCandidatos.find((x) => x.sq === chosenSq) ?? {
      name: "",
      nome: "",
      numero: "",
      ballotNumber: "",
      party: "",
      partido: "",
      cargoCurto: "Candidato",
      officeShort: "Candidato",
      fotoSrc: null,
      photoSrc: null,
      iniciais: "VS",
      initials: "VS",
      matiz: 260,
      hue: 260,
      notas: {},
      notes: {},
    };

    const dirNao = getDirection(naoCand, "against", 3);
    const dirSim = getDirection(simCand, "in-favor", 3);

    const notasNao = naoCand.notes ?? naoCand.notas;
    const notasSim = simCand.notes ?? simCand.notas;
    const badgesNao = AXIS_ORDER.filter((id) => notasNao[id] === "against")
      .slice(0, 2)
      .map((id) => SHORT_LABEL[id].against);
    const badgesSim = AXIS_ORDER.filter((id) => notasSim[id] === "in-favor")
      .slice(0, 2)
      .map((id) => SHORT_LABEL[id].inFavor);

    const primeiroContra = AXIS_ORDER.find((id) => notasNao[id] === "against") ?? "blindagem";
    const acaoNao =
      notasNao.blindagem === "against"
        ? "votou pela blindagem"
        : `votou ${SHORT_LABEL[primeiroContra].contra.toLowerCase()}`;

    const legenda = `O voto é secreto, a escolha não: ${titleCase(simCand.name ?? simCand.nome)} defendeu quem trabalha. ${titleCase(naoCand.name ?? naoCand.nome)} ${acaoNao}. Este não, este sim.`;
    const storyTitle = "MEU VOTO É SECRETO MAS… 🤭";

    const rejectedObj = {
      name: naoCand.name ?? naoCand.nome,
      nome: naoCand.name ?? naoCand.nome,
      ballotNumber: naoCand.ballotNumber ?? naoCand.numero,
      numero: naoCand.ballotNumber ?? naoCand.numero,
      party: naoCand.party ?? naoCand.partido,
      partido: naoCand.party ?? naoCand.partido,
      officeShort: naoCand.officeShort ?? naoCand.cargoCurto,
      cargoCurto: naoCand.officeShort ?? naoCand.cargoCurto,
      photoSrc: naoCand.photoSrc ?? naoCand.fotoSrc,
      fotoSrc: naoCand.photoSrc ?? naoCand.fotoSrc,
      initials: naoCand.initials ?? naoCand.iniciais,
      iniciais: naoCand.initials ?? naoCand.iniciais,
      hue: naoCand.hue ?? naoCand.matiz,
      matiz: naoCand.hue ?? naoCand.matiz,
      inFavor: dirNao.inFavor,
      favor: dirNao.inFavor,
      against: dirNao.against,
      contra: dirNao.against,
      notes: naoCand.notes ?? naoCand.notas,
      notas: naoCand.notes ?? naoCand.notas,
      badges: badgesNao,
    };

    const chosenObj = {
      name: simCand.name ?? simCand.nome,
      nome: simCand.name ?? simCand.nome,
      ballotNumber: simCand.ballotNumber ?? simCand.numero,
      numero: simCand.ballotNumber ?? simCand.numero,
      party: simCand.party ?? simCand.partido,
      partido: simCand.party ?? simCand.partido,
      officeShort: simCand.officeShort ?? simCand.cargoCurto,
      cargoCurto: simCand.officeShort ?? simCand.cargoCurto,
      photoSrc: simCand.photoSrc ?? simCand.fotoSrc,
      fotoSrc: simCand.photoSrc ?? simCand.fotoSrc,
      initials: simCand.initials ?? simCand.iniciais,
      iniciais: simCand.initials ?? simCand.iniciais,
      hue: simCand.hue ?? simCand.matiz,
      matiz: simCand.hue ?? simCand.matiz,
      inFavor: dirSim.inFavor,
      favor: dirSim.inFavor,
      against: dirSim.against,
      contra: dirSim.against,
      notes: simCand.notes ?? simCand.notas,
      notas: simCand.notes ?? simCand.notas,
      badges: badgesSim,
    };

    return {
      type,
      tipo: type,
      stance,
      postura: stance,
      template,
      modelo: template,
      state,
      uf: state,
      link,
      url,
      meta: `Duelo · ${naoCand.officeShort ?? naoCand.cargoCurto} · ${state}`,
      storyTitle,
      storyTitulo: storyTitle,
      caption: legenda,
      legenda,
      duel: {
        rejected: rejectedObj,
        chosen: chosenObj,
        nao: rejectedObj,
        sim: chosenObj,
      },
      duelo: {
        rejected: rejectedObj,
        chosen: chosenObj,
        nao: rejectedObj,
        sim: chosenObj,
      },
    };
  }

  if (type === "issue") {
    const rawAxes = dados.axes ?? dados.eixos ?? [];
    const eixosIds = rawAxes
      .map((i) => (typeof i === "number" ? AXIS_ORDER[i] : i))
      .filter((id) => id && TOPIC_YES[id]);
    if (eixosIds.length === 0) eixosIds.push("blindagem");
    const unico = eixosIds.length === 1 ? eixosIds[0] : null;
    const faces = (dados.faces ?? [])
      .map((sq) => poolCandidatos.find((x) => x.sq === sq))
      .filter((f) => f && isEligibleForIssue(f, eixosIds, lado));

    const eixoObj = unico
      ? (appState.index.eixos.find((e) => e.id === unico) ?? appState.index.eixos[0])
      : null;
    const codigo = eixoObj ? (lado === "against" ? eixoObj.contraOEleitor : eixoObj.defendeOEleitor) : null;
    const faixa = unico ? `VOTOU ${codigo === 1 ? "SIM" : "NÃO"}` : "CONTRA VOCÊ";
    const tituloPauta = unico
      ? ISSUE_TITLE[unico][lado]
      : "QUEM VOTOU " + joinWithAnd(eixosIds.map((e) => SHORT_LABEL[e][lado])).toUpperCase();
    const fonteRotulo = "Votaram";
    const fonteBadges = eixosIds.map((e) => SHORT_LABEL[e][lado]);

    const legenda = `${titleCase(tituloPauta)} ${uf === "BR" ? "no Brasil" : `em ${uf}`}. Registro nominal do Congresso, nome por nome. Guarde os números.`;
    const storyTitle = "GUARDE OS NÚMEROS.";

    const facesList = faces.map((f) => ({
      name: f.name ?? f.nome,
      nome: f.name ?? f.nome,
      ballotNumber: f.ballotNumber ?? f.numero,
      numero: f.ballotNumber ?? f.numero,
      photoSrc: f.photoSrc ?? f.fotoSrc,
      fotoSrc: f.photoSrc ?? f.fotoSrc,
      initials: f.initials ?? f.iniciais,
      iniciais: f.initials ?? f.iniciais,
      hue: f.hue ?? f.matiz,
      matiz: f.hue ?? f.matiz,
      sq: f.sq,
    }));

    return {
      type,
      tipo: type,
      stance,
      postura: stance,
      template,
      modelo: template,
      state,
      uf: state,
      link,
      url,
      meta: `Pauta · ${state} · 2026`,
      storyTitle,
      storyTitulo: storyTitle,
      caption: legenda,
      legenda,
      grid: {
        title: tituloPauta,
        titulo: tituloPauta,
        banner: faixa,
        faixa,
        faces: facesList,
        sourceLabel: fonteRotulo,
        fonteRotulo,
        sourceBadges: fonteBadges,
        fonteBadges,
      },
      grade: {
        title: tituloPauta,
        titulo: tituloPauta,
        banner: faixa,
        faixa,
        faces: facesList,
        sourceLabel: fonteRotulo,
        fonteRotulo,
        sourceBadges: fonteBadges,
        fonteBadges,
      },
      eixosIds,
      axesIds: eixosIds,
    };
  }

  if (type === "list") {
    const rawAxes = dados.axes ?? dados.eixos ?? [];
    const eixosIds = rawAxes
      .map((i) => (typeof i === "number" ? AXIS_ORDER[i] : i))
      .filter((id) => id && TOPIC_YES[id]);
    const faces = (dados.faces ?? [])
      .map((sq) => poolCandidatos.find((x) => x.sq === sq))
      .filter((f) => f && isEligibleForList(f, eixosIds));
    const badgesUnion = [...new Set(faces.flatMap((f) => getDirection(f, "against", 8).inFavor))].slice(0, 6);
    const fonteRotulo = eixosIds.length ? "Votaram" : "Eles apoiaram";
    const fonteBadges = eixosIds.length ? eixosIds.map((e) => SHORT_LABEL[e].contra) : badgesUnion;

    const legenda = eixosIds.length
      ? `${faces.length} candidaturas ${uf === "BR" ? "do Brasil" : `de ${uf}`} que votaram ${joinWithAnd(eixosIds.map((e) => SHORT_LABEL[e].contra.toLowerCase()))}, nome por nome, com registro nominal do Congresso. Meu voto é secreto — mas não vai pra nenhum destes.`
      : `${faces.length} candidaturas ${uf === "BR" ? "do Brasil" : `de ${uf}`} que votaram contra quem trabalha, nome por nome, com registro nominal do Congresso. Meu voto é secreto — mas não vai pra nenhum destes.`;

    const storyTitle = "NENHUM DESTES. 🤭";

    const facesList = faces.map((f) => ({
      name: f.name ?? f.nome,
      nome: f.name ?? f.nome,
      ballotNumber: f.ballotNumber ?? f.numero,
      numero: f.ballotNumber ?? f.numero,
      photoSrc: f.photoSrc ?? f.fotoSrc,
      fotoSrc: f.photoSrc ?? f.fotoSrc,
      initials: f.initials ?? f.iniciais,
      iniciais: f.initials ?? f.iniciais,
      hue: f.hue ?? f.matiz,
      matiz: f.hue ?? f.matiz,
      sq: f.sq,
    }));

    return {
      type,
      tipo: type,
      stance,
      postura: stance,
      template,
      modelo: template,
      state,
      uf: state,
      link,
      url,
      meta: `Lista · ${state} · 2026`,
      storyTitle,
      storyTitulo: storyTitle,
      caption: legenda,
      legenda,
      grid: {
        title: "NÃO VOTO EM NENHUM DESTES",
        titulo: "NÃO VOTO EM NENHUM DESTES",
        banner: "CONTRA VOCÊ",
        faixa: "CONTRA VOCÊ",
        faces: facesList,
        sourceLabel: fonteRotulo,
        fonteRotulo,
        sourceBadges: fonteBadges,
        fonteBadges,
      },
      grade: {
        title: "NÃO VOTO EM NENHUM DESTES",
        titulo: "NÃO VOTO EM NENHUM DESTES",
        banner: "CONTRA VOCÊ",
        faixa: "CONTRA VOCÊ",
        faces: facesList,
        sourceLabel: fonteRotulo,
        fonteRotulo,
        sourceBadges: fonteBadges,
        fonteBadges,
      },
      eixosIds,
      axesIds: eixosIds,
    };
  }

  throw new Error(`Tipo desconhecido: ${type}`);
}

function openComposer(vm, postura, tipo = "candidate", extra = {}) {
  const tipoMap = { candidato: "candidate", duelo: "duel", pauta: "issue", lista: "list" };
  const type = tipoMap[tipo] ?? tipo;
  appState.draft = {
    sq: vm.sq,
    uf: (vm.state ?? vm.uf) === "BR" ? appState.state : (vm.state ?? vm.uf),
    state: (vm.state ?? vm.uf) === "BR" ? appState.state : (vm.state ?? vm.uf),
    postura,
    stance: postura,
    tipo: type,
    type,
    modelo: "booth",
    template: "booth",
    motivos: null,
    reasons: null,
    oponente: null,
    opponent: null,
    eixosPauta: [],
    issueAxes: [],
    listaSel: null,
    selectedList: null,
    busca: "",
    search: "",
    buscaAberta: false,
    searchOpen: false,
    ...extra,
  };
  location.hash = "#/novo";
}

function showScreen(nomeTela) {
  if (appState.scanStream) {
    for (const track of appState.scanStream.getTracks()) track.stop();
    appState.scanStream = null;
  }
  if (appState.scanInterval) {
    clearInterval(appState.scanInterval);
    appState.scanInterval = null;
  }

  const screens = document.querySelectorAll(".screen");
  for (const screen of screens) {
    if (screen.dataset.tela === nomeTela) {
      screen.removeAttribute("hidden");
    } else {
      screen.setAttribute("hidden", "");
    }
  }

  const navAbas = document.getElementById("tabs");
  const abasVisiveis = ["catalogo", "radar", "criar", "scan"].includes(nomeTela);
  if (abasVisiveis) {
    navAbas.removeAttribute("hidden");
    if (nomeTela === "scan") {
      navAbas.style.background = "#0e0d12";
      navAbas.style.borderTopColor = "#2a2733";
    } else {
      navAbas.style.background = "var(--paper)";
      navAbas.style.borderTopColor = "rgba(19, 18, 24, 0.15)";
    }

    const btnCat = document.getElementById("tab-catalog");
    const btnCriar = document.getElementById("tab-create");
    const btnRad = document.getElementById("tab-radar");

    btnCat.classList.toggle("active", nomeTela === "catalogo");
    btnCriar.classList.toggle("active", nomeTela === "criar");
    btnRad.classList.toggle("active", nomeTela === "radar");

    btnCat.style.color =
      nomeTela === "catalogo" ? "var(--red)" : nomeTela === "scan" ? "#a9a3b5" : "var(--muted)";
    btnRad.style.color =
      nomeTela === "radar" ? "var(--red)" : nomeTela === "scan" ? "#a9a3b5" : "var(--muted)";
    btnCriar.style.background = nomeTela === "criar" ? "var(--red)" : "var(--ink)";
  } else {
    navAbas.setAttribute("hidden", "");
  }
}

function renderOnboarding() {
  showScreen("onboarding");
  const grade = document.getElementById("onboarding-state-grid");
  grade.replaceChildren();

  const ufsDisponiveis = appState.index.ufs.filter((u) => u.sigla !== "BR");
  let ufSel = appState.state && appState.state !== "BR" ? appState.state : "SP";

  function atualizarBotao() {
    document.getElementById("btn-enter-booth").textContent = `ENTRAR NA CABINE · ${ufSel}`;
    document.getElementById("btn-enter-all").textContent =
      `Ver todas as ${formatNumberBr(appState.index.totalCandidatos)} candidaturas do Brasil mesmo assim`;
  }

  for (const item of ufsDisponiveis) {
    const btn = createElement("button", "btn-state", item.sigla);
    if (item.sigla === ufSel) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      ufSel = item.sigla;
      for (const b of grade.children) b.classList.remove("selected");
      btn.classList.add("selected");
      atualizarBotao();
    });
    grade.appendChild(btn);
  }

  atualizarBotao();

  document.getElementById("btn-enter-booth").onclick = () => {
    appState.state = ufSel;
    appState.allStates = false;
    localStorage.removeItem(STORAGE_ALL_STATES);
    localStorage.setItem(STORAGE_STATE, ufSel);
    appState.section = "historico";
    location.hash = "#/catalogo";
  };

  document.getElementById("btn-enter-all").onclick = () => {
    appState.state = ufSel;
    appState.allStates = true;
    localStorage.setItem(STORAGE_ALL_STATES, "1");
    localStorage.setItem(STORAGE_STATE, ufSel);
    appState.section = "todos";
    location.hash = "#/catalogo";
  };
}

let debounceSearchTimer = null;

async function renderCatalog() {
  if (!appState.state || appState.state === "BR") {
    location.replace("#/onboarding");
    return;
  }

  if (appState.allStates) {
    await loadAllStates();
  } else {
    await loadState("BR");
    await loadState(appState.state);
  }

  showScreen("catalogo");

  const ufObj = appState.index.ufs.find((u) => u.sigla === appState.state) ?? { candidatos: 0, comFicha: 0 };
  const brObj = appState.index.ufs.find((u) => u.sigla === "BR") ?? { candidatos: 0, comFicha: 0 };
  const comFichaTotal = appState.allStates ? appState.index.totalComFicha : ufObj.comFicha + brObj.comFicha;
  const totalCandidaturas = appState.allStates
    ? appState.index.totalCandidatos
    : ufObj.candidatos + brObj.candidatos;

  document.getElementById("btn-catalog-state").textContent = appState.allStates
    ? "Brasil ▾"
    : `${appState.state} ▾`;
  document.getElementById("btn-catalog-state").onclick = () => {
    location.hash = "#/onboarding";
  };

  document.getElementById("btn-catalog-scan").onclick = () => {
    location.hash = "#/scan";
  };

  document.getElementById("btn-logo-catalog").onclick = () => {
    location.hash = "#/catalogo";
  };

  const btnHist = document.getElementById("btn-section-history");
  const btnTodos = document.getElementById("btn-section-all");

  btnHist.textContent = `Com histórico · ${formatNumberBr(comFichaTotal)}`;
  btnTodos.textContent = `Todos · ${formatNumberBr(totalCandidaturas)}`;

  btnHist.classList.toggle("active", appState.section === "historico");
  btnTodos.classList.toggle("active", appState.section === "todos");

  btnHist.onclick = () => {
    appState.section = "historico";
    appState.limit = INITIAL_LIMIT;
    btnHist.classList.add("active");
    btnTodos.classList.remove("active");
    updateCatalogList();
  };

  btnTodos.onclick = () => {
    appState.section = "todos";
    appState.limit = INITIAL_LIMIT;
    btnTodos.classList.add("active");
    btnHist.classList.remove("active");
    updateCatalogList();
  };

  const inputBusca = document.getElementById("catalog-search");
  const chipLcd = document.getElementById("lcd-search-chip");
  const btnLimpar = document.getElementById("btn-clear-search");

  inputBusca.value = appState.textFilter;
  chipLcd.style.display =
    /^\d+$/.test(appState.textFilter.trim()) && appState.textFilter.trim() !== "" ? "inline-block" : "none";
  chipLcd.textContent = appState.textFilter.trim();
  btnLimpar.style.display = appState.textFilter !== "" ? "grid" : "none";

  inputBusca.oninput = (e) => {
    clearTimeout(debounceSearchTimer);
    debounceSearchTimer = setTimeout(() => {
      appState.textFilter = e.target.value;
      appState.limit = INITIAL_LIMIT;
      chipLcd.style.display =
        /^\d+$/.test(appState.textFilter.trim()) && appState.textFilter.trim() !== ""
          ? "inline-block"
          : "none";
      chipLcd.textContent = appState.textFilter.trim();
      btnLimpar.style.display = appState.textFilter !== "" ? "grid" : "none";
      updateCatalogList();
    }, 140);
  };

  btnLimpar.onclick = () => {
    appState.textFilter = "";
    inputBusca.value = "";
    chipLcd.style.display = "none";
    btnLimpar.style.display = "none";
    appState.limit = INITIAL_LIMIT;
    updateCatalogList();
  };

  document.getElementById("btn-open-filters").onclick = () => {
    openFilterSheet();
  };

  updateFilterBadge();
  updateCatalogList();
}

function updateFilterBadge() {
  const cracha = document.getElementById("filter-badge");
  let n = 0;
  if (appState.sort !== "against") n++;
  if (appState.office !== "todos") n++;
  if (appState.profile !== "todos") n++;
  if (n > 0) {
    cracha.textContent = String(n);
    cracha.style.display = "inline-block";
  } else {
    cracha.style.display = "none";
  }
}

function openFilterSheet() {
  const dialog = document.getElementById("filter-sheet");
  const gOrdem = document.getElementById("filters-group-sort");
  const gCargo = document.getElementById("filters-group-office");
  const gPerfil = document.getElementById("filters-group-profile");

  gOrdem.replaceChildren();
  gCargo.replaceChildren();
  gPerfil.replaceChildren();

  const ordens = [
    ["against", "Mais contra o eleitor"],
    ["in-favor", "Mais a favor"],
    ["numero", "Número"],
  ];
  for (const [chave, rotulo] of ordens) {
    const btn = createElement("button", "option-chip" + (appState.sort === chave ? " active" : ""), rotulo);
    btn.onclick = () => {
      appState.sort = chave;
      for (const b of gOrdem.children) b.classList.remove("active");
      btn.classList.add("active");
      updateCatalogList();
      updateFilterBadge();
    };
    gOrdem.appendChild(btn);
  }

  const cargos = [
    ["todos", "Todos os cargos"],
    ["6", "Dep. Federal"],
    ["5", "Senador"],
    ["3", "Governador"],
  ];
  for (const [chave, rotulo] of cargos) {
    const btn = createElement("button", "option-chip" + (appState.office === chave ? " active" : ""), rotulo);
    btn.onclick = () => {
      appState.office = chave;
      for (const b of gCargo.children) b.classList.remove("active");
      btn.classList.add("active");
      updateCatalogList();
      updateFilterBadge();
    };
    gCargo.appendChild(btn);
  }

  const perfis = [
    ["todos", "Todos"],
    ["novo", "Estreante"],
    ["reeleicao", "Reeleição"],
    ["outro", "Já teve mandato"],
  ];
  for (const [chave, rotulo] of perfis) {
    const btn = createElement(
      "button",
      "option-chip" + (appState.profile === chave ? " active" : ""),
      rotulo,
    );
    btn.onclick = () => {
      appState.profile = chave;
      for (const b of gPerfil.children) b.classList.remove("active");
      btn.classList.add("active");
      updateCatalogList();
      updateFilterBadge();
    };
    gPerfil.appendChild(btn);
  }

  document.getElementById("btn-clear-filters").onclick = () => {
    appState.sort = "against";
    appState.office = "todos";
    appState.profile = "todos";
    for (const b of gOrdem.children) b.classList.toggle("active", b.textContent === "Mais contra o eleitor");
    for (const b of gCargo.children) b.classList.toggle("active", b.textContent === "Todos os cargos");
    for (const b of gPerfil.children) b.classList.toggle("active", b.textContent === "Todos");
    updateFilterBadge();
    updateCatalogList();
  };

  document.getElementById("btn-close-filters").onclick = () => {
    dialog.close();
  };

  dialog.showModal();
}

function updateCatalogList() {
  const contagemEl = document.getElementById("catalog-count");
  const listaEl = document.getElementById("catalog-list");
  const btnMais = document.getElementById("btn-load-more");

  const candidatos = appState.allStates ? getAllCandidatesPool() : getCandidatePool(appState.state);
  const q = flatten(appState.textFilter.trim());
  const numerico = /^\d+$/.test(q);

  const filtrados = candidatos.filter((c) => {
    if (appState.section === "historico" && !c.temFicha) return false;
    if (appState.office !== "todos" && String(c.cargo) !== appState.office) return false;
    if (appState.profile !== "todos" && c.perfil !== appState.profile) return false;
    if (q === "") return true;
    if (numerico) return String(c.ballotNumber ?? c.numero).startsWith(q);
    return flatten(c.name ?? c.nome).includes(q) || flatten(c.fullName ?? c.nomeCompleto).includes(q);
  });

  filtrados.sort((a, b) => {
    if (appState.sort === "against" || appState.sort === "against") {
      return (
        (b.against ?? b.contra) - (a.against ?? a.contra) ||
        (a.inFavor ?? a.def) - (b.inFavor ?? b.def) ||
        (a.ballotNumber ?? a.numero) - (b.ballotNumber ?? b.numero)
      );
    }
    if (appState.sort === "in-favor" || appState.sort === "inFavor") {
      return (
        (b.inFavor ?? b.def) - (a.inFavor ?? a.def) ||
        (a.against ?? a.contra) - (b.against ?? b.contra) ||
        (a.ballotNumber ?? a.numero) - (b.ballotNumber ?? b.numero)
      );
    }
    return (a.ballotNumber ?? a.numero) - (b.ballotNumber ?? b.numero);
  });

  const totalFiltrado = filtrados.length;
  const ufObj = appState.index.ufs.find((u) => u.sigla === appState.state) ?? { candidatos: 0, comFicha: 0 };
  const brObj = appState.index.ufs.find((u) => u.sigla === "BR") ?? { candidatos: 0, comFicha: 0 };
  const comFicha = appState.allStates ? appState.index.totalComFicha : ufObj.comFicha + brObj.comFicha;
  const totalUf = appState.allStates ? appState.index.totalCandidatos : ufObj.candidatos + brObj.candidatos;

  if (appState.section === "historico") {
    contagemEl.textContent = `${totalFiltrado} de ${formatNumberBr(comFicha)} com histórico no Congresso · ${formatNumberBr(totalUf)} no total`;
  } else {
    contagemEl.textContent = `${formatNumberBr(totalFiltrado)} candidaturas ${appState.allStates ? "no Brasil" : `em ${appState.state}`} · ${formatNumberBr(comFicha)} com histórico`;
  }

  listaEl.replaceChildren();

  if (totalFiltrado === 0) {
    const vazio = createElement(
      "div",
      "card-no-dossier",
      "Nenhuma candidatura com histórico no Congresso bate com essa busca. Ausência de registro não é nota: estreantes aparecem em Todos.",
    );
    vazio.style.padding = "34px 20px";
    vazio.style.textAlign = "center";
    vazio.style.fontSize = "14px";
    listaEl.appendChild(vazio);
    btnMais.style.display = "none";
    return;
  }

  const exibidos = filtrados.slice(0, appState.limit);
  for (const c of exibidos) {
    const art = createElement("article", "candidate-card");

    const corpo = createElement("div", "card-body");
    corpo.onclick = () => {
      location.hash = `#/ficha/${c.sq}`;
    };

    const quadroFoto = createElement("div", "photo-frame");
    quadroFoto.style.background = `hsl(${c.hue ?? c.matiz} 30% 42%)`;
    if (c.photoSrc ?? c.fotoSrc) {
      const img = createElement("div", "photo-image");
      img.style.backgroundImage = `url("${c.photoSrc ?? c.fotoSrc}")`;
      quadroFoto.appendChild(img);
    } else {
      quadroFoto.appendChild(createElement("span", undefined, c.initials ?? c.iniciais));
    }
    corpo.appendChild(quadroFoto);

    const info = createElement("div", "card-info");

    const linhaNome = createElement("div", "card-name-row");
    linhaNome.appendChild(createElement("div", "card-name", c.name ?? c.nome));
    linhaNome.appendChild(createElement("span", "lcd-number", String(c.ballotNumber ?? c.numero)));
    info.appendChild(linhaNome);

    const meta = createElement("div", "card-meta");
    let metaTexto = `${c.party ?? c.partido} · ${c.officeShort ?? c.cargoCurto} · ${PROFILE_LABELS[c.profile ?? c.perfil] ?? c.profile ?? c.perfil}`;
    if (appState.allStates) metaTexto += ` · ${c.state ?? c.uf}`;
    meta.appendChild(createElement("span", undefined, metaTexto));
    if (c.onRadar ?? c.noRadar) {
      meta.appendChild(createElement("span", "radar-badge", "NO RADAR"));
    }
    info.appendChild(meta);

    if (c.hasDossier ?? c.temFicha) {
      const regua = createElement("div", "axes-ruler");
      for (const eixoId of AXIS_ORDER) {
        const seg = createElement("span", "ruler-seg");
        const est = (c.notes ?? c.notas)[eixoId];
        seg.style.background =
          est === "against"
            ? "var(--red)"
            : est === "in-favor"
              ? "var(--green)"
              : est === "mixed"
                ? "var(--mixed)"
                : "var(--none)";
        regua.appendChild(seg);
      }
      info.appendChild(regua);
      info.appendChild(createElement("div", "card-score", c.score ?? c.placar));
    } else {
      info.appendChild(
        createElement(
          "div",
          "card-no-dossier",
          "Sem histórico no Congresso — não é nota, é ausência de registro.",
        ),
      );
    }

    corpo.appendChild(info);
    art.appendChild(corpo);

    const botoes = createElement("div", "declaration-buttons");
    const btnNao = createElement("button", "btn-no-vote", "NÃO VOTO");
    btnNao.onclick = (e) => {
      e.stopPropagation();
      openComposer(c, "nao");
    };

    const btnVoto = createElement("button", "btn-vote", "VOTO");
    btnVoto.onclick = (e) => {
      e.stopPropagation();
      openComposer(c, "voto");
    };

    botoes.appendChild(btnNao);
    botoes.appendChild(btnVoto);
    art.appendChild(botoes);

    listaEl.appendChild(art);
  }

  if (totalFiltrado > appState.limit) {
    const resto = totalFiltrado - appState.limit;
    btnMais.textContent = `Carregar mais (${formatNumberBr(resto)})`;
    btnMais.style.display = "block";
    btnMais.onclick = () => {
      appState.limit += INITIAL_LIMIT;
      updateCatalogList();
    };
  } else {
    btnMais.style.display = "none";
  }
}

async function renderDossier(sqStr) {
  const sq = Number(sqStr);
  const siglaUf = stateFromSq(sq) || appState.state;
  await loadState("BR");
  await loadState(siglaUf);

  showScreen("ficha");

  const cands = getCandidatePool(siglaUf);
  const c = cands.find((x) => x.sq === sq);

  const container = document.getElementById("dossier-content");
  container.replaceChildren();

  const rotuloTopo = document.getElementById("dossier-top-label");
  rotuloTopo.textContent = `FICHA · ${siglaUf}`;

  document.getElementById("btn-dossier-back").onclick = () => {
    if (history.length > 1) history.back();
    else location.hash = "#/catalogo";
  };

  if (!c) {
    const err = createElement("div", undefined, `Candidatura ${sq} não encontrada.`);
    err.style.padding = "24px";
    err.style.color = "var(--muted)";
    const btnVoltar = createElement("button", "btn-load-more", "← Voltar ao catálogo");
    btnVoltar.onclick = () => {
      location.hash = "#/catalogo";
    };
    container.appendChild(err);
    container.appendChild(btnVoltar);
    return;
  }

  const hero = createElement("div", "dossier-hero");
  const fotoBox = createElement("div", "dossier-photo");
  fotoBox.style.background = `hsl(${c.hue ?? c.matiz} 30% 42%)`;
  if (c.photoSrc ?? c.fotoSrc) {
    const img = createElement("div", "photo-image");
    img.style.backgroundImage = `url("${c.photoSrc ?? c.fotoSrc}")`;
    fotoBox.appendChild(img);
  } else {
    fotoBox.appendChild(createElement("span", undefined, c.initials ?? c.iniciais));
  }
  hero.appendChild(fotoBox);

  const detalhes = createElement("div", "dossier-details");
  if (c.onRadar ?? c.noRadar) {
    detalhes.appendChild(createElement("span", "radar-badge", "NO RADAR"));
  }
  detalhes.appendChild(createElement("div", "dossier-name", c.name ?? c.nome));
  detalhes.appendChild(
    createElement(
      "div",
      "dossier-meta",
      `${c.party ?? c.partido} · ${c.officeShort ?? c.cargoCurto} · ${siglaUf}`,
    ),
  );

  let perfilTexto;
  const cargoNome = titleCase(c.officeShort ?? c.cargoCurto);
  const perfilVal = c.profile ?? c.perfil;
  const fichaVal = c.dossier ?? c.ficha;
  if (perfilVal === "reeleicao") {
    perfilTexto = `Tenta a reeleição · ${cargoNome} em exercício`;
  } else if (perfilVal === "outro" && fichaVal?.mandatoAtual) {
    const casaTxt = fichaVal.mandatoAtual === "camara" ? "Deputado federal" : "Senador";
    perfilTexto = `${casaTxt} em exercício · concorre a ${cargoNome}`;
  } else if (perfilVal === "outro" && (c.hasDossier ?? c.temFicha)) {
    perfilTexto = `Já teve mandato no Congresso · concorre a ${cargoNome}`;
  } else if (perfilVal === "outro") {
    perfilTexto = "Já teve mandato · sem votações no Congresso";
  } else {
    perfilTexto = "Estreante · sem mandato anterior registrado";
  }

  detalhes.appendChild(createElement("div", "dossier-profile-row", perfilTexto));
  detalhes.appendChild(createElement("div", "onboarding-state-legend", "número na urna"));
  detalhes.appendChild(createElement("span", "dossier-lcd", String(c.ballotNumber ?? c.numero)));
  hero.appendChild(detalhes);
  container.appendChild(hero);

  const blocoVotos = createElement("div", "axes-block");
  blocoVotos.appendChild(
    createElement(
      "div",
      "axes-title-block",
      `Como votou no Congresso · ${(c.hasDossier ?? c.temFicha) ? (c.score ?? c.placar) : "Sem histórico"}`,
    ),
  );

  if (!(c.hasDossier ?? c.temFicha)) {
    let msg;
    if (perfilVal === "novo") {
      msg =
        "Estreante: sem mandato anterior e sem votações nominais no Congresso. Não é nota baixa, é ausência de registro. Você ainda pode declarar; o post sai sem motivos.";
    } else {
      msg =
        "Teve mandato fora do Congresso (câmara municipal, prefeitura ou governo estadual), então não há votação nominal federal para mostrar. Você ainda pode declarar; o post sai sem motivos.";
    }
    const notaSem = createElement("div", undefined, msg);
    notaSem.style.padding = "14px";
    notaSem.style.background = "#fff";
    notaSem.style.border = "1.5px dashed rgba(19, 18, 24, 0.3)";
    notaSem.style.borderRadius = "8px";
    notaSem.style.fontSize = "13px";
    notaSem.style.lineHeight = "1.5";
    notaSem.style.color = "var(--body)";
    blocoVotos.appendChild(notaSem);
  } else {
    for (const eixo of appState.index.eixos) {
      const est = (c.notes ?? c.notas)[eixo.id] ?? "none";
      const stanceClass =
        est === "in-favor" ? "in-favor" : est === "against" ? "against" : est === "mixed" ? "mixed" : "none";
      const item = createElement("div", `dossier-axis-item ${stanceClass}`);

      const conteudo = createElement("div", undefined);
      conteudo.style.flex = "1";
      conteudo.style.minWidth = "0";

      let textoVoto = "Sem registro nestas votações";
      if (est === "against" || est === "in-favor") {
        textoVoto = VERB[eixo.id][est];
      } else if (est === "mixed") {
        textoVoto = "Votou nos dois lados";
      }

      conteudo.appendChild(createElement("div", "axis-item-text", textoVoto));
      const v = eixo.votacoes[0];
      const sub = v ? `${eixo.nome} · ${v.sim} Sim × ${v.nao} Não` : eixo.nome;
      conteudo.appendChild(createElement("div", "axis-item-sub", sub));
      const isSenado = String(v?.id || "").startsWith("SF-");
      const urlAta = isSenado
        ? `https://legis.senado.leg.br/dadosabertos/votacao?idProcesso=${v.idProcesso}`
        : `https://www.camara.leg.br/presenca-comissoes/votacao-portal?idVotacao=${v.id}`;
      const linkAta = createElement("a", undefined, "ata da votação ↗");
      linkAta.href = urlAta;
      linkAta.target = "_blank";
      linkAta.rel = "noopener noreferrer";
      linkAta.style.fontSize = "11px";
      linkAta.style.color = "var(--muted)";
      linkAta.style.textDecoration = "underline";
      linkAta.style.display = "inline-block";
      linkAta.style.marginTop = "2px";
      conteudo.appendChild(linkAta);
      item.appendChild(conteudo);
      blocoVotos.appendChild(item);
    }

    if (c.loyalty ?? c.fidelidade) {
      const notaFid = createElement(
        "div",
        "loyalty-score",
        `${c.loyalty ?? c.fidelidade} Fonte: votações nominais da Câmara dos Deputados e do Senado Federal.`,
      );
      blocoVotos.appendChild(notaFid);
    }
  }

  container.appendChild(blocoVotos);

  document.getElementById("btn-dossier-no-vote").onclick = () => {
    openComposer(c, "nao");
  };
  document.getElementById("btn-dossier-vote").onclick = () => {
    openComposer(c, "voto");
  };
}

function buildCandidateSearch(r, { pool, elegivel, aoEscolher, placeholder, vazio }) {
  const container = createElement("div", undefined);
  container.style.marginTop = "8px";

  if (!r.buscaAberta) {
    const btnAbrir = createElement("button", "btn-load-more", "+ Adicionar outro");
    btnAbrir.style.borderStyle = "dashed";
    btnAbrir.style.width = "100%";
    btnAbrir.onclick = () => {
      r.buscaAberta = true;
      r.searchOpen = true;
      renderComposer();
    };
    container.appendChild(btnAbrir);
    return container;
  }

  const caixa = createElement("div", undefined);
  caixa.style.border = "1.5px solid var(--ink)";
  caixa.style.borderRadius = "10px";
  caixa.style.padding = "10px";
  caixa.style.background = "#fff";

  const topo = createElement("div", undefined);
  topo.style.display = "flex";
  topo.style.gap = "8px";
  topo.style.alignItems = "center";
  topo.style.marginBottom = "8px";

  const input = document.createElement("input");
  input.type = "text";
  input.value = r.search ?? r.busca ?? "";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.style.flex = "1";
  input.style.padding = "8px 10px";
  input.style.border = "1px solid rgba(19, 18, 24, 0.2)";
  input.style.borderRadius = "6px";
  input.style.fontSize = "13px";
  input.style.fontFamily = "var(--font-body)";

  const btnFechar = createElement("button", undefined, "Fechar");
  btnFechar.style.background = "transparent";
  btnFechar.style.border = "none";
  btnFechar.style.fontSize = "12.5px";
  btnFechar.style.fontWeight = "700";
  btnFechar.style.color = "var(--muted)";
  btnFechar.style.cursor = "pointer";
  btnFechar.style.padding = "4px 8px";
  btnFechar.onclick = () => {
    r.buscaAberta = false;
    r.searchOpen = false;
    r.busca = "";
    r.search = "";
    renderComposer();
  };

  topo.appendChild(input);
  topo.appendChild(btnFechar);
  caixa.appendChild(topo);

  const containerResultados = createElement("div", undefined);
  containerResultados.style.display = "flex";
  containerResultados.style.flexDirection = "column";
  containerResultados.style.gap = "6px";
  caixa.appendChild(containerResultados);

  function renderizarResultados() {
    containerResultados.innerHTML = "";
    const q = flatten((r.search ?? r.busca ?? "").trim());
    if (!q) {
      const msgVazio = createElement("div", undefined, vazio);
      msgVazio.style.fontSize = "12px";
      msgVazio.style.color = "var(--muted)";
      msgVazio.style.padding = "6px 0";
      containerResultados.appendChild(msgVazio);
      return;
    }

    const filtrados = pool
      .filter(
        (c) =>
          elegivel(c) &&
          (/^\d+$/.test(q)
            ? String(c.ballotNumber ?? c.numero).startsWith(q)
            : flatten(c.name ?? c.nome).includes(q) || flatten(c.fullName ?? c.nomeCompleto).includes(q)),
      )
      .slice(0, 8);

    if (filtrados.length === 0) {
      const semResultados = createElement(
        "div",
        undefined,
        "Nenhuma candidatura elegível bate com essa busca.",
      );
      semResultados.style.fontSize = "12px";
      semResultados.style.color = "var(--muted)";
      semResultados.style.padding = "6px 0";
      containerResultados.appendChild(semResultados);
      return;
    }

    for (const c of filtrados) {
      const linha = createElement("div", undefined);
      linha.style.display = "flex";
      linha.style.alignItems = "center";
      linha.style.gap = "8px";
      linha.style.padding = "4px 0";
      linha.style.borderBottom = "1px solid rgba(19, 18, 24, 0.08)";

      const fotoQuadro = createElement("div", "photo-frame");
      fotoQuadro.style.width = "36px";
      fotoQuadro.style.height = "46px";
      fotoQuadro.style.backgroundColor = `hsl(${c.hue ?? c.matiz} 30% 42%)`;
      fotoQuadro.style.fontSize = "13px";
      fotoQuadro.textContent = c.initials ?? c.iniciais;
      if (c.photoSrc ?? c.fotoSrc) {
        const fotoImg = createElement("div", "photo-image");
        fotoImg.style.backgroundImage = `url("${c.photoSrc ?? c.fotoSrc}")`;
        fotoQuadro.appendChild(fotoImg);
      }
      linha.appendChild(fotoQuadro);

      const info = createElement("div", undefined);
      info.style.flex = "1";
      info.style.minWidth = "0";

      const nomeEl = createElement("div", undefined, c.name ?? c.nome);
      nomeEl.style.fontWeight = "800";
      nomeEl.style.fontSize = "13px";
      nomeEl.style.textTransform = "uppercase";
      nomeEl.style.color = "var(--ink)";
      nomeEl.style.overflow = "hidden";
      nomeEl.style.textOverflow = "ellipsis";
      nomeEl.style.whiteSpace = "nowrap";

      const subEl = createElement(
        "div",
        undefined,
        `${c.party ?? c.partido} · ${c.ballotNumber ?? c.numero} · ${c.state ?? c.uf}`,
      );
      subEl.style.fontSize = "11.5px";
      subEl.style.color = "var(--muted)";

      info.appendChild(nomeEl);
      info.appendChild(subEl);
      linha.appendChild(info);

      const btnAdd = createElement("button", "btn-pill", "Adicionar");
      btnAdd.style.flexShrink = "0";
      btnAdd.style.padding = "4px 10px";
      btnAdd.style.fontSize = "11.5px";
      btnAdd.onclick = () => aoEscolher(c);
      linha.appendChild(btnAdd);

      containerResultados.appendChild(linha);
    }
  }

  input.oninput = () => {
    r.busca = input.value;
    r.search = input.value;
    renderizarResultados();
  };

  renderizarResultados();
  container.appendChild(caixa);

  queueMicrotask(() => {
    if (input.isConnected) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  return container;
}

async function renderCreateHub() {
  if (!appState.state || appState.state === "BR") appState.state = "SP";
  await loadState("BR");
  await loadState(appState.state);

  showScreen("criar");

  const cands = getCandidatePool(appState.state);
  const ranking = cands
    .filter((c) => (c.hasDossier ?? c.temFicha) && (c.against ?? c.contra) >= 1)
    .sort(
      (a, b) =>
        (b.against ?? b.contra) - (a.against ?? a.contra) || (a.inFavor ?? a.def) - (b.inFavor ?? b.def),
    );
  const defensores = cands.filter(
    (c) => (c.hasDossier ?? c.temFicha) && (c.inFavor ?? c.def) >= 3 && (c.against ?? c.contra) === 0,
  );
  const top1 = ranking[0] ??
    cands[0] ?? {
      sq: 0,
      name: "",
      nome: "",
      ballotNumber: 0,
      numero: 0,
      party: "",
      partido: "",
      cargoCurto: "Candidato",
      officeShort: "Candidato",
      notas: {},
      notes: {},
    };
  const topDef = defensores[0] ?? cands[1] ?? top1;

  document.getElementById("hub-list-desc").textContent =
    `Até 9 de uma vez. Já vem com nomes selecionados do radar de ${appState.state} — você só escolhe quem entra.`;

  document.getElementById("hub-option-candidate").onclick = () => {
    location.hash = "#/catalogo";
  };

  document.getElementById("hub-option-duel").onclick = () => {
    openComposer(top1, "nao", "duel");
  };

  document.getElementById("hub-option-list").onclick = () => {
    openComposer(top1, "nao", "list");
  };

  document.getElementById("hub-option-issue").onclick = () => {
    openComposer(top1, "nao", "issue", { eixosPauta: ["blindagem"], issueAxes: ["blindagem"] });
  };

  document.getElementById("hub-option-scan").onclick = () => {
    location.hash = "#/scan";
  };

  const miniPostCand = buildPost(
    { type: "candidate", stance: "nao", template: "booth", sq: top1.sq, state: appState.state },
    cands,
  );
  const miniPostDuelo = buildPost(
    {
      type: "duel",
      stance: "nao",
      template: "booth",
      rejected: top1.sq,
      chosen: topDef.sq,
      state: appState.state,
    },
    cands,
  );
  const miniPostLista = buildPost(
    {
      type: "list",
      stance: "nao",
      template: "booth",
      faces: ranking.slice(0, 6).map((c) => c.sq),
      state: appState.state,
    },
    cands,
  );
  const miniPostPauta = buildPost(
    {
      type: "issue",
      stance: "nao",
      template: "booth",
      axes: [0],
      faces: cands
        .filter((c) => (c.notes ?? c.notas).blindagem === "against")
        .slice(0, 6)
        .map((c) => c.sq),
      state: appState.state,
    },
    cands,
  );

  drawCard(document.getElementById("mini-candidate"), miniPostCand).catch(() => {});
  drawCard(document.getElementById("mini-duel"), miniPostDuelo).catch(() => {});
  drawCard(document.getElementById("mini-list"), miniPostLista).catch(() => {});
  drawCard(document.getElementById("mini-issue"), miniPostPauta).catch(() => {});
}

let debounceComposerTimer = null;

async function renderComposer() {
  if (!appState.draft) {
    location.replace("#/criar");
    return;
  }

  const r = appState.draft;
  const uf = r.state || r.uf || appState.state || "SP";
  if (appState.allStates) await loadAllStates();
  else {
    await loadState("BR");
    await loadState(uf);
  }

  showScreen("novo");

  const cands = getCandidatePool(uf);
  const candsBusca = appState.allStates ? getAllCandidatesPool() : cands;
  const sel = cands.find((c) => c.sq === r.sq) ?? cands[0];
  const lado = (r.stance ?? r.postura) === "nao" ? "against" : "in-favor";

  const curType = r.type ?? r.tipo;
  const tituloTopo = document.getElementById("new-top-title");
  tituloTopo.textContent = curType === "list" || curType === "lista" ? "LISTA NO RADAR" : "NOVO POST";

  document.getElementById("btn-new-back").onclick = () => {
    if (history.length > 1) history.back();
    else location.hash = "#/catalogo";
  };

  const controlesEl = document.getElementById("new-controls");
  controlesEl.replaceChildren();

  if (curType !== "list" && curType !== "lista") {
    const grupoPostura = createElement("div", "declaration-buttons");
    const btnNao = createElement("button", "btn-no-vote", "NÃO VOTO");
    const btnVoto = createElement("button", "btn-vote", "VOTO");

    const curStance = r.stance ?? r.postura;
    if (curStance === "nao") {
      btnNao.style.background = "var(--red)";
      btnNao.style.color = "#fff";
      btnVoto.style.background = "transparent";
      btnVoto.style.color = "var(--green)";
    } else {
      btnNao.style.background = "transparent";
      btnNao.style.color = "var(--red)";
      btnVoto.style.background = "var(--green)";
      btnVoto.style.color = "#fff";
    }

    btnNao.onclick = () => {
      r.postura = "nao";
      r.stance = "nao";
      r.motivos = null;
      r.reasons = null;
      r.oponente = null;
      r.opponent = null;
      r.listaSel = null;
      r.selectedList = null;
      renderComposer();
    };

    btnVoto.onclick = () => {
      r.postura = "voto";
      r.stance = "voto";
      r.motivos = null;
      r.reasons = null;
      r.oponente = null;
      r.opponent = null;
      r.listaSel = null;
      r.selectedList = null;
      renderComposer();
    };

    grupoPostura.appendChild(btnNao);
    grupoPostura.appendChild(btnVoto);
    controlesEl.appendChild(grupoPostura);

    const blocoFormato = createElement("div", "axes-block");
    blocoFormato.appendChild(createElement("div", "axes-title-block", "Formato"));
    const grupoTipos = createElement("div", "chip-group");

    const oponentesDisp = cands.filter((c) => isEligibleOpponent(c, sel.sq, r.stance ?? r.postura));

    const tipos = [
      ["candidate", "Candidato"],
      ["duel", "Duelo"],
      ["issue", "Pauta"],
    ];

    for (const [tKey, tRot] of tipos) {
      const isCur =
        curType === tKey ||
        (tKey === "candidate" && curType === "candidato") ||
        (tKey === "duel" && curType === "duelo") ||
        (tKey === "issue" && curType === "pauta");
      const btn = createElement("button", "option-chip" + (isCur ? " active" : ""), tRot);
      if (tKey === "duel" && oponentesDisp.length === 0) {
        btn.disabled = true;
        btn.title = `Sem oponente com histórico em ${uf}`;
        btn.style.opacity = "0.4";
        btn.style.cursor = "not-allowed";
      }
      btn.onclick = () => {
        r.tipo = tKey;
        r.type = tKey;
        const pautaAxes = r.issueAxes ?? r.eixosPauta;
        if (tKey === "issue" && (!pautaAxes || pautaAxes.length === 0)) {
          r.eixosPauta = ["blindagem"];
          r.issueAxes = ["blindagem"];
        }
        renderComposer();
      };
      grupoTipos.appendChild(btn);
    }
    blocoFormato.appendChild(grupoTipos);
    controlesEl.appendChild(blocoFormato);
  }

  if (curType === "candidate" || curType === "candidato") {
    const blocoMotivos = createElement("div", "axes-block");
    const headerMotivos = createElement("div", "top-bar");
    const motivosDisp = AXIS_ORDER.filter((id) => (sel.notes ?? sel.notas)[id] === lado);
    const motivosSel = r.reasons ?? r.motivos ?? motivosDisp.slice(0, 4);

    headerMotivos.appendChild(createElement("span", "axes-title-block", "Motivos · votações nominais"));
    headerMotivos.appendChild(createElement("span", "axes-title-block", `${motivosSel.length}/4`));
    blocoMotivos.appendChild(headerMotivos);

    if (motivosDisp.length === 0) {
      blocoMotivos.appendChild(
        createElement(
          "p",
          "card-no-dossier",
          "Nenhuma votação sustenta essa postura para esta candidatura. O post sai sem motivos — e a régua é a mesma para todo mundo.",
        ),
      );
    } else {
      const grupoM = createElement("div", "chip-group");
      for (const eixoId of motivosDisp) {
        const ativo = motivosSel.includes(eixoId);
        const curStance = r.stance ?? r.postura;
        const classeAtivo = ativo ? (curStance === "nao" ? " active-no" : " active-vote") : "";
        const btn = createElement("button", "reason-chip" + classeAtivo, SHORT_LABEL[eixoId][lado]);
        btn.onclick = () => {
          if (ativo) {
            const next = motivosSel.filter((x) => x !== eixoId);
            r.motivos = next;
            r.reasons = next;
          } else if (motivosSel.length < 4) {
            const next = [...motivosSel, eixoId];
            r.motivos = next;
            r.reasons = next;
          }
          renderComposer();
        };
        grupoM.appendChild(btn);
      }
      blocoMotivos.appendChild(grupoM);
    }
    controlesEl.appendChild(blocoMotivos);
  } else if (curType === "duel" || curType === "duelo") {
    const blocoDuelo = createElement("div", "axes-block");
    const rotuloDuelo =
      (r.stance ?? r.postura) === "nao"
        ? "Este sim — quem defendeu o eleitor"
        : "Este não — quem votou contra o eleitor";
    blocoDuelo.appendChild(createElement("div", "axes-title-block", rotuloDuelo));

    const elegiveis = cands.filter((c) => isEligibleOpponent(c, sel.sq, r.stance ?? r.postura));
    const top8 = elegiveis.slice(0, 8);
    const selOponente =
      (r.opponent ?? r.oponente) ? candsBusca.find((c) => c.sq === (r.opponent ?? r.oponente)) : null;
    const oponentes = [...top8];
    if (
      selOponente &&
      isEligibleOpponent(selOponente, sel.sq, r.stance ?? r.postura) &&
      !oponentes.some((c) => c.sq === selOponente.sq)
    ) {
      oponentes.unshift(selOponente);
    }

    const selOponenteSq = r.opponent ?? r.oponente ?? oponentes[0]?.sq;
    r.oponente = selOponenteSq;
    r.opponent = selOponenteSq;

    const carrossel = createElement("div", undefined);
    carrossel.style.display = "flex";
    carrossel.style.gap = "8px";
    carrossel.style.overflowX = "auto";
    carrossel.style.paddingBottom = "4px";

    for (const op of oponentes) {
      const cardOp = createElement("button", undefined);
      cardOp.style.flexShrink = "0";
      cardOp.style.width = "78px";
      cardOp.style.padding = "0";
      cardOp.style.border =
        op.sq === selOponenteSq ? "2px solid var(--ink)" : "1.5px solid rgba(19, 18, 24, 0.15)";
      cardOp.style.borderRadius = "8px";
      cardOp.style.background = "#fff";
      cardOp.style.cursor = "pointer";
      cardOp.style.overflow = "hidden";
      cardOp.style.textAlign = "left";

      const fotoDiv = createElement("div", undefined);
      fotoDiv.style.width = "100%";
      fotoDiv.style.height = "84px";
      fotoDiv.style.backgroundColor = `hsl(${op.hue ?? op.matiz} 30% 42%)`;
      if (op.photoSrc ?? op.fotoSrc) {
        fotoDiv.style.backgroundImage = `url("${op.photoSrc ?? op.fotoSrc}")`;
        fotoDiv.style.backgroundSize = "cover";
        fotoDiv.style.backgroundPosition = "center";
      }
      cardOp.appendChild(fotoDiv);

      const nomeDiv = createElement("div", undefined, op.name ?? op.nome);
      nomeDiv.style.padding = "5px 6px";
      nomeDiv.style.fontSize = "10px";
      nomeDiv.style.fontWeight = "800";
      nomeDiv.style.lineHeight = "1.15";
      nomeDiv.style.textTransform = "uppercase";
      nomeDiv.style.color = "var(--ink)";
      nomeDiv.style.height = "34px";
      nomeDiv.style.overflow = "hidden";
      cardOp.appendChild(nomeDiv);

      cardOp.onclick = () => {
        r.oponente = op.sq;
        r.opponent = op.sq;
        renderComposer();
      };
      carrossel.appendChild(cardOp);
    }

    blocoDuelo.appendChild(carrossel);
    const buscaDuelo = buildCandidateSearch(r, {
      pool: candsBusca,
      elegivel: (c) => isEligibleOpponent(c, sel.sq, r.stance ?? r.postura),
      aoEscolher: (c) => {
        r.oponente = c.sq;
        r.opponent = c.sq;
        r.buscaAberta = false;
        r.searchOpen = false;
        r.busca = "";
        r.search = "";
        renderComposer();
      },
      placeholder: `Nome ou número — quem ${(r.stance ?? r.postura) === "nao" ? "defendeu" : "votou contra"} o eleitor`,
      vazio: `Digite para buscar entre as candidaturas com histórico ${appState.allStates ? "do Brasil" : `de ${uf}`}.`,
    });
    blocoDuelo.appendChild(buscaDuelo);
    controlesEl.appendChild(blocoDuelo);
  }

  if (curType === "issue" || curType === "pauta" || curType === "list" || curType === "lista") {
    const isPauta = curType === "issue" || curType === "pauta";
    const blocoPauta = createElement("div", "axes-block");
    const topoBarra = createElement("div", "top-bar");
    const tituloTexto = isPauta ? `Pauta · quem votou assim em ${uf}` : `Motivos · filtra o radar de ${uf}`;
    const curAxes = r.issueAxes ?? r.eixosPauta ?? [];
    topoBarra.appendChild(createElement("span", "axes-title-block", tituloTexto));
    topoBarra.appendChild(createElement("span", "axes-title-block", `${curAxes.length}/8`));
    blocoPauta.appendChild(topoBarra);

    const grupoEixos = createElement("div", "chip-group");
    for (const e of appState.index.eixos) {
      const ativo = curAxes.includes(e.id);
      const btn = createElement("button", "option-chip" + (ativo ? " active" : ""), e.nome);
      btn.onclick = () => {
        if (ativo && isPauta && curAxes.length === 1) {
          toast("A pauta precisa de pelo menos um motivo.");
          return;
        }
        let next;
        if (ativo) {
          next = curAxes.filter((id) => id !== e.id);
        } else if (curAxes.length < 8) {
          next = [...curAxes, e.id];
        } else {
          next = [...curAxes];
        }
        r.eixosPauta = next;
        r.issueAxes = next;
        r.listaSel = null;
        r.selectedList = null;
        r.busca = "";
        r.search = "";
        r.buscaAberta = false;
        r.searchOpen = false;
        renderComposer();
      };
      grupoEixos.appendChild(btn);
    }
    blocoPauta.appendChild(grupoEixos);
    controlesEl.appendChild(blocoPauta);

    const blocoGrade = createElement("div", "axes-block");
    const tituloGrade = isPauta ? `Quem aparece · votaram assim em ${uf}` : `Quem entra na lista · ${uf}`;

    const gradeBase = isPauta
      ? cands.filter((c) => isEligibleForIssue(c, curAxes, lado))
      : cands
          .filter((c) => isEligibleForList(c, curAxes))
          .sort(
            (a, b) =>
              (b.against ?? b.contra) - (a.against ?? a.contra) ||
              (a.inFavor ?? a.def) - (b.inFavor ?? b.def),
          );

    const listaSel = r.selectedList ?? r.listaSel ?? gradeBase.slice(0, 6).map((c) => c.sq);
    r.listaSel = listaSel;
    r.selectedList = listaSel;

    const headerGrade = createElement("div", "top-bar");
    headerGrade.appendChild(createElement("span", "axes-title-block", tituloGrade));
    headerGrade.appendChild(createElement("span", "axes-title-block", `${listaSel.length}/9`));
    blocoGrade.appendChild(headerGrade);

    if (gradeBase.length === 0 && listaSel.length === 0) {
      const vazioGrid = createElement(
        "div",
        "card-no-dossier",
        `Ninguém em ${uf} votou assim em todos os motivos escolhidos. Tire um motivo ou busque em outro estado.`,
      );
      vazioGrid.style.padding = "24px 0";
      vazioGrid.style.textAlign = "center";
      blocoGrade.appendChild(vazioGrid);
    } else {
      const grid = createElement("div", undefined);
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "repeat(4, 1fr)";
      grid.style.gap = "8px";

      const top12 = gradeBase.slice(0, 12);
      const adicionaisSq = listaSel.filter((sq) => !top12.some((c) => c.sq === sq));
      const adicionaisCands = adicionaisSq.map((sq) => candsBusca.find((c) => c.sq === sq)).filter(Boolean);
      const exibidosGrade = [...top12, ...adicionaisCands];

      for (const c of exibidosGrade) {
        const ativo = listaSel.includes(c.sq);
        const card = createElement("button", undefined);
        card.style.padding = "0";
        card.style.border = ativo ? "2.5px solid var(--red)" : "1.5px solid rgba(19,18,24,.15)";
        card.style.borderRadius = "8px";
        card.style.background = "#fff";
        card.style.cursor = "pointer";
        card.style.overflow = "hidden";
        card.style.textAlign = "left";
        card.style.opacity = ativo ? "1" : "0.55";

        const foto = createElement("div", undefined);
        foto.style.width = "100%";
        foto.style.height = "76px";
        foto.style.backgroundColor = `hsl(${c.hue ?? c.matiz} 30% 42%)`;
        if (c.photoSrc ?? c.fotoSrc) {
          foto.style.backgroundImage = `url("${c.photoSrc ?? c.fotoSrc}")`;
          foto.style.backgroundSize = "cover";
          foto.style.backgroundPosition = "center";
        }
        if ((r.stance ?? r.postura) === "nao") foto.style.filter = "grayscale(1)";
        card.appendChild(foto);

        const nome = createElement("div", undefined, c.name ?? c.nome);
        nome.style.padding = "4px 5px";
        nome.style.fontSize = "9.5px";
        nome.style.fontWeight = "800";
        nome.style.lineHeight = "1.15";
        nome.style.textTransform = "uppercase";
        nome.style.color = "var(--ink)";
        nome.style.height = "30px";
        nome.style.overflow = "hidden";
        card.appendChild(nome);

        card.onclick = () => {
          if (ativo) {
            if (listaSel.length > 1) {
              const next = listaSel.filter((x) => x !== c.sq);
              r.listaSel = next;
              r.selectedList = next;
            }
          } else if (listaSel.length < 9) {
            const next = [...listaSel, c.sq];
            r.listaSel = next;
            r.selectedList = next;
          }
          renderComposer();
        };
        grid.appendChild(card);
      }
      blocoGrade.appendChild(grid);
    }

    const buscaGrade = buildCandidateSearch(r, {
      pool: candsBusca,
      elegivel: (c) => (isPauta ? isEligibleForIssue(c, curAxes, lado) : isEligibleForList(c, curAxes)),
      aoEscolher: (c) => {
        if (listaSel.includes(c.sq)) return;
        if (listaSel.length >= 9) {
          toast("A grade aceita no máximo 9 nomes.");
          return;
        }
        const next = [...listaSel, c.sq];
        r.listaSel = next;
        r.selectedList = next;
        r.busca = "";
        r.search = "";
        r.buscaAberta = false;
        r.searchOpen = false;
        renderComposer();
      },
      placeholder: "Nome ou número — só quem votou assim",
      vazio: `Digite para buscar entre as candidaturas com histórico ${appState.allStates ? "do Brasil" : `de ${uf}`}.`,
    });
    blocoGrade.appendChild(buscaGrade);
    controlesEl.appendChild(blocoGrade);
  }

  const blocoModelo = createElement("div", "axes-block");
  blocoModelo.appendChild(createElement("div", "axes-title-block", "Modelo"));
  const grupoMod = createElement("div", undefined);
  grupoMod.style.display = "flex";
  grupoMod.style.gap = "8px";

  const curTemplate =
    r.template ?? (r.modelo === "cabine" ? "booth" : r.modelo === "cedula" ? "ballot" : "booth");

  const btnCabine = createElement("button", undefined, "Cabine");
  btnCabine.style.flex = "1";
  btnCabine.style.height = "58px";
  btnCabine.style.borderRadius = "8px";
  btnCabine.style.border =
    curTemplate === "booth" ? "2px solid var(--red)" : "1.5px solid rgba(19,18,24,.15)";
  btnCabine.style.background = "var(--pleat)";
  btnCabine.style.color = "var(--paper)";
  btnCabine.style.fontSize = "12px";
  btnCabine.style.fontWeight = "800";
  btnCabine.style.cursor = "pointer";
  btnCabine.onclick = () => {
    r.modelo = "cabine";
    r.template = "booth";
    renderComposer();
  };

  const btnCedula = createElement("button", undefined, "Cédula");
  btnCedula.style.flex = "1";
  btnCedula.style.height = "58px";
  btnCedula.style.borderRadius = "8px";
  btnCedula.style.border =
    curTemplate === "ballot" ? "2px solid var(--red)" : "1.5px solid rgba(19,18,24,.15)";
  btnCedula.style.background = "var(--paper)";
  btnCedula.style.color = "var(--ink)";
  btnCedula.style.fontSize = "12px";
  btnCedula.style.fontWeight = "800";
  btnCedula.style.cursor = "pointer";
  btnCedula.onclick = () => {
    r.modelo = "cedula";
    r.template = "ballot";
    renderComposer();
  };

  grupoMod.appendChild(btnCabine);
  grupoMod.appendChild(btnCedula);
  blocoModelo.appendChild(grupoMod);
  controlesEl.appendChild(blocoModelo);

  clearTimeout(debounceComposerTimer);
  debounceComposerTimer = setTimeout(async () => {
    const postPayload = preparePostData(r, candsBusca);
    const postObj = buildPost(postPayload, candsBusca);
    await drawStory(document.getElementById("preview-composer"), postObj);
  }, 80);

  document.getElementById("btn-generate-link-qr").onclick = () => {
    try {
      const postPayload = preparePostData(r, candsBusca);
      const id = encodePost(postPayload);
      const stanceVal = r.stance ?? r.postura ?? "nao";
      location.hash = `#/pronto/${stanceVal}/${id}`;
    } catch (err) {
      console.error(err);
      toast("Não foi possível gerar o link desta candidatura.");
    }
  };
}

function preparePostData(r, cands) {
  const sel = cands.find((c) => c.sq === r.sq);
  const curStance = r.stance ?? r.postura ?? "nao";
  const lado = curStance === "nao" ? "against" : "in-favor";
  const curType = r.type ?? r.tipo ?? "candidate";
  const curTemplate = r.template ?? (r.modelo === "cedula" ? "ballot" : "booth");

  if (curType === "candidate" || curType === "candidato") {
    const motivosDisp = AXIS_ORDER.filter((id) => (sel?.notes ?? sel?.notas)?.[id] === lado);
    const motivosNomes = r.reasons ?? r.motivos ?? motivosDisp.slice(0, 4);
    const motivosIdxs = motivosNomes.map((nome) => AXIS_ORDER.indexOf(nome)).filter((idx) => idx !== -1);
    return {
      type: "candidate",
      tipo: "candidato",
      stance: curStance,
      postura: curStance,
      template: curTemplate,
      modelo: curTemplate,
      sq: r.sq,
      reasons: motivosIdxs,
      motivos: motivosIdxs,
    };
  }

  if (curType === "duel" || curType === "duelo") {
    const oponentes = cands.filter((c) => isEligibleOpponent(c, sel?.sq, curStance));
    const oponenteSq = r.opponent ?? r.oponente ?? oponentes[0]?.sq;
    const nao = curStance === "nao" ? r.sq : oponenteSq;
    const sim = curStance === "nao" ? oponenteSq : r.sq;
    return {
      type: "duel",
      tipo: "duelo",
      stance: curStance,
      postura: curStance,
      template: curTemplate,
      modelo: curTemplate,
      rejected: nao,
      nao,
      chosen: sim,
      sim,
    };
  }

  if (curType === "issue" || curType === "pauta") {
    const eixos = (r.issueAxes ?? r.eixosPauta ?? [])
      .map((e) => AXIS_ORDER.indexOf(e))
      .filter((i) => i !== -1);
    const faces = r.selectedList ?? r.listaSel ?? [];
    return {
      type: "issue",
      tipo: "pauta",
      stance: curStance,
      postura: curStance,
      template: curTemplate,
      modelo: curTemplate,
      axes: eixos,
      eixos,
      faces,
    };
  }

  if (curType === "list" || curType === "lista") {
    const eixos = (r.issueAxes ?? r.eixosPauta ?? [])
      .map((e) => AXIS_ORDER.indexOf(e))
      .filter((i) => i !== -1);
    return {
      type: "list",
      tipo: "lista",
      stance: "nao",
      postura: "nao",
      template: curTemplate,
      modelo: curTemplate,
      axes: eixos,
      eixos,
      faces: r.selectedList ?? r.listaSel ?? [],
    };
  }

  throw new Error(`Tipo desconhecido: ${curType}`);
}

async function renderReady(postura, id) {
  const dec = decodePost(id);
  if (!dec) {
    location.replace("#/criar");
    return;
  }

  const sqsNecessarios = [];
  if (dec.sq) sqsNecessarios.push(dec.sq);
  if (dec.rejected ?? dec.nao) sqsNecessarios.push(dec.rejected ?? dec.nao);
  if (dec.chosen ?? dec.sim) sqsNecessarios.push(dec.chosen ?? dec.sim);
  if (dec.faces) sqsNecessarios.push(...dec.faces);

  await loadState("BR");
  for (const sq of sqsNecessarios) {
    const u = stateFromSq(sq);
    if (u) await loadState(u);
  }

  showScreen("pronto");

  const cands = getAllCandidatesPool();
  dec.postura = postura;
  dec.stance = postura;
  dec.id = id;
  const post = buildPost(dec, cands);

  const linkTexto = linkText(postura, id);
  const urlCompleta = buildUrl(postura, id);

  document.getElementById("ready-link-text").textContent = linkTexto;

  const qrCanvas = document.getElementById("qr-ready-tile");
  const qrCtx = qrCanvas.getContext("2d");
  drawQr(qrCtx, urlCompleta, 0, 0, 116);

  drawStory(document.getElementById("preview-ready"), post).catch(() => {});
  document.getElementById("btn-ready-close").onclick = () => {
    location.hash = "#/catalogo";
  };

  document.getElementById("btn-ready-edit").onclick = () => {
    const decType = dec.type ?? dec.tipo;
    let sqPrincipal = dec.sq;
    if (decType === "duel" || decType === "duelo")
      sqPrincipal = postura === "nao" ? (dec.rejected ?? dec.nao) : (dec.chosen ?? dec.sim);
    else if (decType === "issue" || decType === "pauta" || decType === "list" || decType === "lista")
      sqPrincipal = dec.faces?.[0];

    const decReasons = dec.reasons ?? dec.motivos;
    const decAxes = dec.axes ?? dec.eixos;
    const decTemplate = dec.template ?? dec.modelo ?? "booth";

    appState.draft = {
      sq: sqPrincipal,
      uf: stateFromSq(sqPrincipal) || appState.state,
      state: stateFromSq(sqPrincipal) || appState.state,
      postura,
      stance: postura,
      tipo: decType,
      type: decType,
      modelo: decTemplate,
      template: decTemplate,
      motivos: decReasons?.map((idx) => (typeof idx === "number" ? AXIS_ORDER[idx] : idx)) ?? null,
      reasons: decReasons?.map((idx) => (typeof idx === "number" ? AXIS_ORDER[idx] : idx)) ?? null,
      oponente:
        decType === "duel" || decType === "duelo"
          ? postura === "nao"
            ? (dec.chosen ?? dec.sim)
            : (dec.rejected ?? dec.nao)
          : null,
      opponent:
        decType === "duel" || decType === "duelo"
          ? postura === "nao"
            ? (dec.chosen ?? dec.sim)
            : (dec.rejected ?? dec.nao)
          : null,
      eixosPauta: (decAxes ?? []).map((i) => (typeof i === "number" ? AXIS_ORDER[i] : i)).filter(Boolean),
      issueAxes: (decAxes ?? []).map((i) => (typeof i === "number" ? AXIS_ORDER[i] : i)).filter(Boolean),
      listaSel: dec.faces ?? null,
      selectedList: dec.faces ?? null,
      busca: "",
      search: "",
      buscaAberta: false,
      searchOpen: false,
    };
    location.hash = "#/novo";
  };

  const btnCopiar = document.getElementById("btn-copy-link");
  btnCopiar.textContent = "Copiar link";
  btnCopiar.onclick = async () => {
    try {
      await navigator.clipboard.writeText(urlCompleta);
      btnCopiar.textContent = "Copiado ✓";
      toast("Link copiado");
    } catch {
      toast("Não deu para copiar. Selecione o link e copie.");
    }
  };

  function downloadBlob(blob, nome) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
  }

  async function handleAction(tarefa) {
    try {
      await tarefa();
    } catch (err) {
      console.error(err);
      toast("Falha ao gerar a imagem.");
    }
  }

  document.getElementById("btn-share-whats").onclick = () => {
    handleAction(async () => {
      const blob = await renderCard(post);
      const arquivo = new File([blob], `votosecreto-${postura}-${id}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [arquivo] })) {
        try {
          await navigator.share({
            files: [arquivo],
            text: `${post.caption ?? post.legenda}\n${urlCompleta}`,
          });
        } catch (e) {
          if (e.name !== "AbortError") throw e;
        }
      } else {
        window.open(
          `https://wa.me/?text=${encodeURIComponent((post.caption ?? post.legenda) + "\n" + urlCompleta)}`,
          "_blank",
          "noopener",
        );
      }
    });
  };

  document.getElementById("btn-share-stories").onclick = () => {
    handleAction(async () => {
      const blob = await renderStory(post);
      const arquivo = new File([blob], `votosecreto-story-${id}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo] });
        } catch (e) {
          if (e.name !== "AbortError") throw e;
        }
      } else {
        downloadBlob(blob, `votosecreto-story-${id}.jpg`);
      }
    });
  };

  document.getElementById("btn-share-download").onclick = () => {
    handleAction(async () => {
      const blob = await renderCard(post);
      downloadBlob(blob, `votosecreto-${postura}-${id}.jpg`);
    });
  };

  document.getElementById("btn-share-stickers").onclick = () => {
    handleAction(async () => {
      const blob = await renderStickerSheet(post);
      downloadBlob(blob, `votosecreto-adesivos-${id}.png`);
    });
  };

  document.getElementById("btn-view-as-link").onclick = () => {
    location.hash = `#/${postura}/${id}`;
  };
}

async function renderLinkView(postura, id) {
  showScreen("link");

  const invalidoBox = document.getElementById("link-invalid-view");
  const validoBox = document.getElementById("link-valid-content");

  document.getElementById("btn-link-back").onclick = () => {
    if (history.length > 1) history.back();
    else location.hash = "#/catalogo";
  };

  document.getElementById("btn-link-go-catalog").onclick = () => {
    location.hash = "#/catalogo";
  };

  const dec = decodePost(id);
  if (!dec) {
    invalidoBox.style.display = "block";
    validoBox.style.display = "none";
    return;
  }

  const sqsNecessarios = [];
  if (dec.sq) sqsNecessarios.push(dec.sq);
  if (dec.rejected ?? dec.nao) sqsNecessarios.push(dec.rejected ?? dec.nao);
  if (dec.chosen ?? dec.sim) sqsNecessarios.push(dec.chosen ?? dec.sim);
  if (dec.faces) sqsNecessarios.push(...dec.faces);

  await loadState("BR");
  for (const sq of sqsNecessarios) {
    const u = stateFromSq(sq);
    if (u) await loadState(u);
  }

  const candPool = getAllCandidatesPool();
  for (const sq of sqsNecessarios) {
    if (!candPool.some((c) => c.sq === sq)) {
      invalidoBox.style.display = "block";
      validoBox.style.display = "none";
      return;
    }
  }

  invalidoBox.style.display = "none";
  validoBox.style.display = "block";

  dec.postura = postura;
  dec.stance = postura;
  dec.id = id;
  const post = buildPost(dec, candPool);

  document.getElementById("link-url-pill").textContent = linkText(postura, id);
  document.getElementById("link-caption-text").textContent = `“${post.caption ?? post.legenda}”`;
  drawCard(document.getElementById("preview-link"), post).catch(() => {});

  const provasEl = document.getElementById("link-proofs-list");
  provasEl.replaceChildren();

  const decType = dec.type ?? dec.tipo;
  let sqPrincipal = dec.sq;
  if (decType === "duel" || decType === "duelo")
    sqPrincipal = postura === "nao" ? (dec.rejected ?? dec.nao) : (dec.chosen ?? dec.sim);
  else if (decType === "issue" || decType === "pauta" || decType === "list" || decType === "lista")
    sqPrincipal = dec.faces?.[0];

  const candPrincipal = candPool.find((c) => c.sq === sqPrincipal);
  const lado = postura === "nao" ? "against" : "in-favor";

  if (!localStorage.getItem(STORAGE_STATE) && (post.state ?? post.uf) && (post.state ?? post.uf) !== "BR") {
    appState.state = post.state ?? post.uf;
  }

  const eixosApresentar = [];
  if (decType === "candidate" || decType === "candidato") {
    for (const mIdx of dec.reasons ?? dec.motivos ?? []) {
      const eId = typeof mIdx === "number" ? AXIS_ORDER[mIdx] : mIdx;
      const eObj = appState.index.eixos.find((x) => x.id === eId);
      if (eObj) {
        if (!candPrincipal || (candPrincipal.notes ?? candPrincipal.notas)[eId] === lado) {
          eixosApresentar.push(eObj);
        }
      }
    }
  } else if (decType === "issue" || decType === "pauta" || decType === "list" || decType === "lista") {
    for (const i of dec.axes ?? dec.eixos ?? []) {
      const eId = typeof i === "number" ? AXIS_ORDER[i] : i;
      const eObj = appState.index.eixos.find((x) => x.id === eId);
      if (eObj) eixosApresentar.push(eObj);
    }
  }

  const corLado = postura === "nao" ? "var(--red)" : "var(--green)";
  for (const eixo of eixosApresentar) {
    const row = createElement("div", "dossier-axis-item");
    row.style.borderLeft = `5px solid ${corLado}`;
    const col = createElement("div", undefined);
    col.style.flex = "1";
    col.style.minWidth = "0";

    const v = eixo.votacoes[0];
    const textoVoto = VERB[eixo.id][lado];
    col.appendChild(createElement("div", "axis-item-text", textoVoto));
    col.appendChild(
      createElement("div", "axis-item-sub", `${eixo.nome} · ${v?.sim ?? 0} Sim × ${v?.nao ?? 0} Não`),
    );

    const isSenado = String(v?.id || "").startsWith("SF-");
    const linkOficial = createElement("a", undefined, "votação nominal no Congresso ↗");
    linkOficial.href = isSenado
      ? `https://legis.senado.leg.br/dadosabertos/votacao?idProcesso=${v.idProcesso}`
      : `https://www.camara.leg.br/presenca-comissoes/votacao-portal?idVotacao=${v.id}`;
    linkOficial.target = "_blank";
    linkOficial.rel = "noopener noreferrer";
    linkOficial.style.fontSize = "11.5px";
    linkOficial.style.color = "var(--muted)";
    linkOficial.style.textDecoration = "underline";
    col.appendChild(linkOficial);

    row.appendChild(col);
    provasEl.appendChild(row);
  }

  document.getElementById("btn-link-remix").onclick = () => {
    if (candPrincipal) {
      openComposer(candPrincipal, postura, decType);
    } else {
      location.hash = "#/catalogo";
    }
  };

  const botoesExtra = document.getElementById("link-extra-buttons");
  if ((decType === "candidate" || decType === "candidato") && candPrincipal) {
    botoesExtra.style.display = "flex";
    const btnDisc = document.getElementById("btn-link-disagree");
    const opostoPostura = postura === "nao" ? "voto" : "nao";
    btnDisc.textContent = `Discordo — declarar ${opostoPostura === "voto" ? "VOTO" : "NÃO VOTO"}`;
    btnDisc.style.color = opostoPostura === "voto" ? "var(--green)" : "var(--red)";
    btnDisc.onclick = () => {
      openComposer(candPrincipal, opostoPostura, "candidate");
    };

    document.getElementById("btn-link-dossier").onclick = () => {
      location.hash = `#/ficha/${candPrincipal.sq}`;
    };
  } else {
    botoesExtra.style.display = "none";
  }
}

async function renderRadar() {
  if (!appState.state || appState.state === "BR") appState.state = "SP";
  await loadState("BR");
  await loadState(appState.state);

  showScreen("radar");

  document.getElementById("btn-radar-state").textContent = `${appState.state} ▾`;
  document.getElementById("btn-radar-state").onclick = () => {
    location.hash = "#/onboarding";
  };

  const cands = getCandidatePool(appState.state);
  const comFicha = cands.filter((c) => c.hasDossier ?? c.temFicha);

  const arqBr = appState.files.get("BR");
  const arqUf = appState.files.get(appState.state);
  const pelaBlindagem = inFavorOfBlindagem(arqBr) + inFavorOfBlindagem(arqUf);
  const nomeUf = arqUf?.nome ? titleCase(arqUf.nome) : appState.state;

  const blurbEl = document.getElementById("radar-blurb");
  blurbEl.innerHTML = `<b style="color:var(--red);">${pelaBlindagem} de ${comFicha.length}</b> candidaturas de ${nomeUf} com histórico no Congresso votaram pela blindagem. Votações críticas sob a lupa do eleitor.`;

  const btnPart = document.getElementById("btn-radar-party");
  const btnPauta = document.getElementById("btn-radar-issue");
  const btnRank = document.getElementById("btn-radar-ranking");

  btnPart.classList.toggle("active", appState.radarView === "partido");
  btnPauta.classList.toggle("active", appState.radarView === "pauta");
  btnRank.classList.toggle("active", appState.radarView === "ranking");

  btnPart.onclick = () => {
    appState.radarView = "partido";
    appState.partyFilter = null;
    appState.issueFilter = null;
    btnPart.classList.add("active");
    btnPauta.classList.remove("active");
    btnRank.classList.remove("active");
    renderRadarContent();
  };

  btnPauta.onclick = () => {
    appState.radarView = "pauta";
    appState.partyFilter = null;
    appState.issueFilter = null;
    btnPauta.classList.add("active");
    btnPart.classList.remove("active");
    btnRank.classList.remove("active");
    renderRadarContent();
  };

  btnRank.onclick = () => {
    appState.radarView = "ranking";
    btnRank.classList.add("active");
    btnPart.classList.remove("active");
    btnPauta.classList.remove("active");
    renderRadarContent();
  };

  renderRadarContent();
}

function renderRadarContent() {
  const container = document.getElementById("radar-content");
  container.replaceChildren();

  const cands = getCandidatePool(appState.state);
  const comFicha = cands.filter((c) => c.hasDossier ?? c.temFicha);

  if (appState.radarView === "partido") {
    container.appendChild(
      createElement("div", "count-row", `Partidos com mais nomes no radar primeiro · ${appState.state}`),
    );
    const grupos = new Map();
    for (const c of comFicha) {
      const pSigla = c.party ?? c.partido;
      let g = grupos.get(pSigla);
      if (!g) {
        g = { sigla: pSigla, total: 0, emRadar: 0 };
        grupos.set(pSigla, g);
      }
      g.total++;
      if (c.onRadar ?? c.noRadar) g.emRadar++;
    }

    const listaPartidos = [...grupos.values()]
      .filter((g) => g.emRadar > 0)
      .sort((a, b) => b.emRadar - a.emRadar || b.total - a.total);

    for (const p of listaPartidos) {
      const btn = createElement("button", "radar-party-item");
      btn.appendChild(createElement("span", undefined, p.sigla));
      btn.children[0].style.fontFamily = "var(--font-display)";
      btn.children[0].style.fontSize = "18px";
      btn.children[0].style.minWidth = "64px";

      const centro = createElement("div", undefined);
      centro.style.flex = "1";
      centro.style.minWidth = "0";
      centro.style.display = "flex";
      centro.style.flexDirection = "column";
      centro.style.gap = "4px";

      const pct = Math.round((100 * p.emRadar) / p.total);
      centro.appendChild(createElement("div", undefined, `${p.emRadar} no radar · ${p.total} com histórico`));
      centro.children[0].style.fontSize = "12.5px";
      centro.children[0].style.fontWeight = "700";

      const barra = createElement("div", "radar-bar");
      const preenc = createElement("span", undefined);
      preenc.style.width = `${pct}%`;
      preenc.style.background = "var(--red)";
      barra.appendChild(preenc);
      centro.appendChild(barra);

      btn.appendChild(centro);
      btn.appendChild(createElement("span", undefined, "›"));
      btn.children[2].style.fontSize = "18px";
      btn.children[2].style.color = "var(--muted)";

      btn.onclick = () => {
        appState.radarView = "ranking";
        appState.partyFilter = p.sigla;
        appState.issueFilter = null;
        document.getElementById("btn-radar-party").classList.remove("active");
        document.getElementById("btn-radar-ranking").classList.add("active");
        renderRadarContent();
      };
      container.appendChild(btn);
    }
  } else if (appState.radarView === "pauta") {
    container.appendChild(
      createElement("div", "count-row", `Quem votou contra o eleitor em cada pauta · ${appState.state}`),
    );
    const listaPautas = [];
    for (const eixo of appState.index.eixos) {
      const n = comFicha.filter((c) => (c.notes ?? c.notas)[eixo.id] === "against").length;
      if (n > 0) {
        listaPautas.push({ eixo, n });
      }
    }
    listaPautas.sort((a, b) => b.n - a.n);

    for (const item of listaPautas) {
      const v = item.eixo.votacoes[0];
      const btn = createElement("button", "radar-party-item");
      btn.style.borderLeft = "5px solid var(--red)";

      const info = createElement("div", undefined);
      info.style.flex = "1";
      info.style.minWidth = "0";

      const tit = createElement("div", undefined, SHORT_LABEL[item.eixo.id].contra.toUpperCase());
      tit.style.fontSize = "13.5px";
      tit.style.fontWeight = "800";
      tit.style.color = "var(--red)";
      info.appendChild(tit);

      const sub = createElement(
        "div",
        undefined,
        `${item.eixo.nome} · ${v?.sim ?? 0} Sim × ${v?.nao ?? 0} Não`,
      );
      sub.style.fontSize = "11.5px";
      sub.style.color = "var(--muted)";
      sub.style.marginTop = "2px";
      info.appendChild(sub);

      btn.appendChild(info);

      const nEl = createElement("span", undefined, String(item.n));
      nEl.style.fontFamily = "var(--font-display)";
      nEl.style.fontSize = "22px";
      nEl.style.color = "var(--ink)";
      btn.appendChild(nEl);

      btn.onclick = () => {
        appState.radarView = "ranking";
        appState.issueFilter = item.eixo.id;
        appState.partyFilter = null;
        document.getElementById("btn-radar-issue").classList.remove("active");
        document.getElementById("btn-radar-ranking").classList.add("active");
        renderRadarContent();
      };
      container.appendChild(btn);
    }
  } else if (appState.radarView === "ranking") {
    let ranking = comFicha.filter((c) => (c.against ?? c.contra) >= 1);
    ranking.sort(
      (a, b) =>
        (b.against ?? b.contra) - (a.against ?? a.contra) ||
        (a.inFavor ?? a.def) - (b.inFavor ?? b.def) ||
        (a.ballotNumber ?? a.numero) - (b.ballotNumber ?? b.numero),
    );

    if (appState.partyFilter) {
      ranking = ranking.filter((c) => (c.party ?? c.partido) === appState.partyFilter);
    } else if (appState.issueFilter) {
      ranking = ranking.filter((c) => (c.notes ?? c.notas)[appState.issueFilter] === "against");
    }

    const topoLinha = createElement("div", "top-bar");
    const countTxt = `${ranking.length} candidaturas${ranking.length > 40 ? " · mostrando 40" : ""}`;
    topoLinha.appendChild(createElement("span", "count-row", countTxt));

    if (appState.partyFilter || appState.issueFilter) {
      const rot = appState.partyFilter ?? SHORT_LABEL[appState.issueFilter]?.contra ?? "";
      const chipFiltro = createElement("button", "btn-pill", `${rot} ✕`);
      chipFiltro.style.background = "var(--ink)";
      chipFiltro.style.color = "#fff";
      chipFiltro.onclick = () => {
        appState.partyFilter = null;
        appState.issueFilter = null;
        renderRadarContent();
      };
      topoLinha.appendChild(chipFiltro);
    }
    container.appendChild(topoLinha);

    if (ranking.length > 0) {
      const btnPost = createElement("button", "btn-cta-primary", "COMPARTILHAR ESTE RADAR COMO POST");
      btnPost.style.margin = "0";
      btnPost.style.height = "42px";
      btnPost.style.fontSize = "15px";
      btnPost.onclick = () => {
        openComposer(ranking[0], "nao", "list", {
          listaSel: ranking.slice(0, 9).map((c) => c.sq),
          selectedList: ranking.slice(0, 9).map((c) => c.sq),
          eixosPauta: appState.issueFilter ? [appState.issueFilter] : [],
          issueAxes: appState.issueFilter ? [appState.issueFilter] : [],
        });
      };
      container.appendChild(btnPost);
    } else {
      const vazio = createElement(
        "div",
        "card-no-dossier",
        `Nenhuma candidatura de ${appState.state} votou contra o eleitor nos eixos avaliados.`,
      );
      vazio.style.padding = "24px 0";
      vazio.style.textAlign = "center";
      container.appendChild(vazio);
      return;
    }

    const exibidos = ranking.slice(0, 40);
    exibidos.forEach((c, i) => {
      const art = createElement("div", "candidate-card");
      art.style.flexDirection = "row";
      art.style.alignItems = "center";
      art.style.padding = "10px";

      const pos = createElement("span", undefined, String(i + 1));
      pos.style.fontFamily = "var(--font-display)";
      pos.style.fontSize = "20px";
      pos.style.color = "var(--red)";
      pos.style.width = "28px";
      pos.style.textAlign = "center";
      art.appendChild(pos);

      const foto = createElement("div", "photo-frame");
      foto.style.width = "44px";
      foto.style.height = "58px";
      foto.style.background = `hsl(${c.hue ?? c.matiz} 30% 42%)`;
      if (c.photoSrc ?? c.fotoSrc) {
        const img = createElement("div", "photo-image");
        img.style.backgroundImage = `url("${c.photoSrc ?? c.fotoSrc}")`;
        img.style.filter = "grayscale(1)";
        foto.appendChild(img);
      } else {
        foto.appendChild(createElement("span", undefined, c.initials ?? c.iniciais));
      }
      foto.onclick = () => {
        location.hash = `#/ficha/${c.sq}`;
      };
      art.appendChild(foto);

      const info = createElement("div", undefined);
      info.style.flex = "1";
      info.style.minWidth = "0";
      info.style.display = "flex";
      info.style.flexDirection = "column";
      info.style.gap = "2px";
      info.onclick = () => {
        location.hash = `#/ficha/${c.sq}`;
      };

      const nome = createElement("div", "card-name", c.name ?? c.nome);
      nome.style.fontSize = "13.5px";
      nome.style.overflow = "hidden";
      nome.style.textOverflow = "ellipsis";
      nome.style.whiteSpace = "nowrap";
      info.appendChild(nome);

      info.appendChild(
        createElement("div", "card-meta", `${c.party ?? c.partido} · ${c.ballotNumber ?? c.numero}`),
      );

      const eixosContra = AXIS_ORDER.filter((id) => (c.notes ?? c.notas)[id] === "against");
      const rotulosTopicos = eixosContra
        .slice(0, 2)
        .map((id) => SHORT_LABEL[id].contra.toUpperCase())
        .join(", ");
      const extraTopicos = eixosContra.length > 2 ? ` +${eixosContra.length - 2}` : "";
      const topicosEl = createElement("div", undefined, rotulosTopicos + extraTopicos);
      topicosEl.style.fontSize = "10px";
      topicosEl.style.fontWeight = "800";
      topicosEl.style.color = "var(--red)";
      info.appendChild(topicosEl);

      const regua = createElement("div", "axes-ruler");
      for (const eixoId of AXIS_ORDER) {
        const seg = createElement("span", "ruler-seg");
        const est = (c.notes ?? c.notas)[eixoId];
        seg.style.background =
          est === "against"
            ? "var(--red)"
            : est === "in-favor"
              ? "var(--green)"
              : est === "mixed"
                ? "var(--mixed)"
                : "var(--none)";
        regua.appendChild(seg);
      }
      info.appendChild(regua);
      art.appendChild(info);

      const btnNao = createElement("button", "btn-no-vote", "NÃO VOTO");
      btnNao.style.flex = "0 0 auto";
      btnNao.style.height = "36px";
      btnNao.style.padding = "0 10px";
      btnNao.style.fontSize = "13px";
      btnNao.onclick = (e) => {
        e.stopPropagation();
        openComposer(c, "nao");
      };
      art.appendChild(btnNao);

      container.appendChild(art);
    });
  }
}

async function renderScanner() {
  showScreen("scan");

  const video = document.getElementById("scan-video");
  const aviso = document.getElementById("scan-camera-warning");
  const inputLink = document.getElementById("input-scan-link");
  const btnAbrir = document.getElementById("btn-scan-open-link");

  function processarTexto(texto) {
    const rota = extractRoute(texto);
    if (!rota) {
      toast("Esse QR não é do Voto Secreto.");
      return;
    }
    if (rota.sq) {
      const novoHash = `#/ficha/${rota.sq}`;
      if (location.hash === novoHash) navigate();
      else location.hash = novoHash;
      toast(`Lido: ${rota.sq}`);
    } else if (rota.postura && rota.id) {
      const novoHash = `#/${rota.postura}/${rota.id}`;
      if (location.hash === novoHash) navigate();
      else location.hash = novoHash;
      toast(`Lido: ${linkText(rota.postura, rota.id)}`);
    }
  }

  btnAbrir.onclick = () => {
    processarTexto(inputLink.value.trim());
  };

  inputLink.onkeydown = (e) => {
    if (e.key === "Enter") processarTexto(inputLink.value.trim());
  };

  if ("BarcodeDetector" in window && navigator.mediaDevices?.getUserMedia) {
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (document.querySelector('.screen[data-tela="scan"]').hasAttribute("hidden")) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      appState.scanStream = stream;
      video.srcObject = stream;
      await video.play();
      aviso.style.display = "none";

      appState.scanInterval = setInterval(async () => {
        try {
          const codes = await detector.detect(video);
          if (codes && codes.length > 0) {
            const raw = codes[0].rawValue;
            if (raw) {
              clearInterval(appState.scanInterval);
              appState.scanInterval = null;
              processarTexto(raw);
            }
          }
        } catch {
          // Frame decode failed
        }
      }, 250);
    } catch {
      aviso.style.display = "grid";
    }
  } else {
    aviso.style.display = "grid";
  }
}

async function navigate() {
  const hash = location.hash.replace(/^#/, "");
  const partes = hash.split("/").filter(Boolean);

  if (partes.length === 0) {
    location.replace("#/onboarding");
    renderOnboarding();
    return;
  }

  const rota = partes[0];

  if (rota === "onboarding") {
    renderOnboarding();
  } else if (rota === "catalogo") {
    await renderCatalog();
  } else if (rota === "radar") {
    await renderRadar();
  } else if (rota === "criar") {
    await renderCreateHub();
  } else if (rota === "scan") {
    await renderScanner();
  } else if (rota === "ficha" && partes[1]) {
    await renderDossier(partes[1]);
  } else if (rota === "novo") {
    await renderComposer();
  } else if (rota === "pronto" && partes[1] && partes[2]) {
    if (partes[1] !== "nao" && partes[1] !== "voto") {
      location.replace("#/criar");
      return;
    }
    await renderReady(partes[1], partes[2]);
  } else if ((rota === "nao" || rota === "voto") && partes[1]) {
    await renderLinkView(rota, partes[1]);
  } else {
    location.replace("#/");
  }
}

function initInstall() {
  const botao = document.getElementById("btn-install");
  const ehIos = /iPhone|iPod/i.test(navigator.userAgent);
  const instalado = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const dispensado = () => localStorage.getItem(STORAGE_INSTALL_DISMISSED) !== null;

  function removeInstallPrompt() {
    const banner = document.querySelector(".invite-install");
    if (banner !== null) banner.remove();
  }

  function buildInstallPrompt(texto, acao) {
    if (document.querySelector(".invite-install") !== null) return;
    const banner = createElement("div", "invite-install");
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Instalar o aplicativo");

    const corpo = createElement("div", "invite-body");
    corpo.appendChild(createElement("p", "invite-title", "Instale o Voto Secreto"));
    corpo.appendChild(createElement("p", "invite-text", texto));
    banner.appendChild(corpo);

    const acoes = createElement("div", "invite-actions");
    if (acao !== null) {
      const instalar = createElement("button", "invite-button", "Instalar");
      instalar.type = "button";
      instalar.addEventListener("click", acao);
      acoes.appendChild(instalar);
    }
    const depois = createElement("button", "invite-dismiss", "Agora não");
    depois.type = "button";
    depois.addEventListener("click", () => {
      removeInstallPrompt();
      localStorage.setItem(STORAGE_INSTALL_DISMISSED, new Date().toISOString());
    });
    acoes.appendChild(depois);
    banner.appendChild(acoes);
    document.body.appendChild(banner);
  }

  let convite = null;
  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    convite = evento;
    appState.installPrompt = evento;
    if (botao) botao.removeAttribute("hidden");
    if (!instalado && !dispensado()) {
      buildInstallPrompt("Funciona offline e abre direto na cabine.", () => {
        convite.prompt();
        convite = null;
        appState.installPrompt = null;
        if (botao) botao.setAttribute("hidden", "");
        removeInstallPrompt();
      });
    }
  });

  if (botao) {
    botao.onclick = () => {
      if (convite === null) return;
      convite.prompt();
      convite = null;
      appState.installPrompt = null;
      botao.setAttribute("hidden", "");
      removeInstallPrompt();
    };
  }

  window.addEventListener("appinstalled", () => {
    convite = null;
    appState.installPrompt = null;
    if (botao) botao.setAttribute("hidden", "");
    removeInstallPrompt();
  });

  if (ehIos && !instalado && !dispensado()) {
    buildInstallPrompt(
      "Toque em Compartilhar e depois em “Adicionar à Tela de Início”. Funciona offline.",
      null,
    );
  }
}

async function initApp() {
  await loadIndex();
  const ufSalva = localStorage.getItem(STORAGE_STATE);
  if (ufSalva && ufSalva !== "BR" && appState.index.ufs.some((u) => u.sigla === ufSalva)) {
    appState.state = ufSalva;
  }
  appState.allStates = localStorage.getItem(STORAGE_ALL_STATES) === "1";

  document.getElementById("tab-catalog").onclick = () => {
    location.hash = "#/catalogo";
  };
  document.getElementById("tab-create").onclick = () => {
    location.hash = "#/criar";
  };
  document.getElementById("tab-radar").onclick = () => {
    location.hash = "#/radar";
  };

  window.addEventListener("hashchange", navigate);
  navigate();

  initInstall();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

if (typeof window !== "undefined") {
  initApp().catch((e) => console.error("Erro na inicialização:", e));
}
