const URL_DADOS = "data/votos-pec-blindagem.json";

const PREDICADO_TURNO = {
  qualquer: (d) => d.votouSim === true,
  ambos: (d) => d.turno1 === "Sim" && d.turno2 === "Sim",
  t1: (d) => d.turno1 === "Sim",
  t2: (d) => d.turno2 === "Sim",
};

const ROTULO_VOTO = { Sim: "Sim", Nao: "Não", Abstencao: "Abstenção", Ausente: "Ausente" };

const CLASSE_VOTO = { Sim: "sim", Nao: "nao", Abstencao: "abstencao", Ausente: "ausente" };

const ORDENS = new Set(["partido", "nome", "uf"]);

const FOTO_PADRAO =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 128"><rect width="96" height="128" fill="#e3ddcd"/><circle cx="48" cy="46" r="20" fill="#b4a98f"/><path d="M12 128c4-30 22-42 36-42s32 12 36 42z" fill="#b4a98f"/></svg>'
  );

const colacao = new Intl.Collator("pt-BR");

const estado = {
  pronta: false,
  deputados: [],
  busca: "",
  partido: "",
  uf: "",
  turno: "qualquer",
  ordem: "partido",
};

const el = {
  barra: document.getElementById("barra-filtros"),
  chips: document.getElementById("chips"),
  contador: document.getElementById("contador"),
  lista: document.getElementById("lista"),
  painelStatus: document.getElementById("painel-status"),
  carregando: document.getElementById("carregando"),
  busca: document.getElementById("busca"),
  partido: document.getElementById("partido"),
  uf: document.getElementById("uf"),
  turno: document.getElementById("turno"),
  ordem: document.getElementById("ordem"),
  limpar: document.getElementById("limpar"),
};

function normalizar(texto) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function criarElemento(tag, classe, texto) {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto !== undefined) no.textContent = texto;
  return no;
}

function validarRegistro(d) {
  if (typeof d.nome !== "string" || !d.nome) throw new Error(`deputado sem nome: ${JSON.stringify(d)}`);
  if (typeof d.partido !== "string" || !d.partido) throw new Error(`partido ausente em ${d.nome}`);
  if (typeof d.uf !== "string" || !d.uf) throw new Error(`UF ausente em ${d.nome}`);
  for (const campo of ["turno1", "turno2"]) {
    if (!Object.hasOwn(ROTULO_VOTO, d[campo])) {
      throw new Error(`valor inesperado em ${campo} para ${d.nome}: ${JSON.stringify(d[campo])}`);
    }
  }
  if (typeof d.votouSim !== "boolean") throw new Error(`votouSim não booleano para ${d.nome}`);
}

async function carregar() {
  let resposta;
  try {
    resposta = await fetch(URL_DADOS);
  } catch (erroRede) {
    throw new Error(`falha de rede ao buscar ${URL_DADOS}: ${erroRede.message}`);
  }
  if (!resposta.ok) throw new Error(`resposta HTTP ${resposta.status} ao buscar ${URL_DADOS}`);
  return resposta.json();
}

function universoPorTurno() {
  return estado.deputados.filter(PREDICADO_TURNO[estado.turno]);
}

function passaFiltros(deputado) {
  if (estado.partido && deputado.partido !== estado.partido) return false;
  if (estado.uf && deputado.uf !== estado.uf) return false;
  if (estado.busca && !normalizar(deputado.nome).includes(normalizar(estado.busca))) return false;
  return true;
}

function ordenar(lista) {
  const porNome = (a, b) => colacao.compare(a.nome, b.nome);
  const comparadores = {
    partido: (a, b) => colacao.compare(a.partido, b.partido) || porNome(a, b),
    nome: porNome,
    uf: (a, b) => colacao.compare(a.uf, b.uf) || porNome(a, b),
  };
  return lista.slice().sort(comparadores[estado.ordem]);
}

function definir(campo, valor) {
  if (estado[campo] === valor) return;
  estado[campo] = valor;
  render();
}

function lerUrl() {
  const params = new URLSearchParams(location.search);
  const turnoDaUrl = params.get("turno");
  if (turnoDaUrl && Object.hasOwn(PREDICADO_TURNO, turnoDaUrl)) estado.turno = turnoDaUrl;
  if (ORDENS.has(params.get("ordem"))) estado.ordem = params.get("ordem");
  if (params.has("busca")) estado.busca = params.get("busca");
  if (params.has("partido")) estado.partido = params.get("partido");
  if (params.has("uf")) estado.uf = params.get("uf").toUpperCase();
}

function refletirUrl() {
  const params = new URLSearchParams();
  if (estado.busca) params.set("busca", estado.busca);
  if (estado.partido) params.set("partido", estado.partido);
  if (estado.uf) params.set("uf", estado.uf);
  if (estado.turno !== "qualquer") params.set("turno", estado.turno);
  if (estado.ordem !== "partido") params.set("ordem", estado.ordem);
  const consulta = params.toString();
  history.replaceState(null, "", consulta ? `?${consulta}` : location.pathname);
}

function contagemPorPartido(pool) {
  const contagem = new Map();
  for (const deputado of pool) {
    contagem.set(deputado.partido, (contagem.get(deputado.partido) ?? 0) + 1);
  }
  return contagem;
}

function pintarSelectPartidos(contagem) {
  const fragmento = document.createDocumentFragment();
  fragmento.append(new Option("Todos os partidos", ""));
  for (const partido of [...contagem.keys()].sort(colacao.compare)) {
    fragmento.append(new Option(`${partido} (${contagem.get(partido)})`, partido));
  }
  el.partido.replaceChildren(fragmento);
}

