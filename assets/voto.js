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
} from "./elo.js";

import {
  desenharCartao,
  desenharStory,
  gerarCartao,
  gerarStory,
  gerarAdesivos,
  desenharQr,
} from "./cartaz.js";

const CHAVE_UF = "vs.uf";
const CHAVE_TODAS = "vs.todasUfs";
const CHAVE_INSTALAR = "vs.instalarDispensado";
const LIMITE_INICIAL = 40;
const LIMIAR_RADAR = 3;

const VERBO = {
  blindagem: {
    defende: "Votou CONTRA a blindagem",
    contra: "Votou A FAVOR da blindagem",
    curto: { defende: "CONTRA a blindagem", contra: "PELA blindagem" },
  },
  jornada: {
    defende: "Votou pela redução da jornada",
    contra: "Votou CONTRA a redução da jornada",
    curto: { defende: "PELO fim da 6x1", contra: "CONTRA o fim da 6x1" },
  },
  anistia: {
    defende: "Votou CONTRA a anistia golpista",
    contra: "Votou pela ANISTIA aos golpistas",
    curto: { defende: "CONTRA a anistia golpista", contra: "PELA anistia golpista" },
  },
  trabalhista: {
    defende: "Votou CONTRA cortar direitos trabalhistas",
    contra: "Votou para CORTAR direitos trabalhistas",
    curto: { defende: "CONTRA o corte de direitos", contra: "PELO corte de direitos trabalhistas" },
  },
  clt: {
    defende: "Votou CONTRA a reforma trabalhista de 2017",
    contra: "Votou A FAVOR da reforma trabalhista de 2017",
    curto: { defende: "CONTRA a reforma da CLT", contra: "PELA reforma da CLT" },
  },
  previdencia: {
    defende: "Votou CONTRA a reforma da Previdência",
    contra: "Votou A FAVOR da reforma da Previdência",
    curto: { defende: "CONTRA a reforma da Previdência", contra: "PELA reforma da Previdência" },
  },
  eletrobras: {
    defende: "Votou CONTRA privatizar a Eletrobras",
    contra: "Votou para PRIVATIZAR a Eletrobras",
    curto: { defende: "CONTRA a privatização da Eletrobras", contra: "PELA privatização da Eletrobras" },
  },
  ricos: {
    defende: "Votou para TAXAR os super-ricos",
    contra: "Votou CONTRA taxar os super-ricos",
    curto: { defende: "PELA taxação dos super-ricos", contra: "CONTRA a taxação dos super-ricos" },
  },
};

const ROTULO_VOTO = {
  0: "sem registro",
  1: "Sim",
  2: "Não",
  3: "Abstenção",
  4: "Obstrução",
  5: "Artigo 17",
  6: "em branco",
};

const EIXO_ORDEM = [
  "blindagem",
  "jornada",
  "anistia",
  "trabalhista",
  "clt",
  "previdencia",
  "eletrobras",
  "ricos",
];

const CURTO = {
  blindagem: { contra: "PELA blindagem", defende: "CONTRA a blindagem" },
  jornada: { contra: "CONTRA o fim da 6x1", defende: "PELO fim da 6x1" },
  anistia: { contra: "PELA anistia golpista", defende: "CONTRA a anistia golpista" },
  trabalhista: { contra: "PELO corte de direitos trabalhistas", defende: "CONTRA o corte de direitos" },
  clt: { contra: "PELA reforma da CLT", defende: "CONTRA a reforma da CLT" },
  previdencia: { contra: "PELA reforma da Previdência", defende: "CONTRA a reforma da Previdência" },
  eletrobras: { contra: "PELA privatização da Eletrobras", defende: "CONTRA a privatização da Eletrobras" },
  ricos: { contra: "CONTRA a taxação dos super-ricos", defende: "PELA taxação dos super-ricos" },
};

const LONGO = {
  blindagem: { defende: "Votou CONTRA a blindagem", contra: "Votou A FAVOR da blindagem" },
  jornada: { defende: "Votou pela redução da jornada", contra: "Votou CONTRA a redução da jornada" },
  anistia: { defende: "Votou CONTRA a anistia golpista", contra: "Votou pela ANISTIA aos golpistas" },
  trabalhista: { defende: "Votou CONTRA cortar direitos trabalhistas", contra: "Votou para CORTAR direitos trabalhistas" },
  clt: { defende: "Votou CONTRA a reforma trabalhista de 2017", contra: "Votou A FAVOR da reforma trabalhista de 2017" },
  previdencia: { defende: "Votou CONTRA a reforma da Previdência", contra: "Votou A FAVOR da reforma da Previdência" },
  eletrobras: { defende: "Votou CONTRA privatizar a Eletrobras", contra: "Votou para PRIVATIZAR a Eletrobras" },
  ricos: { defende: "Votou para TAXAR os super-ricos", contra: "Votou CONTRA taxar os super-ricos" },
};

const PAUTA_TITULO = {
  blindagem: { contra: "QUEM VOTOU PELA BLINDAGEM", defende: "QUEM VOTOU CONTRA A BLINDAGEM" },
  jornada: { contra: "QUEM VOTOU CONTRA O FIM DA 6x1", defende: "QUEM VOTOU PELO FIM DA 6x1" },
  anistia: { contra: "QUEM VOTOU PELA ANISTIA GOLPISTA", defende: "QUEM BARROU A ANISTIA GOLPISTA" },
  trabalhista: { contra: "QUEM CORTOU DIREITOS NA PANDEMIA", defende: "QUEM DEFENDEU DIREITOS NA PANDEMIA" },
  clt: { contra: "QUEM VOTOU PELA REFORMA DA CLT", defende: "QUEM VOTOU CONTRA A REFORMA DA CLT" },
  previdencia: { contra: "QUEM VOTOU PELA REFORMA DA PREVIDÊNCIA", defende: "QUEM VOTOU CONTRA A REFORMA DA PREVIDÊNCIA" },
  eletrobras: { contra: "QUEM PRIVATIZOU A ELETROBRAS", defende: "QUEM VOTOU CONTRA PRIVATIZAR A ELETROBRAS" },
  ricos: { contra: "QUEM VOTOU CONTRA TAXAR OS SUPER-RICOS", defende: "QUEM VOTOU PARA TAXAR OS SUPER-RICOS" },
};

const TEMA_SIM = {
  blindagem: "blindagem",
  jornada: "fim da 6x1",
  anistia: "anistia golpista",
  trabalhista: "corte de direitos",
  clt: "reforma da CLT",
  previdencia: "ref. da Previdência",
  eletrobras: "privatização",
  ricos: "taxar super-ricos",
};

const DEFENDE_SIM = { jornada: true, ricos: true };

const ADESIVO_CURTO = {
  blindagem: "blindagem",
  jornada: "escala 6x1",
  anistia: "anistia golpista",
  trabalhista: "corte de direitos",
  clt: "reforma da CLT",
  previdencia: "ref. da Previdência",
  eletrobras: "privatização",
  ricos: "isenção dos ricos",
};

const CARGO_ROTULOS = {
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

const PERFIL_ROTULO = {
  novo: "Estreante",
  reeleicao: "Reeleição",
  outro: "Já teve mandato",
};

const estado = {
  indice: null,
  uf: null,
  todasUfs: false,
  arquivos: new Map(),
  q: "",
  ordem: "contra",
  cargo: "todos",
  perfil: "todos",
  secao: "historico",
  limite: LIMITE_INICIAL,
  vistaRadar: "partido",
  filtroPartido: null,
  filtroPauta: null,
  rascunho: null,
  toastTimer: null,
  scanStream: null,
  scanInterval: null,
};

function achatar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function numeroBr(valor) {
  return Number(valor).toLocaleString("pt-BR");
}

function dataBr(iso) {
  const [ano, mes, dia] = String(iso).split("-");
  return `${dia}/${mes}/${ano}`;
}

function plural(quantidade, singular, muitos) {
  return `${numeroBr(quantidade)} ${quantidade === 1 ? singular : muitos}`;
}

function criar(tag, classe, texto) {
  const no = document.createElement(tag);
  if (classe !== undefined) no.className = classe;
  if (texto !== undefined) no.textContent = texto;
  return no;
}

function titulo(str) {
  return String(str ?? "")
    .toLowerCase()
    .replace(/(^|\s|-)([a-zà-ú])/g, (m) => m.toUpperCase());
}
function juntarE(lista) {
  if (!lista || lista.length === 0) return "";
  if (lista.length === 1) return lista[0];
  return lista.slice(0, -1).join(", ") + " e " + lista[lista.length - 1];
}


async function carregarJson(caminho) {
  const r = await fetch(caminho);
  if (!r.ok) throw new Error(`${caminho} status ${r.status}`);
  return r.json();
}

function iniciaisDe(nome) {
  const partes = String(nome ?? "").split(/\s+/).filter((p) => p.length > 2);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return "VS";
}

function campos(par) {
  const c = par.arquivo.indices;
  const l = par.linha;
  return {
    sq: l[c.sq],
    numero: l[c.numero],
    nome: l[c.nome],
    nomeCompleto: l[c.nomeCompleto],
    cargo: l[c.cargo],
    partido: l[c.partido],
    coligacao: l[c.coligacao],
    badge: l[c.badge],
    foto: l[c.foto],
    perfil: l[c.perfil],
    ficha: l[c.ficha],
  };
}

function pontuar(ficha, eixo) {
  const vazio = { estado: "sem-registro", defende: 0, contra: 0, outros: [], valor: null };
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
    return { estado: "sem-lado", defende, contra, outros, valor: null };
  }
  const valor = defende / total;
  const rotulo = valor === 1 ? "defende" : valor === 0 ? "contra" : "misto";
  return { estado: rotulo, defende, contra, outros, valor };
}

function resumo(ficha) {
  let contra = 0;
  let defende = 0;
  const notas = [];
  if (ficha !== null) {
    for (const eixo of estado.indice.eixos) {
      const nota = pontuar(ficha, eixo);
      notas.push({ eixo, nota });
      if (nota.estado === "contra") contra += 1;
      else if (nota.estado === "defende") defende += 1;
    }
  }
  return { notas, contra, defende };
}

function aFavorDaBlindagem(arquivo) {
  if (!arquivo) return 0;
  if (arquivo.aFavorBlindagem !== undefined) return arquivo.aFavorBlindagem;
  const eixo = estado.indice.eixos.find((e) => e.id === "blindagem");
  let total = 0;
  for (const linha of arquivo.candidatos) {
    const ficha = linha[arquivo.indices.ficha];
    if (ficha && pontuar(ficha, eixo).estado === "contra") total += 1;
  }
  arquivo.aFavorBlindagem = total;
  return total;
}

function enriquecer(par) {
  const c = campos(par);
  const sq = c.sq;
  const memo = par.arquivo.vm?.get(sq);
  if (memo) return memo;

  const cargoCurto = CARGO_ROTULOS[c.cargo] ?? "Candidato";
  const partido = estado.indice.partidos[c.partido]?.sigla ?? String(c.partido);
  const temFicha = c.ficha !== null;
  const notas = {};
  let contra = 0;
  let def = 0;

  if (temFicha) {
    for (const eixo of estado.indice.eixos) {
      const p = pontuar(c.ficha, eixo);
      const est = p.estado === "sem-registro" || p.estado === "sem-lado" ? "sem" : p.estado;
      notas[eixo.id] = est;
      if (est === "contra") contra++;
      if (est === "defende") def++;
    }
  } else {
    for (const eixo of EIXO_ORDEM) {
      notas[eixo] = "sem";
    }
  }

  let fotoSrc = null;
  if (c.foto === "t") fotoSrc = `fotos-tse/${sq}.jpg`;
  else if (c.foto === "c" && c.ficha?.camaraId) fotoSrc = `fotos/${c.ficha.camaraId}.jpg`;

  const noRadar = contra >= LIMIAR_RADAR;
  const placar = `${contra} contra · ${def} a favor`;
  const fidelidade = c.ficha && c.ficha.bancadaAferivel
    ? `Votou com o próprio partido em ${Math.round((100 * c.ficha.comMaioria) / c.ficha.bancadaAferivel)}% das ${numeroBr(c.ficha.bancadaAferivel)} votações mensuráveis — fato, não virtude.`
    : "";

  const vm = {
    sq,
    numero: c.numero,
    nome: c.nome,
    nomeCompleto: c.nomeCompleto,
    cargo: c.cargo,
    cargoCurto,
    partido,
    perfil: c.perfil,
    ficha: c.ficha,
    temFicha,
    uf: par.arquivo.uf,
    notas,
    contra,
    def,
    fotoSrc,
    iniciais: iniciaisDe(c.nome),
    matiz: (c.numero * 137) % 360,
    noRadar,
    placar,
    fidelidade,
  };

  if (!par.arquivo.vm) par.arquivo.vm = new Map();
  par.arquivo.vm.set(sq, vm);
  return vm;
}

async function carregarIndice() {
  if (estado.indice) return estado.indice;
  estado.indice = await carregarJson("data/dex/indice.json");
  return estado.indice;
}

async function carregarUf(sigla) {
  if (!sigla) return null;
  const s = sigla.toUpperCase();
  if (estado.arquivos.has(s)) return estado.arquivos.get(s);
  const dados = await carregarJson(`data/dex/${s}.json`);
  dados.indices = Object.fromEntries(dados.colunas.map((col, idx) => [col, idx]));
  estado.arquivos.set(s, dados);
  return dados;
}
async function carregarTodasUfs() {
  await Promise.all(estado.indice.ufs.map((u) => carregarUf(u.sigla)));
}


function pool(uf) {
  const arqBr = estado.arquivos.get("BR");
  const arqUf = uf && uf !== "BR" ? estado.arquivos.get(uf) : null;
  const lista = [];
  if (arqBr) {
    for (const linha of arqBr.candidatos) {
      lista.push(enriquecer({ arquivo: arqBr, linha }));
    }
  }
  if (arqUf) {
    for (const linha of arqUf.candidatos) {
      lista.push(enriquecer({ arquivo: arqUf, linha }));
    }
  }
  return lista;
}

function poolTodos() {
  const lista = [];
  for (const arq of estado.arquivos.values()) {
    for (const linha of arq.candidatos) {
      lista.push(enriquecer({ arquivo: arq, linha }));
    }
  }
  return lista;
}
function ufDoPost(dados) {
  const sqs = [dados.sq, dados.nao, dados.sim, ...(dados.faces ?? [])].filter(Boolean);
  const ufs = sqs.map((sq) => ufDoSq(sq)).filter(Boolean);
  return ufs.find((u) => u !== "BR") ?? ufs[0] ?? null;
}


function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.removeAttribute("hidden");
  clearTimeout(estado.toastTimer);
  estado.toastTimer = setTimeout(() => {
    el.setAttribute("hidden", "");
  }, 2400);
}

function direcao(c, ladoT, n = 3) {
  const ids = EIXO_ORDEM.filter((id) => c.notas[id] === ladoT).slice(0, n);
  const favor = [];
  const contra = [];
  for (const id of ids) {
    const votouSim = (ladoT === "contra") !== Boolean(DEFENDE_SIM[id]);
    (votouSim ? favor : contra).push(TEMA_SIM[id]);
  }
  return { favor, contra };
}

function direcaoIds(ids, ladoT) {
  const favor = [];
  const contra = [];
  for (const item of ids) {
    const id = typeof item === "number" ? EIXO_ORDEM[item] : item;
    if (!id || !TEMA_SIM[id]) continue;
    const votouSim = (ladoT === "contra") !== Boolean(DEFENDE_SIM[id]);
    (votouSim ? favor : contra).push(TEMA_SIM[id]);
  }
  return { favor, contra };
}
function elegivelOponente(c, selSq, postura) {
  return c.temFicha && c.sq !== selSq && (postura === "nao" ? c.def >= 3 && c.contra === 0 : c.contra >= 3);
}

function elegivelPauta(c, eixos, lado) {
  return eixos.length > 0 && eixos.every((e) => c.notas[e] === lado);
}

function elegivelLista(c, eixos) {
  return c.temFicha && c.contra >= 1 && eixos.every((e) => c.notas[e] === "contra");
}


function montarPost(dados, poolCandidatos) {
  const tipo = dados.tipo ?? "candidato";
  const postura = dados.postura ?? "nao";
  const modelo = dados.modelo ?? "cabine";
  const lado = postura === "nao" ? "contra" : "defende";
  const uf = dados.uf || ufDoPost(dados) || estado.uf || "SP";

  const arqBr = estado.arquivos.get("BR");
  const arqUf = uf === "BR" ? null : estado.arquivos.get(uf);
  const pelaBlindagem = aFavorDaBlindagem(arqBr) + aFavorDaBlindagem(arqUf);

  let idCodec = dados.id;
  if (!idCodec) {
    try {
      idCodec = codificar(dados);
    } catch {
      idCodec = "";
    }
  }

  const link = idCodec ? textoLink(postura, idCodec) : `votosecreto.com.br/#/${postura}/...`;
  const url = idCodec ? montarUrl(postura, idCodec) : `https://${link}`;

  if (tipo === "candidato") {
    const c = poolCandidatos.find((x) => x.sq === dados.sq) ?? {
      nome: "",
      numero: "",
      partido: "",
      cargoCurto: "Candidato",
      fotoSrc: null,
      iniciais: "VS",
      matiz: 260,
      notas: {},
    };

    const motivosDisp = EIXO_ORDEM.filter((id) => c.notas[id] === lado);
    const motivosBrutos = dados.motivos ?? motivosDisp.slice(0, 4);
    const motivosSel = motivosBrutos.map((m) => (typeof m === "number" ? EIXO_ORDEM[m] : m)).filter(Boolean);
    const dirs = direcaoIds(motivosSel, lado);

    let legenda = "";
    if (motivosSel.length === 0) {
      legenda = postura === "nao"
        ? `O voto é secreto. O meu não vai pro ${c.numero}.`
        : `O voto é secreto. O meu vai pro ${c.numero}: ${titulo(c.nome)}.`;
    } else if (postura === "nao") {
      legenda = `O voto é secreto. O que ${titulo(c.nome)} fez no Congresso, não: votou ${CURTO[motivosSel[0]].contra.toLowerCase()}. NÃO VOTO no ${c.numero}.`;
    } else {
      legenda = `Enquanto ${pelaBlindagem} candidaturas ${uf === "BR" ? "do Brasil" : `de ${uf}`} votavam pela blindagem, ${titulo(c.nome)} votou ${CURTO[motivosSel[0]].defende.toLowerCase()}. VOTO ${c.numero}.`;
    }

    return {
      tipo,
      postura,
      modelo,
      uf,
      link,
      url,
      meta: `${c.cargoCurto} · ${uf} · 2026`,
      candidato: {
        nome: c.nome,
        numero: c.numero,
        partido: c.partido,
        cargoCurto: c.cargoCurto,
        fotoSrc: c.fotoSrc,
        iniciais: c.iniciais,
        matiz: c.matiz,
        favor: dirs.favor,
        contra: dirs.contra,
      },
      legenda,
      storyTitulo: postura === "nao" ? "MEU VOTO É SECRETO. MAS NESSE NÃO VOTO." : "MEU VOTO É SECRETO. MAS NESSE EU VOTO.",
      motivosSel,
    };
  }

  if (tipo === "duelo") {
    const naoCand = poolCandidatos.find((x) => x.sq === dados.nao) ?? { nome: "", numero: "", partido: "", cargoCurto: "Candidato", fotoSrc: null, iniciais: "VS", matiz: 260, notas: {} };
    const simCand = poolCandidatos.find((x) => x.sq === dados.sim) ?? { nome: "", numero: "", partido: "", cargoCurto: "Candidato", fotoSrc: null, iniciais: "VS", matiz: 260, notas: {} };

    const dirNao = direcao(naoCand, "contra", 3);
    const dirSim = direcao(simCand, "defende", 3);

    const primeiroContra = EIXO_ORDEM.find((id) => naoCand.notas[id] === "contra") ?? "blindagem";
    const acaoNao = naoCand.notas.blindagem === "contra"
      ? "votou pela blindagem"
      : `votou ${CURTO[primeiroContra].contra.toLowerCase()}`;

    const legenda = `O voto é secreto, a escolha não: ${titulo(simCand.nome)} defendeu quem trabalha. ${titulo(naoCand.nome)} ${acaoNao}. Este não, este sim.`;

    return {
      tipo,
      postura,
      modelo,
      uf,
      link,
      url,
      meta: `Duelo · ${naoCand.cargoCurto} · ${uf}`,
      duelo: {
        nao: {
          nome: naoCand.nome,
          numero: naoCand.numero,
          partido: naoCand.partido,
          fotoSrc: naoCand.fotoSrc,
          iniciais: naoCand.iniciais,
          matiz: naoCand.matiz,
          favor: dirNao.favor,
          contra: dirNao.contra,
        },
        sim: {
          nome: simCand.nome,
          numero: simCand.numero,
          partido: simCand.partido,
          fotoSrc: simCand.fotoSrc,
          iniciais: simCand.iniciais,
          matiz: simCand.matiz,
          favor: dirSim.favor,
          contra: dirSim.contra,
        },
      },
      legenda,
      storyTitulo: "MEU VOTO É SECRETO. 🤭",
    };
  }

  if (tipo === "pauta") {
    const eixosIds = (dados.eixos ?? []).map((i) => (typeof i === "number" ? EIXO_ORDEM[i] : i)).filter((id) => id && TEMA_SIM[id]);
    if (eixosIds.length === 0) eixosIds.push("blindagem");
    const unico = eixosIds.length === 1 ? eixosIds[0] : null;
    const faces = (dados.faces ?? []).map((sq) => poolCandidatos.find((x) => x.sq === sq)).filter((f) => f && elegivelPauta(f, eixosIds, lado));

    const eixoObj = unico ? (estado.indice.eixos.find((e) => e.id === unico) ?? estado.indice.eixos[0]) : null;
    const codigo = eixoObj ? (lado === "contra" ? eixoObj.contraOEleitor : eixoObj.defendeOEleitor) : null;
    const faixa = unico ? `VOTOU ${codigo === 1 ? "SIM" : "NÃO"}` : "CONTRA VOCÊ";
    const tituloPauta = unico ? PAUTA_TITULO[unico][lado] : "QUEM VOTOU " + juntarE(eixosIds.map((e) => CURTO[e][lado])).toUpperCase();
    const fonteRotulo = "Votaram";
    const fonteBadges = eixosIds.map((e) => CURTO[e][lado]);

    const legenda = `${titulo(tituloPauta)} ${uf === "BR" ? "no Brasil" : `em ${uf}`}. Registro nominal do Congresso, nome por nome. Guarde os números.`;

    return {
      tipo,
      postura,
      modelo,
      uf,
      link,
      url,
      meta: `Pauta · ${uf} · 2026`,
      grade: {
        titulo: tituloPauta,
        faixa,
        faces: faces.map((f) => ({
          nome: f.nome,
          numero: f.numero,
          fotoSrc: f.fotoSrc,
          iniciais: f.iniciais,
          matiz: f.matiz,
        })),
        fonteRotulo,
        fonteBadges,
      },
      legenda,
      storyTitulo: "GUARDE OS NÚMEROS.",
      eixosIds,
    };
  }

  if (tipo === "lista") {
    const eixosIds = (dados.eixos ?? []).map((i) => (typeof i === "number" ? EIXO_ORDEM[i] : i)).filter((id) => id && TEMA_SIM[id]);
    const faces = (dados.faces ?? []).map((sq) => poolCandidatos.find((x) => x.sq === sq)).filter((f) => f && elegivelLista(f, eixosIds));
    const badgesUnion = [...new Set(faces.flatMap((f) => direcao(f, "contra", 8).favor))].slice(0, 6);
    const fonteRotulo = eixosIds.length ? "Votaram" : "Eles apoiaram";
    const fonteBadges = eixosIds.length ? eixosIds.map((e) => CURTO[e].contra) : badgesUnion;

    const legenda = eixosIds.length
      ? `${faces.length} candidaturas ${uf === "BR" ? "do Brasil" : `de ${uf}`} que votaram ${juntarE(eixosIds.map((e) => CURTO[e].contra.toLowerCase()))}, nome por nome, com registro nominal do Congresso. Meu voto é secreto — mas não vai pra nenhum destes.`
      : `${faces.length} candidaturas ${uf === "BR" ? "do Brasil" : `de ${uf}`} que votaram contra quem trabalha, nome por nome, com registro nominal do Congresso. Meu voto é secreto — mas não vai pra nenhum destes.`;

    return {
      tipo,
      postura,
      modelo,
      uf,
      link,
      url,
      meta: `Lista · ${uf} · 2026`,
      grade: {
        titulo: "NÃO VOTO EM NENHUM DESTES",
        faixa: "CONTRA VOCÊ",
        faces: faces.map((f) => ({
          nome: f.nome,
          numero: f.numero,
          fotoSrc: f.fotoSrc,
          iniciais: f.iniciais,
          matiz: f.matiz,
        })),
        fonteRotulo,
        fonteBadges,
      },
      legenda,
      storyTitulo: "NENHUM DESTES. 🤭",
      eixosIds,
    };
  }

  throw new Error(`Tipo desconhecido: ${tipo}`);
}

function abrirComposer(vm, postura, tipo = "candidato", extra = {}) {
  estado.rascunho = {
    sq: vm.sq,
    uf: vm.uf === "BR" ? estado.uf : vm.uf,
    postura,
    tipo,
    modelo: "cabine",
    motivos: null,
    oponente: null,
    eixosPauta: [],
    listaSel: null,
    busca: "",
    buscaAberta: false,
    ...extra,
  };
  location.hash = "#/novo";
}