function pintarChips(contagem) {
  const fragmento = document.createDocumentFragment();
  for (const partido of [...contagem.keys()].sort(colacao.compare)) {
    const chip = criarElemento("button", "chip", `${partido} ${contagem.get(partido)}`);
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(partido === estado.partido));
    chip.addEventListener("click", () => definir("partido", partido === estado.partido ? "" : partido));
    fragmento.append(chip);
  }
  el.chips.replaceChildren(fragmento);
}

function sincronizarControles() {
  el.busca.value = estado.busca;
  el.turno.value = estado.turno;
  el.ordem.value = estado.ordem;
  el.uf.value = [...el.uf.options].some((opcao) => opcao.value === estado.uf) ? estado.uf : "";
  el.partido.value = [...el.partido.options].some((opcao) => opcao.value === estado.partido)
    ? estado.partido
    : "";
}

function badge(rotuloTurno, voto) {
  const span = criarElemento("span", `badge badge--${CLASSE_VOTO[voto]}`);
  span.title = `${rotuloTurno} turno: ${ROTULO_VOTO[voto]}`;
  span.append(
    criarElemento("span", "badge__turno", rotuloTurno),
    criarElemento("span", "badge__voto", ROTULO_VOTO[voto])
  );
  return span;
}

function pintarLinhas(visiveis) {
  const fragmento = document.createDocumentFragment();
  for (const deputado of visiveis) {
    const item = criarElemento("li", "deputado");

    const foto = document.createElement("img");
    foto.className = "foto";
    foto.width = 54;
    foto.height = 72;
    foto.loading = "lazy";
    foto.alt = deputado.nome;
    foto.src = deputado.urlFoto || FOTO_PADRAO;
    foto.addEventListener(
      "error",
      () => {
        foto.src = FOTO_PADRAO;
      },
      { once: true }
    );

    const info = criarElemento("div", "info");
    const linkNome = criarElemento("a", "nome", deputado.nome);
    linkNome.href = deputado.urlPerfil;
    linkNome.target = "_blank";
    linkNome.rel = "noopener";

    const detalhe = criarElemento("div", "detalhe");
    detalhe.append(
      criarElemento("span", "partido", deputado.partido),
      document.createTextNode(" · "),
      criarElemento("span", "uf", deputado.uf)
    );
    info.append(linkNome, detalhe);

    const votos = criarElemento("div", "votos");
    votos.append(badge("1º", deputado.turno1), badge("2º", deputado.turno2));

    item.append(foto, info, votos);
    fragmento.append(item);
  }
  if (!visiveis.length) {
    fragmento.append(criarElemento("li", "vazia", "Nenhum deputado encontrado com esses filtros."));
  }
  el.lista.replaceChildren(fragmento);
}

function render() {
  if (!estado.pronta) return;

  const poolTurno = universoPorTurno();
  if (estado.partido && !poolTurno.some((d) => d.partido === estado.partido)) estado.partido = "";
  if (estado.uf && !poolTurno.some((d) => d.uf === estado.uf)) estado.uf = "";

  const contagem = contagemPorPartido(poolTurno);
  const visiveis = ordenar(poolTurno.filter(passaFiltros));

  el.barra.hidden = false;
  el.chips.hidden = false;
  el.carregando.remove();

  pintarSelectPartidos(contagem);
  pintarChips(contagem);
  sincronizarControles();

  el.contador.replaceChildren(
    document.createTextNode("Mostrando "),
    criarElemento("strong", "", String(visiveis.length)),
    document.createTextNode(` de ${poolTurno.length} deputados`)
  );

  pintarLinhas(visiveis);
  refletirUrl();
}

function mostrarErro(erro) {
  el.carregando.remove();

  const artigo = criarElemento("article", "erro");
  artigo.append(criarElemento("h2", "", "Não foi possível carregar os dados"));
  artigo.append(criarElemento("p", "", `Falha ao ler ${URL_DADOS} (${erro.message}).`));

  const instrucao = criarElemento("p");
  instrucao.append(
    document.createTextNode("Este site lê o JSON por fetch e precisa ser servido por HTTP: rode "),
    criarElemento("code", "", "python3 -m http.server 8000"),
    document.createTextNode(" na raiz do projeto e abra "),
    criarElemento("code", "", "http://localhost:8000"),
    document.createTextNode(".")
  );
  artigo.append(instrucao);

  el.painelStatus.replaceChildren(artigo);
}

function preencherSelectUfs() {
  const ufsOrdenadas = [...new Set(estado.deputados.map((d) => d.uf))].sort(colacao.compare);
  const fragmento = document.createDocumentFragment();
  fragmento.append(new Option("Todos os estados", ""));
  for (const uf of ufsOrdenadas) fragmento.append(new Option(uf, uf));
  el.uf.replaceChildren(fragmento);
}

async function iniciar() {
  lerUrl();
  try {
    const dados = await carregar();
    if (!Array.isArray(dados.deputados)) throw new Error(`${URL_DADOS} não contém a lista "deputados"`);
    dados.deputados.forEach(validarRegistro);
    estado.deputados = dados.deputados;
    estado.pronta = true;
    preencherSelectUfs();
  } catch (erro) {
    mostrarErro(erro);
    return;
  }
  render();
}

el.busca.addEventListener("input", () => definir("busca", el.busca.value.trim()));
el.partido.addEventListener("change", () => definir("partido", el.partido.value));
el.uf.addEventListener("change", () => definir("uf", el.uf.value));
el.turno.addEventListener("change", () => definir("turno", el.turno.value));
el.ordem.addEventListener("change", () => definir("ordem", el.ordem.value));
el.limpar.addEventListener("click", () => {
  Object.assign(estado, { busca: "", partido: "", uf: "", turno: "qualquer", ordem: "partido" });
  render();
});

iniciar();