function trocarTela(nomeTela) {
  if (estado.scanStream) {
    for (const track of estado.scanStream.getTracks()) track.stop();
    estado.scanStream = null;
  }
  if (estado.scanInterval) {
    clearInterval(estado.scanInterval);
    estado.scanInterval = null;
  }

  const telas = document.querySelectorAll(".tela");
  for (const tela of telas) {
    if (tela.dataset.tela === nomeTela) {
      tela.removeAttribute("hidden");
    } else {
      tela.setAttribute("hidden", "");
    }
  }

  const navAbas = document.getElementById("abas");
  const abasVisiveis = ["catalogo", "radar", "criar", "scan"].includes(nomeTela);
  if (abasVisiveis) {
    navAbas.removeAttribute("hidden");
    if (nomeTela === "scan") {
      navAbas.style.background = "#0e0d12";
      navAbas.style.borderTopColor = "#2a2733";
    } else {
      navAbas.style.background = "var(--papel)";
      navAbas.style.borderTopColor = "rgba(19, 18, 24, 0.15)";
    }

    const btnCat = document.getElementById("aba-catalogo");
    const btnCriar = document.getElementById("aba-criar");
    const btnRad = document.getElementById("aba-radar");

    btnCat.classList.toggle("ativa", nomeTela === "catalogo");
    btnCriar.classList.toggle("ativa", nomeTela === "criar");
    btnRad.classList.toggle("ativa", nomeTela === "radar");

    btnCat.style.color = nomeTela === "catalogo" ? "var(--vermelho)" : nomeTela === "scan" ? "#a9a3b5" : "var(--mudo)";
    btnRad.style.color = nomeTela === "radar" ? "var(--vermelho)" : nomeTela === "scan" ? "#a9a3b5" : "var(--mudo)";
    btnCriar.style.background = nomeTela === "criar" ? "var(--vermelho)" : "var(--tinta)";
  } else {
    navAbas.setAttribute("hidden", "");
  }
}

function renderizarOnboarding() {
  trocarTela("onboarding");
  const grade = document.getElementById("onboarding-grade-ufs");
  grade.replaceChildren();

  const ufsDisponiveis = estado.indice.ufs.filter((u) => u.sigla !== "BR");
  let ufSel = estado.uf && estado.uf !== "BR" ? estado.uf : "SP";

  function atualizarBotao() {
    document.getElementById("btn-entrar-cabine").textContent = `ENTRAR NA CABINE · ${ufSel}`;
    document.getElementById("btn-entrar-todos").textContent = `Ver todas as ${numeroBr(estado.indice.totalCandidatos)} candidaturas do Brasil mesmo assim`;
  }

  for (const item of ufsDisponiveis) {
    const btn = criar("button", "btn-uf", item.sigla);
    if (item.sigla === ufSel) btn.classList.add("selecionado");
    btn.addEventListener("click", () => {
      ufSel = item.sigla;
      for (const b of grade.children) b.classList.remove("selecionado");
      btn.classList.add("selecionado");
      atualizarBotao();
    });
    grade.appendChild(btn);
  }

  atualizarBotao();

  document.getElementById("btn-entrar-cabine").onclick = () => {
    estado.uf = ufSel;
    estado.todasUfs = false;
    localStorage.removeItem(CHAVE_TODAS);
    localStorage.setItem(CHAVE_UF, ufSel);
    estado.secao = "historico";
    location.hash = "#/catalogo";
  };

  document.getElementById("btn-entrar-todos").onclick = () => {
    estado.uf = ufSel;
    estado.todasUfs = true;
    localStorage.setItem(CHAVE_TODAS, "1");
    localStorage.setItem(CHAVE_UF, ufSel);
    estado.secao = "todos";
    location.hash = "#/catalogo";
  };
}

let debounceBuscaTimer = null;

async function renderizarCatalogo() {
  if (!estado.uf || estado.uf === "BR") {
    location.replace("#/onboarding");
    return;
  }

  if (estado.todasUfs) {
    await carregarTodasUfs();
  } else {
    await carregarUf("BR");
    await carregarUf(estado.uf);
  }

  trocarTela("catalogo");

  const ufObj = estado.indice.ufs.find((u) => u.sigla === estado.uf) ?? { candidatos: 0, comFicha: 0 };
  const brObj = estado.indice.ufs.find((u) => u.sigla === "BR") ?? { candidatos: 0, comFicha: 0 };
  const comFichaTotal = estado.todasUfs ? estado.indice.totalComFicha : ufObj.comFicha + brObj.comFicha;
  const totalCandidaturas = estado.todasUfs ? estado.indice.totalCandidatos : ufObj.candidatos + brObj.candidatos;

  document.getElementById("btn-catalogo-uf").textContent = estado.todasUfs ? "Brasil ▾" : `${estado.uf} ▾`;
  document.getElementById("btn-catalogo-uf").onclick = () => {
    location.hash = "#/onboarding";
  };

  document.getElementById("btn-catalogo-scan").onclick = () => {
    location.hash = "#/scan";
  };

  document.getElementById("btn-logo-catalogo").onclick = () => {
    location.hash = "#/catalogo";
  };

  const btnHist = document.getElementById("btn-secao-historico");
  const btnTodos = document.getElementById("btn-secao-todos");

  btnHist.textContent = `Com histórico · ${numeroBr(comFichaTotal)}`;
  btnTodos.textContent = `Todos · ${numeroBr(totalCandidaturas)}`;

  btnHist.classList.toggle("ativo", estado.secao === "historico");
  btnTodos.classList.toggle("ativo", estado.secao === "todos");

  btnHist.onclick = () => {
    estado.secao = "historico";
    estado.limite = LIMITE_INICIAL;
    btnHist.classList.add("ativo");
    btnTodos.classList.remove("ativo");
    atualizarListaCatalogo();
  };

  btnTodos.onclick = () => {
    estado.secao = "todos";
    estado.limite = LIMITE_INICIAL;
    btnTodos.classList.add("ativo");
    btnHist.classList.remove("ativo");
    atualizarListaCatalogo();
  };

  const inputBusca = document.getElementById("input-busca");
  const chipLcd = document.getElementById("chip-busca-lcd");
  const btnLimpar = document.getElementById("btn-limpar-busca");

  inputBusca.value = estado.q;
  chipLcd.style.display = /^\d+$/.test(estado.q.trim()) && estado.q.trim() !== "" ? "inline-block" : "none";
  chipLcd.textContent = estado.q.trim();
  btnLimpar.style.display = estado.q !== "" ? "grid" : "none";

  inputBusca.oninput = (e) => {
    clearTimeout(debounceBuscaTimer);
    debounceBuscaTimer = setTimeout(() => {
      estado.q = e.target.value;
      estado.limite = LIMITE_INICIAL;
      chipLcd.style.display = /^\d+$/.test(estado.q.trim()) && estado.q.trim() !== "" ? "inline-block" : "none";
      chipLcd.textContent = estado.q.trim();
      btnLimpar.style.display = estado.q !== "" ? "grid" : "none";
      atualizarListaCatalogo();
    }, 140);
  };

  btnLimpar.onclick = () => {
    estado.q = "";
    inputBusca.value = "";
    chipLcd.style.display = "none";
    btnLimpar.style.display = "none";
    estado.limite = LIMITE_INICIAL;
    atualizarListaCatalogo();
  };

  document.getElementById("btn-abrir-filtros").onclick = () => {
    abrirFolhaFiltros();
  };

  atualizarBadgeFiltros();
  atualizarListaCatalogo();
}

function atualizarBadgeFiltros() {
  const cracha = document.getElementById("cracha-filtros");
  let n = 0;
  if (estado.ordem !== "contra") n++;
  if (estado.cargo !== "todos") n++;
  if (estado.perfil !== "todos") n++;
  if (n > 0) {
    cracha.textContent = String(n);
    cracha.style.display = "inline-block";
  } else {
    cracha.style.display = "none";
  }
}

function abrirFolhaFiltros() {
  const dialog = document.getElementById("folha-filtros");
  const gOrdem = document.getElementById("filtros-grupo-ordem");
  const gCargo = document.getElementById("filtros-grupo-cargo");
  const gPerfil = document.getElementById("filtros-grupo-perfil");

  gOrdem.replaceChildren();
  gCargo.replaceChildren();
  gPerfil.replaceChildren();

  const ordens = [
    ["contra", "Mais contra o eleitor"],
    ["defende", "Mais a favor"],
    ["numero", "Número"],
  ];
  for (const [chave, rotulo] of ordens) {
    const btn = criar("button", "chip-opcao" + (estado.ordem === chave ? " ativo" : ""), rotulo);
    btn.onclick = () => {
      estado.ordem = chave;
      for (const b of gOrdem.children) b.classList.remove("ativo");
      btn.classList.add("ativo");
      atualizarListaCatalogo();
      atualizarBadgeFiltros();
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
    const btn = criar("button", "chip-opcao" + (estado.cargo === chave ? " ativo" : ""), rotulo);
    btn.onclick = () => {
      estado.cargo = chave;
      for (const b of gCargo.children) b.classList.remove("ativo");
      btn.classList.add("ativo");
      atualizarListaCatalogo();
      atualizarBadgeFiltros();
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
    const btn = criar("button", "chip-opcao" + (estado.perfil === chave ? " ativo" : ""), rotulo);
    btn.onclick = () => {
      estado.perfil = chave;
      for (const b of gPerfil.children) b.classList.remove("ativo");
      btn.classList.add("ativo");
      atualizarListaCatalogo();
      atualizarBadgeFiltros();
    };
    gPerfil.appendChild(btn);
  }

  document.getElementById("btn-limpar-filtros").onclick = () => {
    estado.ordem = "contra";
    estado.cargo = "todos";
    estado.perfil = "todos";
    for (const b of gOrdem.children) b.classList.toggle("ativo", b.textContent === "Mais contra o eleitor");
    for (const b of gCargo.children) b.classList.toggle("ativo", b.textContent === "Todos os cargos");
    for (const b of gPerfil.children) b.classList.toggle("ativo", b.textContent === "Todos");
    atualizarBadgeFiltros();
    atualizarListaCatalogo();
  };

  document.getElementById("btn-fechar-filtros").onclick = () => {
    dialog.close();
  };

  dialog.showModal();
}

function atualizarListaCatalogo() {
  const contagemEl = document.getElementById("catalogo-contagem");
  const listaEl = document.getElementById("catalogo-lista");
  const btnMais = document.getElementById("btn-carregar-mais");

  const candidatos = estado.todasUfs ? poolTodos() : pool(estado.uf);
  const q = achatar(estado.q.trim());
  const numerico = /^\d+$/.test(q);

  const filtrados = candidatos.filter((c) => {
    if (estado.secao === "historico" && !c.temFicha) return false;
    if (estado.cargo !== "todos" && String(c.cargo) !== estado.cargo) return false;
    if (estado.perfil !== "todos" && c.perfil !== estado.perfil) return false;
    if (q === "") return true;
    if (numerico) return String(c.numero).startsWith(q);
    return achatar(c.nome).includes(q) || achatar(c.nomeCompleto).includes(q);
  });

  filtrados.sort((a, b) => {
    if (estado.ordem === "contra") {
      return b.contra - a.contra || a.def - b.def || a.numero - b.numero;
    }
    if (estado.ordem === "defende") {
      return b.def - a.def || a.contra - b.contra || a.numero - b.numero;
    }
    return a.numero - b.numero;
  });

  const totalFiltrado = filtrados.length;
  const ufObj = estado.indice.ufs.find((u) => u.sigla === estado.uf) ?? { candidatos: 0, comFicha: 0 };
  const brObj = estado.indice.ufs.find((u) => u.sigla === "BR") ?? { candidatos: 0, comFicha: 0 };
  const comFicha = estado.todasUfs ? estado.indice.totalComFicha : ufObj.comFicha + brObj.comFicha;
  const totalUf = estado.todasUfs ? estado.indice.totalCandidatos : ufObj.candidatos + brObj.candidatos;

  if (estado.secao === "historico") {
    contagemEl.textContent = `${totalFiltrado} de ${numeroBr(comFicha)} com histórico no Congresso · ${numeroBr(totalUf)} no total`;
  } else {
    contagemEl.textContent = `${numeroBr(totalFiltrado)} candidaturas ${estado.todasUfs ? "no Brasil" : `em ${estado.uf}`} · ${numeroBr(comFicha)} com histórico`;
  }

  listaEl.replaceChildren();

  if (totalFiltrado === 0) {
    const vazio = criar(
      "div",
      "cartao-sem-ficha",
      "Nenhuma candidatura com histórico no Congresso bate com essa busca. Ausência de registro não é nota: estreantes aparecem em Todos.",
    );
    vazio.style.padding = "34px 20px";
    vazio.style.textAlign = "center";
    vazio.style.fontSize = "14px";
    listaEl.appendChild(vazio);
    btnMais.style.display = "none";
    return;
  }

  const exibidos = filtrados.slice(0, estado.limite);
  for (const c of exibidos) {
    const art = criar("article", "cartao-candidato");

    const corpo = criar("div", "cartao-corpo");
    corpo.onclick = () => {
      location.hash = `#/ficha/${c.sq}`;
    };

    const quadroFoto = criar("div", "foto-quadro");
    quadroFoto.style.background = `hsl(${c.matiz} 30% 42%)`;
    if (c.fotoSrc) {
      const img = criar("div", "foto-imagem");
      img.style.backgroundImage = `url("${c.fotoSrc}")`;
      quadroFoto.appendChild(img);
    } else {
      quadroFoto.appendChild(criar("span", undefined, c.iniciais));
    }
    corpo.appendChild(quadroFoto);

    const info = criar("div", "cartao-info");

    const linhaNome = criar("div", "cartao-linha-nome");
    linhaNome.appendChild(criar("div", "cartao-nome", c.nome));
    linhaNome.appendChild(criar("span", "lcd-numero", String(c.numero)));
    info.appendChild(linhaNome);

    const meta = criar("div", "cartao-meta");
    let metaTexto = `${c.partido} · ${c.cargoCurto} · ${PERFIL_ROTULO[c.perfil] ?? c.perfil}`;
    if (estado.todasUfs) metaTexto += ` · ${c.uf}`;
    meta.appendChild(criar("span", undefined, metaTexto));
    if (c.noRadar) {
      meta.appendChild(criar("span", "selo-radar", "NO RADAR"));
    }
    info.appendChild(meta);

    if (c.temFicha) {
      const regua = criar("div", "regua-eixos");
      for (const eixoId of EIXO_ORDEM) {
        const seg = criar("span", "regua-seg");
        const est = c.notas[eixoId];
        seg.style.background =
          est === "contra" ? "var(--vermelho)" : est === "defende" ? "var(--verde)" : est === "misto" ? "var(--misto)" : "var(--sem)";
        regua.appendChild(seg);
      }
      info.appendChild(regua);
      info.appendChild(criar("div", "cartao-placar", c.placar));
    } else {
      info.appendChild(criar("div", "cartao-sem-ficha", "Sem histórico no Congresso — não é nota, é ausência de registro."));
    }

    corpo.appendChild(info);
    art.appendChild(corpo);

    const botoes = criar("div", "botoes-declaracao");
    const btnNao = criar("button", "btn-nao-voto", "NÃO VOTO");
    btnNao.onclick = (e) => {
      e.stopPropagation();
      abrirComposer(c, "nao");
    };

    const btnVoto = criar("button", "btn-voto", "VOTO");
    btnVoto.onclick = (e) => {
      e.stopPropagation();
      abrirComposer(c, "voto");
    };

    botoes.appendChild(btnNao);
    botoes.appendChild(btnVoto);
    art.appendChild(botoes);

    listaEl.appendChild(art);
  }

  if (totalFiltrado > estado.limite) {
    const resto = totalFiltrado - estado.limite;
    btnMais.textContent = `Carregar mais (${numeroBr(resto)})`;
    btnMais.style.display = "block";
    btnMais.onclick = () => {
      estado.limite += LIMITE_INICIAL;
      atualizarListaCatalogo();
    };
  } else {
    btnMais.style.display = "none";
  }
}

async function renderizarFicha(sqStr) {
  const sq = Number(sqStr);
  const siglaUf = ufDoSq(sq) || estado.uf;
  await carregarUf("BR");
  await carregarUf(siglaUf);

  trocarTela("ficha");

  const cands = pool(siglaUf);
  const c = cands.find((x) => x.sq === sq);

  const container = document.getElementById("ficha-conteudo");
  container.replaceChildren();

  const rotuloTopo = document.getElementById("ficha-topo-rotulo");
  rotuloTopo.textContent = `FICHA · ${siglaUf}`;

  document.getElementById("btn-ficha-voltar").onclick = () => {
    if (history.length > 1) history.back();
    else location.hash = "#/catalogo";
  };

  if (!c) {
    const err = criar("div", undefined, `Candidatura ${sq} não encontrada.`);
    err.style.padding = "24px";
    err.style.color = "var(--mudo)";
    const btnVoltar = criar("button", "btn-carregar-mais", "← Voltar ao catálogo");
    btnVoltar.onclick = () => {
      location.hash = "#/catalogo";
    };
    container.appendChild(err);
    container.appendChild(btnVoltar);
    return;
  }

  const hero = criar("div", "ficha-hero");
  const fotoBox = criar("div", "foto-ficha");
  fotoBox.style.background = `hsl(${c.matiz} 30% 42%)`;
  if (c.fotoSrc) {
    const img = criar("div", "foto-imagem");
    img.style.backgroundImage = `url("${c.fotoSrc}")`;
    fotoBox.appendChild(img);
  } else {
    fotoBox.appendChild(criar("span", undefined, c.iniciais));
  }
  hero.appendChild(fotoBox);

  const detalhes = criar("div", "ficha-detalhes");
  if (c.noRadar) {
    detalhes.appendChild(criar("span", "selo-radar", "NO RADAR"));
  }
  detalhes.appendChild(criar("div", "ficha-nome", c.nome));
  detalhes.appendChild(criar("div", "ficha-meta", `${c.partido} · ${c.cargoCurto} · ${siglaUf}`));

  let perfilTexto = "";
  const cargoNome = titulo(c.cargoCurto);
  if (c.perfil === "reeleicao") {
    perfilTexto = `Tenta a reeleição · ${cargoNome} em exercício`;
  } else if (c.perfil === "outro" && c.ficha?.mandatoAtual) {
    const casaTxt = c.ficha.mandatoAtual === "camara" ? "Deputado federal" : "Senador";
    perfilTexto = `${casaTxt} em exercício · concorre a ${cargoNome}`;
  } else if (c.perfil === "outro" && c.temFicha) {
    perfilTexto = `Já teve mandato no Congresso · concorre a ${cargoNome}`;
  } else if (c.perfil === "outro") {
    perfilTexto = "Já teve mandato · sem votações no Congresso";
  } else {
    perfilTexto = "Estreante · sem mandato anterior registrado";
  }

  detalhes.appendChild(criar("div", "ficha-perfil-linha", perfilTexto));
  detalhes.appendChild(criar("div", "onboarding-legenda-uf", "número na urna"));
  detalhes.appendChild(criar("span", "lcd-ficha", String(c.numero)));
  hero.appendChild(detalhes);
  container.appendChild(hero);

  const blocoVotos = criar("div", "bloco-eixos");
  blocoVotos.appendChild(
    criar("div", "bloco-titulo-eixos", `Como votou no Congresso · ${c.temFicha ? c.placar : "Sem histórico"}`),
  );

  if (!c.temFicha) {
    let msg = "";
    if (c.perfil === "novo") {
      msg = "Estreante: sem mandato anterior e sem votações nominais no Congresso. Não é nota baixa, é ausência de registro. Você ainda pode declarar; o post sai sem motivos.";
    } else {
      msg = "Teve mandato fora do Congresso (câmara municipal, prefeitura ou governo estadual), então não há votação nominal federal para mostrar. Você ainda pode declarar; o post sai sem motivos.";
    }
    const notaSem = criar("div", undefined, msg);
    notaSem.style.padding = "14px";
    notaSem.style.background = "#fff";
    notaSem.style.border = "1.5px dashed rgba(19, 18, 24, 0.3)";
    notaSem.style.borderRadius = "8px";
    notaSem.style.fontSize = "13px";
    notaSem.style.lineHeight = "1.5";
    notaSem.style.color = "var(--corpo)";
    blocoVotos.appendChild(notaSem);
  } else {
    for (const eixo of estado.indice.eixos) {
      const est = c.notas[eixo.id] ?? "sem";
      const item = criar("div", `item-eixo-ficha ${est}`);

      const conteudo = criar("div", undefined);
      conteudo.style.flex = "1";
      conteudo.style.minWidth = "0";

      let textoVoto = "Sem registro nestas votações";
      if (est === "contra" || est === "defende") {
        textoVoto = VERBO[eixo.id][est];
      } else if (est === "misto") {
        textoVoto = "Votou nos dois lados";
      }

      conteudo.appendChild(criar("div", "item-eixo-texto", textoVoto));
      const v = eixo.votacoes[0];
      const sub = v ? `${eixo.nome} · ${v.sim} Sim × ${v.nao} Não` : eixo.nome;
      conteudo.appendChild(criar("div", "item-eixo-sub", sub));
      const isSenado = String(v?.id || "").startsWith("SF-");
      const urlAta = isSenado
        ? `https://legis.senado.leg.br/dadosabertos/votacao?idProcesso=${v.idProcesso}`
        : `https://www.camara.leg.br/presenca-comissoes/votacao-portal?idVotacao=${v.id}`;
      const linkAta = criar("a", undefined, "ata da votação ↗");
      linkAta.href = urlAta;
      linkAta.target = "_blank";
      linkAta.rel = "noopener noreferrer";
      linkAta.style.fontSize = "11px";
      linkAta.style.color = "var(--mudo)";
      linkAta.style.textDecoration = "underline";
      linkAta.style.display = "inline-block";
      linkAta.style.marginTop = "2px";
      conteudo.appendChild(linkAta);
      item.appendChild(conteudo);
      blocoVotos.appendChild(item);
    }

    if (c.fidelidade) {
      const notaFid = criar(
        "div",
        "nota-fidelidade",
        `${c.fidelidade} Fonte: votações nominais da Câmara dos Deputados e do Senado Federal.`,
      );
      blocoVotos.appendChild(notaFid);
    }
  }

  container.appendChild(blocoVotos);

  document.getElementById("btn-ficha-nao").onclick = () => {
    abrirComposer(c, "nao");
  };
  document.getElementById("btn-ficha-voto").onclick = () => {
    abrirComposer(c, "voto");
  };
}
function montarBuscaCandidato(r, { pool, elegivel, aoEscolher, placeholder, vazio }) {
  const container = criar("div", undefined);
  container.style.marginTop = "8px";

  if (!r.buscaAberta) {
    const btnAbrir = criar("button", "btn-carregar-mais", "+ Adicionar outro");
    btnAbrir.style.borderStyle = "dashed";
    btnAbrir.style.width = "100%";
    btnAbrir.onclick = () => {
      r.buscaAberta = true;
      renderizarComposer();
    };
    container.appendChild(btnAbrir);
    return container;
  }

  const caixa = criar("div", undefined);
  caixa.style.border = "1.5px solid var(--tinta)";
  caixa.style.borderRadius = "10px";
  caixa.style.padding = "10px";
  caixa.style.background = "#fff";

  const topo = criar("div", undefined);
  topo.style.display = "flex";
  topo.style.gap = "8px";
  topo.style.alignItems = "center";
  topo.style.marginBottom = "8px";

  const input = document.createElement("input");
  input.type = "text";
  input.value = r.busca ?? "";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.style.flex = "1";
  input.style.padding = "8px 10px";
  input.style.border = "1px solid rgba(19, 18, 24, 0.2)";
  input.style.borderRadius = "6px";
  input.style.fontSize = "13px";
  input.style.fontFamily = "var(--fonte-corpo)";

  const btnFechar = criar("button", undefined, "Fechar");
  btnFechar.style.background = "transparent";
  btnFechar.style.border = "none";
  btnFechar.style.fontSize = "12.5px";
  btnFechar.style.fontWeight = "700";
  btnFechar.style.color = "var(--mudo)";
  btnFechar.style.cursor = "pointer";
  btnFechar.style.padding = "4px 8px";
  btnFechar.onclick = () => {
    r.buscaAberta = false;
    r.busca = "";
    renderizarComposer();
  };

  topo.appendChild(input);
  topo.appendChild(btnFechar);
  caixa.appendChild(topo);

  const containerResultados = criar("div", undefined);
  containerResultados.style.display = "flex";
  containerResultados.style.flexDirection = "column";
  containerResultados.style.gap = "6px";
  caixa.appendChild(containerResultados);

  function renderizarResultados() {
    containerResultados.innerHTML = "";
    const q = achatar((r.busca ?? "").trim());
    if (!q) {
      const msgVazio = criar("div", undefined, vazio);
      msgVazio.style.fontSize = "12px";
      msgVazio.style.color = "var(--mudo)";
      msgVazio.style.padding = "6px 0";
      containerResultados.appendChild(msgVazio);
      return;
    }

    const filtrados = pool
      .filter((c) => elegivel(c) && (/^\d+$/.test(q) ? String(c.numero).startsWith(q) : achatar(c.nome).includes(q) || achatar(c.nomeCompleto).includes(q)))
      .slice(0, 8);

    if (filtrados.length === 0) {
      const semResultados = criar("div", undefined, "Nenhuma candidatura elegível bate com essa busca.");
      semResultados.style.fontSize = "12px";
      semResultados.style.color = "var(--mudo)";
      semResultados.style.padding = "6px 0";
      containerResultados.appendChild(semResultados);
      return;
    }

    for (const c of filtrados) {
      const linha = criar("div", undefined);
      linha.style.display = "flex";
      linha.style.alignItems = "center";
      linha.style.gap = "8px";
      linha.style.padding = "4px 0";
      linha.style.borderBottom = "1px solid rgba(19, 18, 24, 0.08)";

      const fotoQuadro = criar("div", "foto-quadro");
      fotoQuadro.style.width = "36px";
      fotoQuadro.style.height = "46px";
      fotoQuadro.style.backgroundColor = `hsl(${c.matiz} 30% 42%)`;
      fotoQuadro.style.fontSize = "13px";
      fotoQuadro.textContent = c.iniciais;
      if (c.fotoSrc) {
        const fotoImg = criar("div", "foto-imagem");
        fotoImg.style.backgroundImage = `url("${c.fotoSrc}")`;
        fotoQuadro.appendChild(fotoImg);
      }
      linha.appendChild(fotoQuadro);

      const info = criar("div", undefined);
      info.style.flex = "1";
      info.style.minWidth = "0";

      const nomeEl = criar("div", undefined, c.nome);
      nomeEl.style.fontWeight = "800";
      nomeEl.style.fontSize = "13px";
      nomeEl.style.textTransform = "uppercase";
      nomeEl.style.color = "var(--tinta)";
      nomeEl.style.overflow = "hidden";
      nomeEl.style.textOverflow = "ellipsis";
      nomeEl.style.whiteSpace = "nowrap";

      const subEl = criar("div", undefined, `${c.partido} · ${c.numero} · ${c.uf}`);
      subEl.style.fontSize = "11.5px";
      subEl.style.color = "var(--mudo)";

      info.appendChild(nomeEl);
      info.appendChild(subEl);
      linha.appendChild(info);

      const btnAdd = criar("button", "btn-pilula", "Adicionar");
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


async function renderizarCriarHub() {
  if (!estado.uf || estado.uf === "BR") estado.uf = "SP";
  await carregarUf("BR");
  await carregarUf(estado.uf);

  trocarTela("criar");

  const cands = pool(estado.uf);
  const ranking = cands.filter((c) => c.temFicha && c.contra >= 1).sort((a, b) => b.contra - a.contra || a.def - b.def);
  const defensores = cands.filter((c) => c.temFicha && c.def >= 3 && c.contra === 0);
  const top1 = ranking[0] ?? cands[0] ?? { sq: 0, nome: "", numero: 0, partido: "", cargoCurto: "Candidato", notas: {} };
  const topDef = defensores[0] ?? cands[1] ?? top1;

  document.getElementById("hub-lista-desc").textContent =
    `Até 9 de uma vez. Já vem com nomes selecionados do radar de ${estado.uf} — você só escolhe quem entra.`;

  document.getElementById("hub-opcao-candidato").onclick = () => {
    location.hash = "#/catalogo";
  };

  document.getElementById("hub-opcao-duelo").onclick = () => {
    abrirComposer(top1, "nao", "duelo");
  };

  document.getElementById("hub-opcao-lista").onclick = () => {
    abrirComposer(top1, "nao", "lista");
  };

  document.getElementById("hub-opcao-pauta").onclick = () => {
    abrirComposer(top1, "nao", "pauta", { eixosPauta: ["blindagem"] });
  };

  document.getElementById("hub-opcao-scan").onclick = () => {
    location.hash = "#/scan";
  };

  const miniPostCand = montarPost({ tipo: "candidato", postura: "nao", modelo: "cabine", sq: top1.sq, uf: estado.uf }, cands);
  const miniPostDuelo = montarPost({ tipo: "duelo", postura: "nao", modelo: "cabine", nao: top1.sq, sim: topDef.sq, uf: estado.uf }, cands);
  const miniPostLista = montarPost({ tipo: "lista", postura: "nao", modelo: "cabine", faces: ranking.slice(0, 6).map((c) => c.sq), uf: estado.uf }, cands);
  const miniPostPauta = montarPost({ tipo: "pauta", postura: "nao", modelo: "cabine", eixos: [0], faces: cands.filter((c) => c.notas.blindagem === "contra").slice(0, 6).map((c) => c.sq), uf: estado.uf }, cands);

  desenharCartao(document.getElementById("mini-candidato"), miniPostCand).catch(() => {});
  desenharCartao(document.getElementById("mini-duelo"), miniPostDuelo).catch(() => {});
  desenharCartao(document.getElementById("mini-lista"), miniPostLista).catch(() => {});
  desenharCartao(document.getElementById("mini-pauta"), miniPostPauta).catch(() => {});
}

let debounceComposerTimer = null;

async function renderizarComposer() {
  if (!estado.rascunho) {
    location.replace("#/criar");
    return;
  }

  const r = estado.rascunho;
  const uf = r.uf || estado.uf || "SP";
  if (estado.todasUfs) await carregarTodasUfs();
  else {
    await carregarUf("BR");
    await carregarUf(uf);
  }

  trocarTela("novo");

  const cands = pool(uf);
  const candsBusca = estado.todasUfs ? poolTodos() : cands;
  const sel = cands.find((c) => c.sq === r.sq) ?? cands[0];
  const lado = r.postura === "nao" ? "contra" : "defende";

  const tituloTopo = document.getElementById("novo-titulo-topo");
  tituloTopo.textContent = r.tipo === "lista" ? "LISTA NO RADAR" : "NOVO POST";

  document.getElementById("btn-novo-voltar").onclick = () => {
    if (history.length > 1) history.back();
    else location.hash = "#/catalogo";
  };

  const controlesEl = document.getElementById("novo-controles");
  controlesEl.replaceChildren();

  if (r.tipo !== "lista") {
    const grupoPostura = criar("div", "botoes-declaracao");
    const btnNao = criar("button", "btn-nao-voto", "NÃO VOTO");
    const btnVoto = criar("button", "btn-voto", "VOTO");

    if (r.postura === "nao") {
      btnNao.style.background = "var(--vermelho)";
      btnNao.style.color = "#fff";
      btnVoto.style.background = "transparent";
      btnVoto.style.color = "var(--verde)";
    } else {
      btnNao.style.background = "transparent";
      btnNao.style.color = "var(--vermelho)";
      btnVoto.style.background = "var(--verde)";
      btnVoto.style.color = "#fff";
    }

    btnNao.onclick = () => {
      r.postura = "nao";
      r.motivos = null;
      r.oponente = null;
      r.listaSel = null;
      renderizarComposer();
    };

    btnVoto.onclick = () => {
      r.postura = "voto";
      r.motivos = null;
      r.oponente = null;
      r.listaSel = null;
      renderizarComposer();
    };

    grupoPostura.appendChild(btnNao);
    grupoPostura.appendChild(btnVoto);
    controlesEl.appendChild(grupoPostura);

    const blocoFormato = criar("div", "bloco-eixos");
    blocoFormato.appendChild(criar("div", "bloco-titulo-eixos", "Formato"));
    const grupoTipos = criar("div", "chip-grupo");

    const oponentesDisp = cands.filter((c) => elegivelOponente(c, sel.sq, r.postura));

    const tipos = [
      ["candidato", "Candidato"],
      ["duelo", "Duelo"],
      ["pauta", "Pauta"],
    ];

    for (const [tKey, tRot] of tipos) {
      const btn = criar("button", "chip-opcao" + (r.tipo === tKey ? " ativo" : ""), tRot);
      if (tKey === "duelo" && oponentesDisp.length === 0) {
        btn.disabled = true;
        btn.title = `Sem oponente com histórico em ${uf}`;
        btn.style.opacity = "0.4";
        btn.style.cursor = "not-allowed";
      }
      btn.onclick = () => {
        r.tipo = tKey;
        if (tKey === "pauta" && (!r.eixosPauta || r.eixosPauta.length === 0)) {
          r.eixosPauta = ["blindagem"];
        }
        renderizarComposer();
      };
      grupoTipos.appendChild(btn);
    }
    blocoFormato.appendChild(grupoTipos);
    controlesEl.appendChild(blocoFormato);
  }

  if (r.tipo === "candidato") {
    const blocoMotivos = criar("div", "bloco-eixos");
    const headerMotivos = criar("div", "topo-barra");
    const motivosDisp = EIXO_ORDEM.filter((id) => sel.notas[id] === lado);
    const motivosSel = r.motivos ?? motivosDisp.slice(0, 4);

    headerMotivos.appendChild(criar("span", "bloco-titulo-eixos", "Motivos · votações nominais"));
    headerMotivos.appendChild(criar("span", "bloco-titulo-eixos", `${motivosSel.length}/4`));
    blocoMotivos.appendChild(headerMotivos);

    if (motivosDisp.length === 0) {
      blocoMotivos.appendChild(
        criar(
          "p",
          "cartao-sem-ficha",
          "Nenhuma votação sustenta essa postura para esta candidatura. O post sai sem motivos — e a régua é a mesma para todo mundo.",
        ),
      );
    } else {
      const grupoM = criar("div", "chip-grupo");
      for (const eixoId of motivosDisp) {
        const ativo = motivosSel.includes(eixoId);
        const classeAtivo = ativo ? (r.postura === "nao" ? " ativo-nao" : " ativo-voto") : "";
        const btn = criar("button", "chip-motivo" + classeAtivo, CURTO[eixoId][lado]);
        btn.onclick = () => {
          if (ativo) {
            r.motivos = motivosSel.filter((x) => x !== eixoId);
          } else if (motivosSel.length < 4) {
            r.motivos = [...motivosSel, eixoId];
          }
          renderizarComposer();
        };
        grupoM.appendChild(btn);
      }
      blocoMotivos.appendChild(grupoM);
    }
    controlesEl.appendChild(blocoMotivos);
  } else if (r.tipo === "duelo") {
    const blocoDuelo = criar("div", "bloco-eixos");
    const rotuloDuelo = r.postura === "nao"
      ? "Este sim — quem defendeu o eleitor"
      : "Este não — quem votou contra o eleitor";
    blocoDuelo.appendChild(criar("div", "bloco-titulo-eixos", rotuloDuelo));

    const elegiveis = cands.filter((c) => elegivelOponente(c, sel.sq, r.postura));
    const top8 = elegiveis.slice(0, 8);
    const selOponente = r.oponente ? candsBusca.find((c) => c.sq === r.oponente) : null;
    const oponentes = [...top8];
    if (selOponente && elegivelOponente(selOponente, sel.sq, r.postura) && !oponentes.some((c) => c.sq === selOponente.sq)) {
      oponentes.unshift(selOponente);
    }

    const selOponenteSq = r.oponente ?? oponentes[0]?.sq;
    r.oponente = selOponenteSq;

    const carrossel = criar("div", undefined);
    carrossel.style.display = "flex";
    carrossel.style.gap = "8px";
    carrossel.style.overflowX = "auto";
    carrossel.style.paddingBottom = "4px";

    for (const op of oponentes) {
      const cardOp = criar("button", undefined);
      cardOp.style.flexShrink = "0";
      cardOp.style.width = "78px";
      cardOp.style.padding = "0";
      cardOp.style.border = op.sq === selOponenteSq ? "2px solid var(--tinta)" : "1.5px solid rgba(19, 18, 24, 0.15)";
      cardOp.style.borderRadius = "8px";
      cardOp.style.background = "#fff";
      cardOp.style.cursor = "pointer";
      cardOp.style.overflow = "hidden";
      cardOp.style.textAlign = "left";

      const fotoDiv = criar("div", undefined);
      fotoDiv.style.width = "100%";
      fotoDiv.style.height = "84px";
      fotoDiv.style.backgroundColor = `hsl(${op.matiz} 30% 42%)`;
      if (op.fotoSrc) {
        fotoDiv.style.backgroundImage = `url("${op.fotoSrc}")`;
        fotoDiv.style.backgroundSize = "cover";
        fotoDiv.style.backgroundPosition = "center";
      }
      cardOp.appendChild(fotoDiv);

      const nomeDiv = criar("div", undefined, op.nome);
      nomeDiv.style.padding = "5px 6px";
      nomeDiv.style.fontSize = "10px";
      nomeDiv.style.fontWeight = "800";
      nomeDiv.style.lineHeight = "1.15";
      nomeDiv.style.textTransform = "uppercase";
      nomeDiv.style.color = "var(--tinta)";
      nomeDiv.style.height = "34px";
      nomeDiv.style.overflow = "hidden";
      cardOp.appendChild(nomeDiv);

      cardOp.onclick = () => {
        r.oponente = op.sq;
        renderizarComposer();
      };
      carrossel.appendChild(cardOp);
    }

    blocoDuelo.appendChild(carrossel);
    const buscaDuelo = montarBuscaCandidato(r, {
      pool: candsBusca,
      elegivel: (c) => elegivelOponente(c, sel.sq, r.postura),
      aoEscolher: (c) => {
        r.oponente = c.sq;
        r.buscaAberta = false;
        r.busca = "";
        renderizarComposer();
      },
      placeholder: `Nome ou número — quem ${r.postura === "nao" ? "defendeu" : "votou contra"} o eleitor`,
      vazio: `Digite para buscar entre as candidaturas com histórico ${estado.todasUfs ? "do Brasil" : `de ${uf}`}.`,
    });
    blocoDuelo.appendChild(buscaDuelo);
    controlesEl.appendChild(blocoDuelo);
  }

  if (r.tipo === "pauta" || r.tipo === "lista") {
    const blocoPauta = criar("div", "bloco-eixos");
    const topoBarra = criar("div", "topo-barra");
    const tituloTexto = r.tipo === "pauta" ? `Pauta · quem votou assim em ${uf}` : `Motivos · filtra o radar de ${uf}`;
    topoBarra.appendChild(criar("span", "bloco-titulo-eixos", tituloTexto));
    topoBarra.appendChild(criar("span", "bloco-titulo-eixos", `${r.eixosPauta.length}/8`));
    blocoPauta.appendChild(topoBarra);

    const grupoEixos = criar("div", "chip-grupo");
    for (const e of estado.indice.eixos) {
      const ativo = r.eixosPauta.includes(e.id);
      const btn = criar("button", "chip-opcao" + (ativo ? " ativo" : ""), e.nome);
      btn.onclick = () => {
        if (ativo && r.tipo === "pauta" && r.eixosPauta.length === 1) {
          toast("A pauta precisa de pelo menos um motivo.");
          return;
        }
        if (ativo) {
          r.eixosPauta = r.eixosPauta.filter((id) => id !== e.id);
        } else if (r.eixosPauta.length < 8) {
          r.eixosPauta = [...r.eixosPauta, e.id];
        }
        r.listaSel = null;
        r.busca = "";
        r.buscaAberta = false;
        renderizarComposer();
      };
      grupoEixos.appendChild(btn);
    }
    blocoPauta.appendChild(grupoEixos);
    controlesEl.appendChild(blocoPauta);

    const blocoGrade = criar("div", "bloco-eixos");
    const tituloGrade = r.tipo === "pauta"
      ? `Quem aparece · votaram assim em ${uf}`
      : `Quem entra na lista · ${uf}`;

    const gradeBase = r.tipo === "pauta"
      ? cands.filter((c) => elegivelPauta(c, r.eixosPauta, lado))
      : cands.filter((c) => elegivelLista(c, r.eixosPauta)).sort((a, b) => b.contra - a.contra || a.def - b.def);

    const listaSel = r.listaSel ?? gradeBase.slice(0, 6).map((c) => c.sq);
    r.listaSel = listaSel;

    const headerGrade = criar("div", "topo-barra");
    headerGrade.appendChild(criar("span", "bloco-titulo-eixos", tituloGrade));
    headerGrade.appendChild(criar("span", "bloco-titulo-eixos", `${listaSel.length}/9`));
    blocoGrade.appendChild(headerGrade);

    if (gradeBase.length === 0 && listaSel.length === 0) {
      const vazioGrid = criar(
        "div",
        "cartao-sem-ficha",
        `Ninguém em ${uf} votou assim em todos os motivos escolhidos. Tire um motivo ou busque em outro estado.`,
      );
      vazioGrid.style.padding = "24px 0";
      vazioGrid.style.textAlign = "center";
      blocoGrade.appendChild(vazioGrid);
    } else {
      const grid = criar("div", undefined);
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "repeat(4, 1fr)";
      grid.style.gap = "8px";

      const top12 = gradeBase.slice(0, 12);
      const adicionaisSq = listaSel.filter((sq) => !top12.some((c) => c.sq === sq));
      const adicionaisCands = adicionaisSq.map((sq) => candsBusca.find((c) => c.sq === sq)).filter(Boolean);
      const exibidosGrade = [...top12, ...adicionaisCands];

      for (const c of exibidosGrade) {
        const ativo = listaSel.includes(c.sq);
        const card = criar("button", undefined);
        card.style.padding = "0";
        card.style.border = ativo ? "2.5px solid var(--vermelho)" : "1.5px solid rgba(19,18,24,.15)";
        card.style.borderRadius = "8px";
        card.style.background = "#fff";
        card.style.cursor = "pointer";
        card.style.overflow = "hidden";
        card.style.textAlign = "left";
        card.style.opacity = ativo ? "1" : "0.55";

        const foto = criar("div", undefined);
        foto.style.width = "100%";
        foto.style.height = "76px";
        foto.style.backgroundColor = `hsl(${c.matiz} 30% 42%)`;
        if (c.fotoSrc) {
          foto.style.backgroundImage = `url("${c.fotoSrc}")`;
          foto.style.backgroundSize = "cover";
          foto.style.backgroundPosition = "center";
        }
        if (r.postura === "nao") foto.style.filter = "grayscale(1)";
        card.appendChild(foto);

        const nome = criar("div", undefined, c.nome);
        nome.style.padding = "4px 5px";
        nome.style.fontSize = "9.5px";
        nome.style.fontWeight = "800";
        nome.style.lineHeight = "1.15";
        nome.style.textTransform = "uppercase";
        nome.style.color = "var(--tinta)";
        nome.style.height = "30px";
        nome.style.overflow = "hidden";
        card.appendChild(nome);

        card.onclick = () => {
          if (ativo) {
            if (listaSel.length > 1) {
              r.listaSel = listaSel.filter((x) => x !== c.sq);
            }
          } else if (listaSel.length < 9) {
            r.listaSel = [...listaSel, c.sq];
          }
          renderizarComposer();
        };
        grid.appendChild(card);
      }
      blocoGrade.appendChild(grid);
    }

    const buscaGrade = montarBuscaCandidato(r, {
      pool: candsBusca,
      elegivel: (c) => (r.tipo === "pauta" ? elegivelPauta(c, r.eixosPauta, lado) : elegivelLista(c, r.eixosPauta)),
      aoEscolher: (c) => {
        if (r.listaSel.includes(c.sq)) return;
        if (r.listaSel.length >= 9) {
          toast("A grade aceita no máximo 9 nomes.");
          return;
        }
        r.listaSel = [...r.listaSel, c.sq];
        r.busca = "";
        r.buscaAberta = false;
        renderizarComposer();
      },
      placeholder: "Nome ou número — só quem votou assim",
      vazio: `Digite para buscar entre as candidaturas com histórico ${estado.todasUfs ? "do Brasil" : `de ${uf}`}.`,
    });
    blocoGrade.appendChild(buscaGrade);
    controlesEl.appendChild(blocoGrade);
  }

  const blocoModelo = criar("div", "bloco-eixos");
  blocoModelo.appendChild(criar("div", "bloco-titulo-eixos", "Modelo"));
  const grupoMod = criar("div", undefined);
  grupoMod.style.display = "flex";
  grupoMod.style.gap = "8px";

  const btnCabine = criar("button", undefined, "Cabine");
  btnCabine.style.flex = "1";
  btnCabine.style.height = "58px";
  btnCabine.style.borderRadius = "8px";
  btnCabine.style.border = r.modelo === "cabine" ? "2px solid var(--vermelho)" : "1.5px solid rgba(19,18,24,.15)";
  btnCabine.style.background = "var(--plisse)";
  btnCabine.style.color = "var(--papel)";
  btnCabine.style.fontSize = "12px";
  btnCabine.style.fontWeight = "800";
  btnCabine.style.cursor = "pointer";
  btnCabine.onclick = () => {
    r.modelo = "cabine";
    renderizarComposer();
  };

  const btnCedula = criar("button", undefined, "Cédula");
  btnCedula.style.flex = "1";
  btnCedula.style.height = "58px";
  btnCedula.style.borderRadius = "8px";
  btnCedula.style.border = r.modelo === "cedula" ? "2px solid var(--vermelho)" : "1.5px solid rgba(19,18,24,.15)";
  btnCedula.style.background = "var(--papel)";
  btnCedula.style.color = "var(--tinta)";
  btnCedula.style.fontSize = "12px";
  btnCedula.style.fontWeight = "800";
  btnCedula.style.cursor = "pointer";
  btnCedula.onclick = () => {
    r.modelo = "cedula";
    renderizarComposer();
  };

  grupoMod.appendChild(btnCabine);
  grupoMod.appendChild(btnCedula);
  blocoModelo.appendChild(grupoMod);
  controlesEl.appendChild(blocoModelo);

  clearTimeout(debounceComposerTimer);
  debounceComposerTimer = setTimeout(async () => {
    const postPayload = prepararDadosPost(r, candsBusca);
    const postObj = montarPost(postPayload, candsBusca);
    await desenharStory(document.getElementById("preview-composer"), postObj);
  }, 80);

  document.getElementById("btn-gerar-link-qr").onclick = () => {
    try {
      const postPayload = prepararDadosPost(r, candsBusca);
      const id = codificar(postPayload);
      location.hash = `#/pronto/${r.postura}/${id}`;
    } catch (err) {
      console.error(err);
      toast("Não foi possível gerar o link desta candidatura.");
    }
  };
}

function prepararDadosPost(r, cands) {
  const sel = cands.find((c) => c.sq === r.sq);
  const lado = r.postura === "nao" ? "contra" : "defende";

  if (r.tipo === "candidato") {
    const motivosDisp = EIXO_ORDEM.filter((id) => sel?.notas[id] === lado);
    const motivosNomes = r.motivos ?? motivosDisp.slice(0, 4);
    const motivosIdxs = motivosNomes.map((nome) => EIXO_ORDEM.indexOf(nome)).filter((idx) => idx !== -1);
    return {
      tipo: "candidato",
      postura: r.postura,
      modelo: r.modelo,
      sq: r.sq,
      motivos: motivosIdxs,
    };
  }

  if (r.tipo === "duelo") {
    const oponentes = cands.filter((c) => elegivelOponente(c, sel?.sq, r.postura));
    const oponenteSq = r.oponente ?? oponentes[0]?.sq;
    const nao = r.postura === "nao" ? r.sq : oponenteSq;
    const sim = r.postura === "nao" ? oponenteSq : r.sq;
    return {
      tipo: "duelo",
      postura: r.postura,
      modelo: r.modelo,
      nao,
      sim,
    };
  }

  if (r.tipo === "pauta") {
    const eixos = (r.eixosPauta ?? []).map((e) => EIXO_ORDEM.indexOf(e)).filter((i) => i !== -1);
    const faces = r.listaSel ?? [];
    return {
      tipo: "pauta",
      postura: r.postura,
      modelo: r.modelo,
      eixos,
      faces,
    };
  }

  if (r.tipo === "lista") {
    const eixos = (r.eixosPauta ?? []).map((e) => EIXO_ORDEM.indexOf(e)).filter((i) => i !== -1);
    return {
      tipo: "lista",
      postura: "nao",
      modelo: r.modelo,
      eixos,
      faces: r.listaSel ?? [],
    };
  }

  throw new Error(`Tipo desconhecido: ${r.tipo}`);
}

async function renderizarCompartilhar(postura, id) {
  const dec = decodificar(id);
  if (!dec) {
    location.replace("#/criar");
    return;
  }

  const sqsNecessarios = [];
  if (dec.sq) sqsNecessarios.push(dec.sq);
  if (dec.nao) sqsNecessarios.push(dec.nao);
  if (dec.sim) sqsNecessarios.push(dec.sim);
  if (dec.faces) sqsNecessarios.push(...dec.faces);

  await carregarUf("BR");
  for (const sq of sqsNecessarios) {
    const u = ufDoSq(sq);
    if (u) await carregarUf(u);
  }

  trocarTela("pronto");

  const cands = poolTodos();
  dec.postura = postura;
  dec.id = id;
  const post = montarPost(dec, cands);

  const linkTexto = textoLink(postura, id);
  const urlCompleta = montarUrl(postura, id);

  document.getElementById("pronto-link-texto").textContent = linkTexto;

  const qrCanvas = document.getElementById("qr-pronto-tile");
  const qrCtx = qrCanvas.getContext("2d");
  desenharQr(qrCtx, urlCompleta, 0, 0, 116);

  desenharStory(document.getElementById("preview-pronto"), post).catch(() => {});
  document.getElementById("btn-pronto-fechar").onclick = () => {
    location.hash = "#/catalogo";
  };

  document.getElementById("btn-pronto-editar").onclick = () => {
    let sqPrincipal = dec.sq;
    if (dec.tipo === "duelo") sqPrincipal = postura === "nao" ? dec.nao : dec.sim;
    else if (dec.tipo === "pauta" || dec.tipo === "lista") sqPrincipal = dec.faces?.[0];

    estado.rascunho = {
      sq: sqPrincipal,
      uf: ufDoSq(sqPrincipal) || estado.uf,
      postura,
      tipo: dec.tipo,
      modelo: dec.modelo,
      motivos: dec.motivos?.map((idx) => EIXO_ORDEM[idx]) ?? null,
      oponente: dec.tipo === "duelo" ? (postura === "nao" ? dec.sim : dec.nao) : null,
      eixosPauta: (dec.eixos ?? []).map((i) => EIXO_ORDEM[i]).filter(Boolean),
      listaSel: dec.faces ?? null,
      busca: "",
      buscaAberta: false,
    };
    location.hash = "#/novo";
  };

  const btnCopiar = document.getElementById("btn-copiar-link");
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

  function baixarBlob(blob, nome) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
  }

  async function agir(tarefa) {
    try {
      await tarefa();
    } catch (err) {
      console.error(err);
      toast("Falha ao gerar a imagem.");
    }
  }

  document.getElementById("btn-share-whats").onclick = () => {
    agir(async () => {
      const blob = await gerarCartao(post);
      const arquivo = new File([blob], `votosecreto-${postura}-${id}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], text: `${post.legenda}\n${urlCompleta}` });
        } catch (e) {
          if (e.name !== "AbortError") throw e;
        }
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(post.legenda + "\n" + urlCompleta)}`, "_blank", "noopener");
      }
    });
  };

  document.getElementById("btn-share-stories").onclick = () => {
    agir(async () => {
      const blob = await gerarStory(post);
      const arquivo = new File([blob], `votosecreto-story-${id}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo] });
        } catch (e) {
          if (e.name !== "AbortError") throw e;
        }
      } else {
        baixarBlob(blob, `votosecreto-story-${id}.jpg`);
      }
    });
  };

  document.getElementById("btn-share-baixar").onclick = () => {
    agir(async () => {
      const blob = await gerarCartao(post);
      baixarBlob(blob, `votosecreto-${postura}-${id}.jpg`);
    });
  };

  document.getElementById("btn-share-adesivos").onclick = () => {
    agir(async () => {
      const blob = await gerarAdesivos(post);
      baixarBlob(blob, `votosecreto-adesivos-${id}.png`);
    });
  };

  document.getElementById("btn-ver-como-link").onclick = () => {
    location.hash = `#/${postura}/${id}`;
  };
}

async function renderizarLinkReceiver(postura, id) {
  trocarTela("link");

  const invalidoBox = document.getElementById("link-invalido-view");
  const validoBox = document.getElementById("link-conteudo-valido");

  document.getElementById("btn-link-voltar").onclick = () => {
    if (history.length > 1) history.back();
    else location.hash = "#/catalogo";
  };

  document.getElementById("btn-link-ir-catalogo").onclick = () => {
    location.hash = "#/catalogo";
  };

  const dec = decodificar(id);
  if (!dec) {
    invalidoBox.style.display = "block";
    validoBox.style.display = "none";
    return;
  }

  const sqsNecessarios = [];
  if (dec.sq) sqsNecessarios.push(dec.sq);
  if (dec.nao) sqsNecessarios.push(dec.nao);
  if (dec.sim) sqsNecessarios.push(dec.sim);
  if (dec.faces) sqsNecessarios.push(...dec.faces);

  await carregarUf("BR");
  for (const sq of sqsNecessarios) {
    const u = ufDoSq(sq);
    if (u) await carregarUf(u);
  }

  const candPool = poolTodos();
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
  dec.id = id;
  const post = montarPost(dec, candPool);

  document.getElementById("link-url-pill").textContent = textoLink(postura, id);
  document.getElementById("link-legenda-texto").textContent = `“${post.legenda}”`;
  desenharCartao(document.getElementById("preview-link"), post).catch(() => {});

  const provasEl = document.getElementById("link-provas-lista");
  provasEl.replaceChildren();

  let sqPrincipal = dec.sq;
  if (dec.tipo === "duelo") sqPrincipal = postura === "nao" ? dec.nao : dec.sim;
  else if (dec.tipo === "pauta" || dec.tipo === "lista") sqPrincipal = dec.faces?.[0];

  const candPrincipal = candPool.find((c) => c.sq === sqPrincipal);
  const lado = postura === "nao" ? "contra" : "defende";

  if (!localStorage.getItem(CHAVE_UF) && post.uf && post.uf !== "BR") {
    estado.uf = post.uf;
  }

  const eixosApresentar = [];
  if (dec.tipo === "candidato") {
    for (const mIdx of dec.motivos ?? []) {
      const eId = typeof mIdx === "number" ? EIXO_ORDEM[mIdx] : mIdx;
      const eObj = estado.indice.eixos.find((x) => x.id === eId);
      if (eObj) {
        if (!candPrincipal || candPrincipal.notas[eId] === lado) {
          eixosApresentar.push(eObj);
        }
      }
    }
  } else if (dec.tipo === "pauta" || dec.tipo === "lista") {
    for (const i of dec.eixos ?? []) {
      const eId = typeof i === "number" ? EIXO_ORDEM[i] : i;
      const eObj = estado.indice.eixos.find((x) => x.id === eId);
      if (eObj) eixosApresentar.push(eObj);
    }
  }

  const corLado = postura === "nao" ? "var(--vermelho)" : "var(--verde)";
  for (const eixo of eixosApresentar) {
    const row = criar("div", "item-eixo-ficha");
    row.style.borderLeft = `5px solid ${corLado}`;
    const col = criar("div", undefined);
    col.style.flex = "1";
    col.style.minWidth = "0";

    const v = eixo.votacoes[0];
    const textoVoto = VERBO[eixo.id][lado];
    col.appendChild(criar("div", "item-eixo-texto", textoVoto));
    col.appendChild(criar("div", "item-eixo-sub", `${eixo.nome} · ${v?.sim ?? 0} Sim × ${v?.nao ?? 0} Não`));

    const isSenado = String(v?.id || "").startsWith("SF-");
    const linkOficial = criar("a", undefined, "votação nominal no Congresso ↗");
    linkOficial.href = isSenado
      ? `https://legis.senado.leg.br/dadosabertos/votacao?idProcesso=${v.idProcesso}`
      : `https://www.camara.leg.br/presenca-comissoes/votacao-portal?idVotacao=${v.id}`;
    linkOficial.target = "_blank";
    linkOficial.rel = "noopener noreferrer";
    linkOficial.style.fontSize = "11.5px";
    linkOficial.style.color = "var(--mudo)";
    linkOficial.style.textDecoration = "underline";
    col.appendChild(linkOficial);

    row.appendChild(col);
    provasEl.appendChild(row);
  }

  document.getElementById("btn-link-remix").onclick = () => {
    if (candPrincipal) {
      abrirComposer(candPrincipal, postura, dec.tipo);
    } else {
      location.hash = "#/catalogo";
    }
  };

  const botoesExtra = document.getElementById("link-botoes-extra");
  if (dec.tipo === "candidato" && candPrincipal) {
    botoesExtra.style.display = "flex";
    const btnDisc = document.getElementById("btn-link-discordar");
    const opostoPostura = postura === "nao" ? "voto" : "nao";
    btnDisc.textContent = `Discordo — declarar ${opostoPostura === "voto" ? "VOTO" : "NÃO VOTO"}`;
    btnDisc.style.color = opostoPostura === "voto" ? "var(--verde)" : "var(--vermelho)";
    btnDisc.onclick = () => {
      abrirComposer(candPrincipal, opostoPostura, "candidato");
    };

    document.getElementById("btn-link-ficha").onclick = () => {
      location.hash = `#/ficha/${candPrincipal.sq}`;
    };
  } else {
    botoesExtra.style.display = "none";
  }
}

async function renderizarRadar() {
  if (!estado.uf || estado.uf === "BR") estado.uf = "SP";
  await carregarUf("BR");
  await carregarUf(estado.uf);

  trocarTela("radar");

  document.getElementById("btn-radar-uf").textContent = `${estado.uf} ▾`;
  document.getElementById("btn-radar-uf").onclick = () => {
    location.hash = "#/onboarding";
  };

  const cands = pool(estado.uf);
  const comFicha = cands.filter((c) => c.temFicha);

  const arqBr = estado.arquivos.get("BR");
  const arqUf = estado.arquivos.get(estado.uf);
  const pelaBlindagem = aFavorDaBlindagem(arqBr) + aFavorDaBlindagem(arqUf);
  const nomeUf = arqUf?.nome ? titulo(arqUf.nome) : estado.uf;

  const blurbEl = document.getElementById("radar-blurb");
  blurbEl.innerHTML = `<b style="color:var(--vermelho);">${pelaBlindagem} de ${comFicha.length}</b> candidaturas de ${nomeUf} com histórico no Congresso votaram pela blindagem. Votações críticas sob a lupa do eleitor.`;

  const btnPart = document.getElementById("btn-radar-partido");
  const btnPauta = document.getElementById("btn-radar-pauta");
  const btnRank = document.getElementById("btn-radar-ranking");

  btnPart.classList.toggle("ativo", estado.vistaRadar === "partido");
  btnPauta.classList.toggle("ativo", estado.vistaRadar === "pauta");
  btnRank.classList.toggle("ativo", estado.vistaRadar === "ranking");

  btnPart.onclick = () => {
    estado.vistaRadar = "partido";
    estado.filtroPartido = null;
    estado.filtroPauta = null;
    btnPart.classList.add("ativo");
    btnPauta.classList.remove("ativo");
    btnRank.classList.remove("ativo");
    renderizarConteudoRadar();
  };

  btnPauta.onclick = () => {
    estado.vistaRadar = "pauta";
    estado.filtroPartido = null;
    estado.filtroPauta = null;
    btnPauta.classList.add("ativo");
    btnPart.classList.remove("ativo");
    btnRank.classList.remove("ativo");
    renderizarConteudoRadar();
  };

  btnRank.onclick = () => {
    estado.vistaRadar = "ranking";
    btnRank.classList.add("ativo");
    btnPart.classList.remove("ativo");
    btnPauta.classList.remove("ativo");
    renderizarConteudoRadar();
  };

  renderizarConteudoRadar();
}

function renderizarConteudoRadar() {
  const container = document.getElementById("radar-conteudo");
  container.replaceChildren();

  const cands = pool(estado.uf);
  const comFicha = cands.filter((c) => c.temFicha);

  if (estado.vistaRadar === "partido") {
    container.appendChild(criar("div", "linha-contagem", `Partidos com mais nomes no radar primeiro · ${estado.uf}`));
    const grupos = new Map();
    for (const c of comFicha) {
      let g = grupos.get(c.partido);
      if (!g) {
        g = { sigla: c.partido, total: 0, emRadar: 0 };
        grupos.set(c.partido, g);
      }
      g.total++;
      if (c.noRadar) g.emRadar++;
    }

    const listaPartidos = [...grupos.values()]
      .filter((g) => g.emRadar > 0)
      .sort((a, b) => b.emRadar - a.emRadar || b.total - a.total);

    for (const p of listaPartidos) {
      const btn = criar("button", "radar-item-partido");
      btn.appendChild(criar("span", undefined, p.sigla));
      btn.children[0].style.fontFamily = "var(--fonte-titulo)";
      btn.children[0].style.fontSize = "18px";
      btn.children[0].style.minWidth = "64px";

      const centro = criar("div", undefined);
      centro.style.flex = "1";
      centro.style.minWidth = "0";
      centro.style.display = "flex";
      centro.style.flexDirection = "column";
      centro.style.gap = "4px";

      const pct = Math.round((100 * p.emRadar) / p.total);
      centro.appendChild(
        criar("div", undefined, `${p.emRadar} no radar · ${p.total} com histórico`),
      );
      centro.children[0].style.fontSize = "12.5px";
      centro.children[0].style.fontWeight = "700";

      const barra = criar("div", "radar-barra");
      const preenc = criar("span", undefined);
      preenc.style.width = `${pct}%`;
      preenc.style.background = "var(--vermelho)";
      barra.appendChild(preenc);
      centro.appendChild(barra);

      btn.appendChild(centro);
      btn.appendChild(criar("span", undefined, "›"));
      btn.children[2].style.fontSize = "18px";
      btn.children[2].style.color = "var(--mudo)";

      btn.onclick = () => {
        estado.vistaRadar = "ranking";
        estado.filtroPartido = p.sigla;
        estado.filtroPauta = null;
        document.getElementById("btn-radar-partido").classList.remove("ativo");
        document.getElementById("btn-radar-ranking").classList.add("ativo");
        renderizarConteudoRadar();
      };
      container.appendChild(btn);
    }
  } else if (estado.vistaRadar === "pauta") {
    container.appendChild(criar("div", "linha-contagem", `Quem votou contra o eleitor em cada pauta · ${estado.uf}`));
    const listaPautas = [];
    for (const eixo of estado.indice.eixos) {
      const n = comFicha.filter((c) => c.notas[eixo.id] === "contra").length;
      if (n > 0) {
        listaPautas.push({ eixo, n });
      }
    }
    listaPautas.sort((a, b) => b.n - a.n);

    for (const item of listaPautas) {
      const v = item.eixo.votacoes[0];
      const btn = criar("button", "radar-item-partido");
      btn.style.borderLeft = "5px solid var(--vermelho)";

      const info = criar("div", undefined);
      info.style.flex = "1";
      info.style.minWidth = "0";

      const tit = criar("div", undefined, CURTO[item.eixo.id].contra.toUpperCase());
      tit.style.fontSize = "13.5px";
      tit.style.fontWeight = "800";
      tit.style.color = "var(--vermelho)";
      info.appendChild(tit);

      const sub = criar("div", undefined, `${item.eixo.nome} · ${v?.sim ?? 0} Sim × ${v?.nao ?? 0} Não`);
      sub.style.fontSize = "11.5px";
      sub.style.color = "var(--mudo)";
      sub.style.marginTop = "2px";
      info.appendChild(sub);

      btn.appendChild(info);

      const nEl = criar("span", undefined, String(item.n));
      nEl.style.fontFamily = "var(--fonte-titulo)";
      nEl.style.fontSize = "22px";
      nEl.style.color = "var(--tinta)";
      btn.appendChild(nEl);

      btn.onclick = () => {
        estado.vistaRadar = "ranking";
        estado.filtroPauta = item.eixo.id;
        estado.filtroPartido = null;
        document.getElementById("btn-radar-pauta").classList.remove("ativo");
        document.getElementById("btn-radar-ranking").classList.add("ativo");
        renderizarConteudoRadar();
      };
      container.appendChild(btn);
    }
  } else if (estado.vistaRadar === "ranking") {
    let ranking = comFicha.filter((c) => c.contra >= 1);
    ranking.sort((a, b) => b.contra - a.contra || a.def - b.def || a.numero - b.numero);

    if (estado.filtroPartido) {
      ranking = ranking.filter((c) => c.partido === estado.filtroPartido);
    } else if (estado.filtroPauta) {
      ranking = ranking.filter((c) => c.notas[estado.filtroPauta] === "contra");
    }

    const topoLinha = criar("div", "topo-barra");
    const countTxt = `${ranking.length} candidaturas${ranking.length > 40 ? " · mostrando 40" : ""}`;
    topoLinha.appendChild(criar("span", "linha-contagem", countTxt));

    if (estado.filtroPartido || estado.filtroPauta) {
      const rot = estado.filtroPartido ?? CURTO[estado.filtroPauta]?.contra ?? "";
      const chipFiltro = criar("button", "btn-pilula", `${rot} ✕`);
      chipFiltro.style.background = "var(--tinta)";
      chipFiltro.style.color = "#fff";
      chipFiltro.onclick = () => {
        estado.filtroPartido = null;
        estado.filtroPauta = null;
        renderizarConteudoRadar();
      };
      topoLinha.appendChild(chipFiltro);
    }
    container.appendChild(topoLinha);

    if (ranking.length > 0) {
      const btnPost = criar("button", "btn-cta-primario", "COMPARTILHAR ESTE RADAR COMO POST");
      btnPost.style.margin = "0";
      btnPost.style.height = "42px";
      btnPost.style.fontSize = "15px";
      btnPost.onclick = () => {
        abrirComposer(ranking[0], "nao", "lista", {
          listaSel: ranking.slice(0, 9).map((c) => c.sq),
          eixosPauta: estado.filtroPauta ? [estado.filtroPauta] : [],
        });
      };
      container.appendChild(btnPost);
    } else {
      const vazio = criar(
        "div",
        "cartao-sem-ficha",
        `Nenhuma candidatura de ${estado.uf} votou contra o eleitor nos eixos avaliados.`,
      );
      vazio.style.padding = "24px 0";
      vazio.style.textAlign = "center";
      container.appendChild(vazio);
      return;
    }

    const exibidos = ranking.slice(0, 40);
    exibidos.forEach((c, i) => {
      const art = criar("div", "cartao-candidato");
      art.style.flexDirection = "row";
      art.style.alignItems = "center";
      art.style.padding = "10px";

      const pos = criar("span", undefined, String(i + 1));
      pos.style.fontFamily = "var(--fonte-titulo)";
      pos.style.fontSize = "20px";
      pos.style.color = "var(--vermelho)";
      pos.style.width = "28px";
      pos.style.textAlign = "center";
      art.appendChild(pos);

      const foto = criar("div", "foto-quadro");
      foto.style.width = "44px";
      foto.style.height = "58px";
      foto.style.background = `hsl(${c.matiz} 30% 42%)`;
      if (c.fotoSrc) {
        const img = criar("div", "foto-imagem");
        img.style.backgroundImage = `url("${c.fotoSrc}")`;
        img.style.filter = "grayscale(1)";
        foto.appendChild(img);
      } else {
        foto.appendChild(criar("span", undefined, c.iniciais));
      }
      foto.onclick = () => {
        location.hash = `#/ficha/${c.sq}`;
      };
      art.appendChild(foto);

      const info = criar("div", undefined);
      info.style.flex = "1";
      info.style.minWidth = "0";
      info.style.display = "flex";
      info.style.flexDirection = "column";
      info.style.gap = "2px";
      info.onclick = () => {
        location.hash = `#/ficha/${c.sq}`;
      };

      const nome = criar("div", "cartao-nome", c.nome);
      nome.style.fontSize = "13.5px";
      nome.style.overflow = "hidden";
      nome.style.textOverflow = "ellipsis";
      nome.style.whiteSpace = "nowrap";
      info.appendChild(nome);

      info.appendChild(criar("div", "cartao-meta", `${c.partido} · ${c.numero}`));

      const eixosContra = EIXO_ORDEM.filter((id) => c.notas[id] === "contra");
      const rotulosTopicos = eixosContra.slice(0, 2).map((id) => CURTO[id].contra.toUpperCase()).join(", ");
      const extraTopicos = eixosContra.length > 2 ? ` +${eixosContra.length - 2}` : "";
      const topicosEl = criar("div", undefined, rotulosTopicos + extraTopicos);
      topicosEl.style.fontSize = "10px";
      topicosEl.style.fontWeight = "800";
      topicosEl.style.color = "var(--vermelho)";
      info.appendChild(topicosEl);

      const regua = criar("div", "regua-eixos");
      for (const eixoId of EIXO_ORDEM) {
        const seg = criar("span", "regua-seg");
        const est = c.notas[eixoId];
        seg.style.background =
          est === "contra" ? "var(--vermelho)" : est === "defende" ? "var(--verde)" : est === "misto" ? "var(--misto)" : "var(--sem)";
        regua.appendChild(seg);
      }
      info.appendChild(regua);
      art.appendChild(info);

      const btnNao = criar("button", "btn-nao-voto", "NÃO VOTO");
      btnNao.style.flex = "0 0 auto";
      btnNao.style.height = "36px";
      btnNao.style.padding = "0 10px";
      btnNao.style.fontSize = "13px";
      btnNao.onclick = (e) => {
        e.stopPropagation();
        abrirComposer(c, "nao");
      };
      art.appendChild(btnNao);

      container.appendChild(art);
    });
  }
}

async function renderizarScan() {
  trocarTela("scan");

  const video = document.getElementById("scan-video");
  const aviso = document.getElementById("scan-aviso-camera");
  const inputLink = document.getElementById("input-scan-link");
  const btnAbrir = document.getElementById("btn-scan-abrir-link");

  function processarTexto(texto) {
    const rota = extrairRota(texto);
    if (!rota) {
      toast("Esse QR não é do Voto Secreto.");
      return;
    }
    if (rota.sq) {
      const novoHash = `#/ficha/${rota.sq}`;
      if (location.hash === novoHash) navegar();
      else location.hash = novoHash;
      toast(`Lido: ${rota.sq}`);
    } else if (rota.postura && rota.id) {
      const novoHash = `#/${rota.postura}/${rota.id}`;
      if (location.hash === novoHash) navegar();
      else location.hash = novoHash;
      toast(`Lido: ${textoLink(rota.postura, rota.id)}`);
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
      if (document.querySelector('.tela[data-tela="scan"]').hasAttribute("hidden")) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      estado.scanStream = stream;
      video.srcObject = stream;
      await video.play();
      aviso.style.display = "none";

      estado.scanInterval = setInterval(async () => {
        try {
          const codes = await detector.detect(video);
          if (codes && codes.length > 0) {
            const raw = codes[0].rawValue;
            if (raw) {
              clearInterval(estado.scanInterval);
              estado.scanInterval = null;
              processarTexto(raw);
            }
          }
        } catch {}
      }, 250);
    } catch {
      aviso.style.display = "grid";
    }
  } else {
    aviso.style.display = "grid";
  }
}

async function navegar() {
  const hash = location.hash.replace(/^#/, "");
  const partes = hash.split("/").filter(Boolean);

  if (partes.length === 0) {
    location.replace("#/onboarding");
    renderizarOnboarding();
    return;
  }

  const rota = partes[0];

  if (rota === "onboarding") {
    renderizarOnboarding();
  } else if (rota === "catalogo") {
    await renderizarCatalogo();
  } else if (rota === "radar") {
    await renderizarRadar();
  } else if (rota === "criar") {
    await renderizarCriarHub();
  } else if (rota === "scan") {
    await renderizarScan();
  } else if (rota === "ficha" && partes[1]) {
    await renderizarFicha(partes[1]);
  } else if (rota === "novo") {
    await renderizarComposer();
  } else if (rota === "pronto" && partes[1] && partes[2]) {
    if (partes[1] !== "nao" && partes[1] !== "voto") {
      location.replace("#/criar");
      return;
    }
    await renderizarCompartilhar(partes[1], partes[2]);
  } else if ((rota === "nao" || rota === "voto") && partes[1]) {
    await renderizarLinkReceiver(rota, partes[1]);
  } else {
    location.replace("#/");
  }
}

function configurarInstalacao() {
  const botao = document.getElementById("btn-instalar");
  const ehIos = /iPhone|iPod/i.test(navigator.userAgent);
  const instalado = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const dispensado = () => localStorage.getItem(CHAVE_INSTALAR) !== null;

  function removerConvite() {
    const banner = document.querySelector(".convite-instalar");
    if (banner !== null) banner.remove();
  }

  function montarConvite(texto, acao) {
    if (document.querySelector(".convite-instalar") !== null) return;
    const banner = criar("div", "convite-instalar");
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Instalar o aplicativo");

    const corpo = criar("div", "convite-corpo");
    corpo.appendChild(criar("p", "convite-titulo", "Instale o Voto Secreto"));
    corpo.appendChild(criar("p", "convite-texto", texto));
    banner.appendChild(corpo);

    const acoes = criar("div", "convite-acoes");
    if (acao !== null) {
      const instalar = criar("button", "convite-botao", "Instalar");
      instalar.type = "button";
      instalar.addEventListener("click", acao);
      acoes.appendChild(instalar);
    }
    const depois = criar("button", "convite-dispensar", "Agora não");
    depois.type = "button";
    depois.addEventListener("click", () => {
      removerConvite();
      localStorage.setItem(CHAVE_INSTALAR, new Date().toISOString());
    });
    acoes.appendChild(depois);
    banner.appendChild(acoes);
    document.body.appendChild(banner);
  }

  let convite = null;
  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    convite = evento;
    if (botao) botao.removeAttribute("hidden");
    if (!instalado && !dispensado()) {
      montarConvite("Funciona offline e abre direto na cabine.", () => {
        convite.prompt();
        convite = null;
        if (botao) botao.setAttribute("hidden", "");
        removerConvite();
      });
    }
  });

  if (botao) {
    botao.onclick = () => {
      if (convite === null) return;
      convite.prompt();
      convite = null;
      botao.setAttribute("hidden", "");
      removerConvite();
    };
  }

  window.addEventListener("appinstalled", () => {
    convite = null;
    if (botao) botao.setAttribute("hidden", "");
    removerConvite();
  });

  if (ehIos && !instalado && !dispensado()) {
    montarConvite("Toque em Compartilhar e depois em “Adicionar à Tela de Início”. Funciona offline.", null);
  }
}

async function iniciar() {
  await carregarIndice();
  const ufSalva = localStorage.getItem(CHAVE_UF);
  if (ufSalva && ufSalva !== "BR" && estado.indice.ufs.some((u) => u.sigla === ufSalva)) {
    estado.uf = ufSalva;
  }
  estado.todasUfs = localStorage.getItem(CHAVE_TODAS) === "1";

  document.getElementById("aba-catalogo").onclick = () => {
    location.hash = "#/catalogo";
  };
  document.getElementById("aba-criar").onclick = () => {
    location.hash = "#/criar";
  };
  document.getElementById("aba-radar").onclick = () => {
    location.hash = "#/radar";
  };

  window.addEventListener("hashchange", navegar);
  navegar();

  configurarInstalacao();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

if (typeof window !== "undefined") {
  iniciar().catch((e) => console.error("Erro na inicialização:", e));
}
