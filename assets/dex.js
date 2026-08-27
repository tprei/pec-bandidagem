const CHAVE_UF = "dex.uf";
const CHAVE_LISTA = "dex.lista";
const LOTE = 24;

const VERBO = {
  blindagem: { defende: "Votou CONTRA a blindagem", contra: "Votou A FAVOR da blindagem" },
  jornada: { defende: "Votou pela redução da jornada", contra: "Votou CONTRA a redução da jornada" },
  anistia: { defende: "Votou CONTRA a anistia golpista", contra: "Votou pela ANISTIA aos golpistas" },
  trabalhista: { defende: "Votou CONTRA cortar direitos trabalhistas", contra: "Votou para CORTAR direitos trabalhistas" },
  eletrobras: { defende: "Votou CONTRA privatizar a Eletrobras", contra: "Votou para PRIVATIZAR a Eletrobras" },
  ricos: { defende: "Votou para TAXAR os super-ricos", contra: "Votou CONTRA taxar os super-ricos" },
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

const elemento = (id) => document.getElementById(id);
const grade = elemento("grade");
const contagem = elemento("contagem");
const busca = elemento("busca");
const botaoUf = elemento("uf-atual");
const botaoAbrirFiltros = elemento("abrir-filtros");
const crachaFiltros = elemento("filtros-n");
const botaoInstalar = elemento("instalar");
const navAbas = elemento("abas");
const contadorLista = elemento("minha-lista-n");
const dialogoUf = elemento("seletor-uf");
const dialogoFiltros = elemento("folha-filtros");

const secoes = {
  dex: document.querySelector('.pagina[data-pagina="dex"]'),
  votacoes: document.querySelector('.pagina[data-pagina="votacoes"]'),
  inimigos: document.querySelector('.pagina[data-pagina="inimigos"]'),
  lista: document.querySelector('.pagina[data-pagina="lista"]'),
  ficha: document.querySelector('.pagina[data-pagina="ficha"]'),
};

const estado = {
  indice: null,
  uf: null,
  estados: new Map(),
  visiveis: [],
  desenhados: 0,
  sentinela: null,
  cargos: new Set(),
  partidos: new Set(),
  badges: new Set(),
  soFicha: false,
  termo: "",
  salvos: new Map(),
  geracao: 0,
  votacoesRenderizadas: false,
};

function achatar(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function numeroBr(valor) {
  return valor.toLocaleString("pt-BR");
}

function dataBr(iso) {
  const [ano, mes, dia] = iso.split("-");
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

function falhar(mensagem) {
  grade.replaceChildren();
  const aviso = criar("p", undefined, mensagem);
  aviso.setAttribute("role", "alert");
  grade.append(aviso);
}

async function carregarJson(caminho) {
  const resposta = await fetch(caminho);
  if (!resposta.ok) throw new Error(`${caminho} respondeu ${resposta.status}`);
  return resposta.json();
}

function campos(par) {
  const c = par.arquivo.indices;
  const linha = par.linha;
  return {
    sq: linha[c.sq],
    numero: linha[c.numero],
    nome: linha[c.nome],
    nomeCompleto: linha[c.nomeCompleto],
    cargo: linha[c.cargo],
    partido: linha[c.partido],
    coligacao: linha[c.coligacao],
    badge: linha[c.badge],
    foto: linha[c.foto],
    ficha: linha[c.ficha],
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

function textoVerbo(eixo, nota) {
  if (nota.estado === "sem-registro") return "Sem registro nestas votações";
  if (nota.estado === "sem-lado") {
    const rotulos = [...new Set(nota.outros.map((codigo) => ROTULO_VOTO[codigo]))].join(" e ");
    return `Não tomou lado: registrou ${rotulos}`;
  }
  const verbos = VERBO[eixo.id];
  if (verbos === undefined) throw new Error(`eixo ${eixo.id} não tem texto em VERBO`);
  if (nota.estado === "misto") return "Votou nos dois lados";
  return verbos[nota.estado];
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

function fileiraPontos(notas) {
  const ul = criar("ul", "pontos");
  for (const item of notas) {
    const li = criar("li", "ponto", item.eixo.nome);
    li.dataset.estado = item.nota.estado;
    const desc = `${item.eixo.nome} — ${textoVerbo(item.eixo, item.nota)}`;
    li.title = desc;
    li.setAttribute("aria-label", desc);
    ul.append(li);
  }
  return ul;
}

function montarMonograma(nome, numeroPartido, largura = 96, altura = 128) {
  const palavras = nome.split(/\s+/).filter((p) => p.length > 2);
  let iniciais = "";
  if (palavras.length >= 2) {
    iniciais = (palavras[0][0] + palavras[1][0]).toUpperCase();
  } else if (palavras.length === 1) {
    iniciais = palavras[0].slice(0, 2).toUpperCase();
  } else {
    iniciais = nome.slice(0, 2).toUpperCase();
  }
  const matiz = (numeroPartido * 137) % 360;
  const monograma = criar("div", "monograma", iniciais);
  monograma.style.setProperty("--matiz", String(matiz));
  monograma.style.width = `${largura}px`;
  monograma.style.height = `${altura}px`;
  return monograma;
}

function montarRetrato(dado, tamanho = "padrao") {
  const figura = criar("figure", tamanho === "grande" ? "ficha-retrato" : tamanho === "pequeno" ? "inimigo-retrato" : "carta-retrato");
  const largura = tamanho === "grande" ? 144 : tamanho === "pequeno" ? 64 : 96;
  const altura = tamanho === "grande" ? 192 : tamanho === "pequeno" ? 85 : 128;

  if (dado.foto === "t") {
    const foto = document.createElement("img");
    foto.className = tamanho === "grande" ? "ficha-foto" : tamanho === "pequeno" ? "inimigo-foto" : "carta-foto";
    foto.src = `fotos-tse/${dado.sq}.jpg`;
    foto.alt = "";
    foto.loading = "lazy";
    foto.width = largura;
    foto.height = altura;
    figura.append(foto);
  } else if (dado.foto === "c" && dado.ficha !== null) {
    const foto = document.createElement("img");
    foto.className = tamanho === "grande" ? "ficha-foto" : tamanho === "pequeno" ? "inimigo-foto" : "carta-foto";
    foto.src = `fotos/${dado.ficha.camaraId}.jpg`;
    foto.alt = "";
    foto.loading = "lazy";
    foto.width = largura;
    foto.height = altura;
    figura.append(foto);
  } else {
    figura.append(montarMonograma(dado.nome, dado.numero, largura, altura));
  }

  const rotuloClasse = tamanho === "grande" ? "ficha-numero" : tamanho === "pequeno" ? "inimigo-numero" : "carta-numero";
  const figcap = criar("figcaption", rotuloClasse, String(dado.numero));
  figura.append(figcap);
  return figura;
}

function montarCarta(par) {
  const dado = campos(par);
  const carta = document.createElement("article");
  carta.className = "carta";
  carta.dataset.cargo = String(dado.cargo);
  carta.dataset.ficha = dado.ficha === null ? "nao" : "sim";
  carta.dataset.sq = String(dado.sq);
  if (dado.badge !== null) carta.dataset.tipo = dado.badge;

  carta.append(montarRetrato(dado));

  const corpo = criar("div", "carta-corpo");
  const titulo = criar("h3", "carta-nome");
  const abrir = criar("button", "carta-abrir", dado.nome);
  abrir.type = "button";
  abrir.setAttribute("aria-label", `Abrir ficha de ${dado.nome}, número ${dado.numero}`);
  titulo.append(abrir);
  corpo.append(titulo);

  const meta = criar("p", "carta-meta");
  meta.append(criar("span", "carta-partido", estado.indice.partidos[dado.partido].sigla));
  meta.append(criar("span", "carta-cargo", estado.indice.cargos[dado.cargo]));
  corpo.append(meta);

  if (dado.badge !== null) {
    const tipos = criar("ul", "carta-tipos");
    const tipo = criar("li", "tipo", estado.indice.badges[dado.badge]);
    tipo.dataset.tipo = dado.badge;
    tipos.append(tipo);
    corpo.append(tipos);
  }

  if (dado.ficha === null) {
    corpo.append(criar("p", "carta-sem-ficha", "Sem histórico na Câmara"));
  } else {
    const res = resumo(dado.ficha);
    corpo.append(fileiraPontos(res.notas));
    if (res.contra >= 3) {
      corpo.append(criar("p", "selo-inimigo", "INIMIGO DO POVO"));
    }
  }
  carta.append(corpo);

  const salvo = estado.salvos.has(dado.sq);
  const salvar = criar("button", "carta-salvar", salvo ? "Salvo" : "Salvar");
  salvar.type = "button";
  salvar.setAttribute("aria-pressed", salvo ? "true" : "false");
  salvar.setAttribute("aria-label", `${salvo ? "Remover" : "Salvar"} ${dado.nome} na minha lista`);
  carta.append(salvar);
  return carta;
}

function limparSentinela() {
  if (estado.sentinela === null) return;
  observador.unobserve(estado.sentinela);
  estado.sentinela.remove();
  estado.sentinela = null;
}

function desenharLote() {
  limparSentinela();
  const fim = Math.min(estado.desenhados + LOTE, estado.visiveis.length);
  const fragmento = document.createDocumentFragment();
  for (let i = estado.desenhados; i < fim; i += 1) fragmento.append(montarCarta(estado.visiveis[i]));
  grade.append(fragmento);
  estado.desenhados = fim;
  if (estado.desenhados < estado.visiveis.length) {
    estado.sentinela = criar("div", "sentinela");
    grade.append(estado.sentinela);
    observador.observe(estado.sentinela);
  }
}

const observador = new IntersectionObserver(
  (entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      if (entrada.target !== estado.sentinela) continue;
      desenharLote();
    }
  },
  { rootMargin: "600px" },
);

function paresConcatenados() {
  const arqBr = estado.estados.get("BR");
  const arqUf = estado.estados.get(estado.uf);
  const pares = [];
  if (arqBr !== undefined) {
    for (const linha of arqBr.candidatos) pares.push({ arquivo: arqBr, linha });
  }
  if (arqUf !== undefined && estado.uf !== "BR") {
    for (const linha of arqUf.candidatos) pares.push({ arquivo: arqUf, linha });
  }
  pares.sort((a, b) => {
    const da = campos(a);
    const db = campos(b);
    return da.cargo - db.cargo || da.numero - db.numero || (da.nome < db.nome ? -1 : 1);
  });
  return pares;
}

function filtrar() {
  const pares = paresConcatenados();
  const termo = achatar(estado.termo.trim());
  const porNumero = /^\d+$/.test(termo);
  estado.visiveis = pares.filter((par) => {
    const dado = campos(par);
    if (estado.soFicha && dado.ficha === null) return false;
    if (estado.cargos.size > 0 && !estado.cargos.has(String(dado.cargo))) return false;
    if (estado.partidos.size > 0 && !estado.partidos.has(String(dado.partido))) return false;
    if (estado.badges.size > 0 && !estado.badges.has(String(dado.badge))) return false;
    if (termo === "") return true;
    if (porNumero && String(dado.numero).startsWith(termo)) return true;
    return achatar(dado.nome).includes(termo) || achatar(dado.nomeCompleto).includes(termo);
  });
  limparSentinela();
  estado.desenhados = 0;
  if (estado.visiveis.length === 0) {
    grade.append(criar("p", "grade-vazia", "Nenhuma candidatura encontrada com os filtros atuais."));
  } else {
    desenharLote();
  }
  atualizarContagem();
  atualizarIndicadorFiltros();
}

function aFavorDaBlindagem(arquivo) {
  if (arquivo.aFavorBlindagem !== undefined) return arquivo.aFavorBlindagem;
  const eixo = estado.indice.eixos.find((atualEixo) => atualEixo.id === "blindagem");
  let total = 0;
  if (eixo !== undefined) {
    for (const linha of arquivo.candidatos) {
      const ficha = linha[arquivo.indices.ficha];
      if (ficha === null) continue;
      if (pontuar(ficha, eixo).estado === "contra") total += 1;
    }
  }
  arquivo.aFavorBlindagem = total;
  return total;
}

function atualizarContagem() {
  const totalBase = paresConcatenados().length;
  const visiveis = estado.visiveis.length;
  const comFicha = estado.visiveis.filter((par) => campos(par).ficha !== null).length;
  contagem.textContent =
    visiveis === totalBase
      ? `${plural(totalBase, "candidatura", "candidaturas")} · ${numeroBr(comFicha)} com histórico na Câmara`
      : `${numeroBr(visiveis)} de ${plural(totalBase, "candidatura", "candidaturas")}`;
}

function atualizarIndicadorFiltros() {
  const n = estado.cargos.size + estado.partidos.size + estado.badges.size + (estado.soFicha ? 1 : 0);
  crachaFiltros.textContent = String(n);
  crachaFiltros.hidden = n === 0;
}

function alternarChip(conjunto, chip) {
  const valor = chip.dataset.valor;
  if (conjunto.has(valor)) conjunto.delete(valor);
  else conjunto.add(valor);
  chip.setAttribute("aria-pressed", conjunto.has(valor) ? "true" : "false");
  filtrar();
}

function renderizarFolhaFiltros() {
  dialogoFiltros.replaceChildren();

  const cabeca = criar("div", "folha-cabeca");
  const alca = criar("div", "folha-alca");
  cabeca.append(alca);
  const titulo = criar("h2", "folha-titulo", "Filtros");
  cabeca.append(titulo);

  const acoes = criar("div", "folha-acoes-topo");
  const limpar = criar("button", "folha-limpar", "Limpar");
  limpar.type = "button";
  limpar.addEventListener("click", () => {
    estado.cargos.clear();
    estado.partidos.clear();
    estado.badges.clear();
    estado.soFicha = false;
    filtrar();
    renderizarFolhaFiltros();
  });
  acoes.append(limpar);

  const fechar = criar("button", "folha-fechar", "Pronto");
  fechar.type = "button";
  fechar.addEventListener("click", () => dialogoFiltros.close());
  acoes.append(fechar);
  cabeca.append(acoes);
  dialogoFiltros.append(cabeca);

  const corpo = criar("div", "folha-corpo");
  const pares = paresConcatenados();

  const contagemPartidos = new Map();
  for (const par of pares) {
    const p = campos(par).partido;
    contagemPartidos.set(p, (contagemPartidos.get(p) ?? 0) + 1);
  }
  const partidosOrdenados = [...contagemPartidos.entries()].sort((a, b) => b[1] - a[1] || estado.indice.partidos[a[0]].sigla.localeCompare(estado.indice.partidos[b[0]].sigla));

  const cargosPresentes = [...new Set(pares.map((par) => campos(par).cargo))].sort((a, b) => a - b);
  const badgesPresentes = [...new Set(pares.map((par) => campos(par).badge))].filter((b) => b !== null);

  const secCargo = criar("div", "folha-secao");
  secCargo.append(criar("h3", "folha-secao-titulo", "Cargo"));
  const grupoCargo = criar("div", "folha-grupo");
  for (const c of cargosPresentes) {
    const chip = criar("button", "chip", estado.indice.cargos[c]);
    chip.type = "button";
    chip.dataset.valor = String(c);
    chip.setAttribute("aria-pressed", estado.cargos.has(String(c)) ? "true" : "false");
    chip.addEventListener("click", () => alternarChip(estado.cargos, chip));
    grupoCargo.append(chip);
  }
  secCargo.append(grupoCargo);
  corpo.append(secCargo);

  const secPartido = criar("div", "folha-secao");
  secPartido.append(criar("h3", "folha-secao-titulo", "Partido"));
  const grupoPartido = criar("div", "folha-grupo");
  for (const [codPartido, n] of partidosOrdenados) {
    const sigla = estado.indice.partidos[codPartido].sigla;
    const chip = criar("button", "chip", `${sigla} (${n})`);
    chip.type = "button";
    chip.dataset.valor = String(codPartido);
    chip.setAttribute("aria-pressed", estado.partidos.has(String(codPartido)) ? "true" : "false");
    chip.addEventListener("click", () => alternarChip(estado.partidos, chip));
    grupoPartido.append(chip);
  }
  secPartido.append(grupoPartido);
  corpo.append(secPartido);

  const secPerfil = criar("div", "folha-secao");
  secPerfil.append(criar("h3", "folha-secao-titulo", "Perfil"));
  const grupoPerfil = criar("div", "folha-grupo");
  const badgesOrdenados = badgesPresentes
    .map((b) => [b, estado.indice.badges[b]])
    .sort(([, a], [, b]) => a.localeCompare(b, "pt-BR"));
  for (const [b, rotulo] of badgesOrdenados) {
    const chip = criar("button", "chip", rotulo);
    chip.type = "button";
    chip.dataset.valor = b;
    chip.dataset.tipo = b;
    chip.setAttribute("aria-pressed", estado.badges.has(b) ? "true" : "false");
    chip.addEventListener("click", () => alternarChip(estado.badges, chip));
    grupoPerfil.append(chip);
  }
  secPerfil.append(grupoPerfil);
  corpo.append(secPerfil);

  const secOpcoes = criar("div", "folha-secao");
  const btnSoFicha = criar("button", "chip-toggle", "Só quem já votou na Câmara");
  btnSoFicha.id = "so-ficha";
  btnSoFicha.type = "button";
  btnSoFicha.setAttribute("aria-pressed", estado.soFicha ? "true" : "false");
  btnSoFicha.addEventListener("click", () => {
    estado.soFicha = !estado.soFicha;
    btnSoFicha.setAttribute("aria-pressed", estado.soFicha ? "true" : "false");
    filtrar();
  });
  secOpcoes.append(btnSoFicha);
  corpo.append(secOpcoes);

  dialogoFiltros.append(corpo);
}

function linhaVotacao(votacao, codigo, eixo) {
  const linha = criar("div", "ficha-votacao");
  const placar = [`${votacao.sim} Sim`, `${votacao.nao} Não`];
  if (votacao.outros > 0) placar.push(`${votacao.outros} sem lado`);
  linha.append(criar("span", "ficha-votacao-placar", `${dataBr(votacao.data)} · ${placar.join(" x ")}`));
  const voto = criar("span", "voto", `${votacao.rotulo}: ${ROTULO_VOTO[codigo] ?? "sem registro"}`);
  voto.dataset.voto = String(codigo ?? 0);
  voto.dataset.alinhamento = alinhamento(codigo, eixo);
  linha.append(voto);
  const nominal = criar("a", undefined, "votação nominal ↗");
  nominal.href = `https://www.camara.leg.br/presenca-comissoes/votacao-portal?idVotacao=${votacao.id}`;
  nominal.target = "_blank";
  nominal.rel = "noopener";
  linha.append(nominal);
  const materia = criar("a", undefined, "proposição ↗");
  materia.href = `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${votacao.proposicao}`;
  materia.target = "_blank";
  materia.rel = "noopener";
  linha.append(materia);
  return linha;
}

function alinhamento(codigo, eixo) {
  if (codigo === undefined || codigo === 0) return "sem-registro";
  if (eixo === null) return "neutro";
  if (codigo === eixo.defendeOEleitor) return "defende";
  if (codigo === eixo.contraOEleitor) return "contra";
  return "neutro";
}

function renderizarFicha(sq) {
  const sec = secoes.ficha;
  sec.replaceChildren();
  const pares = paresConcatenados();
  const par = pares.find((p) => campos(p).sq === sq);

  if (par === undefined) {
    const aviso = criar(
      "p",
      "ficha-nao-encontrada",
      `Candidatura ${sq} não encontrada em ${estado.uf}. Troque o estado para encontrá-la.`,
    );
    aviso.setAttribute("role", "alert");
    sec.append(aviso);
    const voltar = criar("button", "ficha-fechar", "← Voltar ao catálogo");
    voltar.type = "button";
    voltar.addEventListener("click", voltarFicha);
    sec.append(voltar);
    return;
  }

  const dado = campos(par);
  const res = resumo(dado.ficha);

  const cabeca = criar("div", "ficha-cabeca");
  cabeca.append(montarRetrato(dado, "grande"));

  const info = criar("div", "ficha-info");
  const fechar = criar("button", "ficha-fechar", "← Voltar");
  fechar.type = "button";
  fechar.setAttribute("aria-label", "Voltar");
  fechar.addEventListener("click", voltarFicha);
  info.append(fechar);

  info.append(criar("h2", "ficha-nome", dado.nome));
  info.append(criar("p", "ficha-nome-completo", dado.nomeCompleto));

  const partido = estado.indice.partidos[dado.partido];
  const nomePartido = partido.nome === partido.sigla ? partido.sigla : `${partido.sigla} — ${partido.nome}`;
  info.append(criar("p", "ficha-partido-cargo", `${estado.indice.cargos[dado.cargo]} · ${nomePartido}`));

  const coligacao = par.arquivo.coligacoes[dado.coligacao];
  if (coligacao) {
    const bloco = criar("p", "ficha-coligacao");
    bloco.textContent =
      coligacao.tipo === "PARTIDO ISOLADO"
        ? `Concorre por partido isolado (${coligacao.composicao}). O voto de legenda fica só com esse partido.`
        : `${coligacao.tipo}: ${coligacao.nome}. Votar aqui também ajuda a eleger ${coligacao.composicao}.`;
    info.append(bloco);
  }
  cabeca.append(info);
  sec.append(cabeca);

  if (dado.ficha !== null) {
    const resumoBox = criar("div", "ficha-resumo-box");
    if (res.contra >= 3) {
      resumoBox.append(criar("p", "selo-inimigo", "INIMIGO DO POVO"));
    }
    resumoBox.append(fileiraPontos(res.notas));
    sec.append(resumoBox);

    const historico = criar("div", "ficha-secao");
    const ficha = dado.ficha;
    historico.append(criar("h3", "ficha-eixo-pergunta", `Histórico como ${ficha.nomeCamara}`));
    const fidelidade =
      ficha.bancadaAferivel === 0
        ? "Fidelidade partidária indefinida: nunca votou em bancada grande o bastante para medir."
        : `Votou com o próprio partido em ${Math.round((100 * ficha.comMaioria) / ficha.bancadaAferivel)}% das ${numeroBr(ficha.bancadaAferivel)} votações mensuráveis. É um fato, não uma virtude nem um defeito.`;
    historico.append(criar("p", "ficha-fidelidade", fidelidade));
    historico.append(
      criar(
        "p",
        undefined,
        `Participou de ${numeroBr(ficha.participacoes)} das ${numeroBr(estado.indice.votacoesNoHistorico)} votações nominais do período.`,
      ),
    );

    for (const item of res.notas) {
      const eixo = item.eixo;
      const nota = item.nota;
      const details = document.createElement("details");
      details.className = "ficha-eixo";
      details.dataset.estado = nota.estado;
      const summary = document.createElement("summary");
      summary.textContent = `${eixo.nome} — ${textoVerbo(eixo, nota)}`;
      details.append(summary);

      const corpoDetalhe = criar("div", "ficha-eixo-corpo");
      corpoDetalhe.append(criar("p", "ficha-eixo-pergunta-texto", eixo.pergunta));
      corpoDetalhe.append(criar("p", "ficha-eixo-posicao", eixo.posicao));
      for (const votacao of eixo.votacoes) {
        corpoDetalhe.append(linhaVotacao(votacao, ficha.votos[votacao.id], eixo));
      }
      details.append(corpoDetalhe);
      historico.append(details);
    }

    for (const item of estado.indice.contexto) {
      const details = document.createElement("details");
      details.className = "ficha-contexto";
      const summary = document.createElement("summary");
      summary.textContent = `Contexto, não pontua: ${item.rotulo}`;
      details.append(summary);

      const corpoDetalhe = criar("div", "ficha-eixo-corpo");
      corpoDetalhe.append(criar("p", "ficha-eixo-posicao", item.nota));
      corpoDetalhe.append(linhaVotacao(item, ficha.votos[item.id], null));
      details.append(corpoDetalhe);
      historico.append(details);
    }
    sec.append(historico);
  } else {
    const historico = criar("div", "ficha-secao");
    historico.append(
      criar(
        "p",
        "carta-sem-ficha",
        "Sem histórico na Câmara entre 2021 e 2026. Não é nota baixa: estreantes e quem só teve mandato estadual ou municipal aparecem assim.",
      ),
    );
    sec.append(historico);
  }

  const fonte = criar("div", "ficha-secao");
  fonte.append(
    criar(
      "p",
      "ficha-fonte",
      "Fontes: Dados Abertos do TSE e da Câmara dos Deputados. Os eixos são opinião editorial deste guia.",
    ),
  );
  sec.append(fonte);
}

function renderizarVotacoes() {
  if (estado.votacoesRenderizadas) return;
  const sec = secoes.votacoes;
  sec.replaceChildren();

  const cabeca = criar("div", "votacoes-cabeca");
  cabeca.append(criar("h2", "pagina-titulo", "As votações que este guia pontua"));
  cabeca.append(
    criar(
      "p",
      "pagina-intro",
      "Cada eixo aponta votações nominais reais, com link para o registro oficial de cada uma.",
    ),
  );
  sec.append(cabeca);

  const gradeEixos = criar("div", "votacoes-grade");
  for (const eixo of estado.indice.eixos) {
    const card = criar("article", "votacoes-card");
    card.append(criar("h3", "votacoes-card-titulo", eixo.nome));
    card.append(criar("p", "votacoes-card-pergunta", eixo.pergunta));
    card.append(criar("p", "votacoes-card-posicao", eixo.posicao));

    const listaVot = criar("div", "votacoes-card-lista");
    for (const v of eixo.votacoes) {
      const item = criar("div", "votacoes-item");
      item.append(criar("strong", "votacoes-item-rotulo", v.rotulo));
      const placar = [`${v.sim} Sim`, `${v.nao} Não`];
      if (v.outros > 0) placar.push(`${v.outros} sem lado`);
      item.append(criar("p", "votacoes-item-meta", `${dataBr(v.data)} · ${placar.join(" x ")}`));

      const links = criar("p", "votacoes-item-links");
      const nominal = criar("a", undefined, "votação nominal ↗");
      nominal.href = `https://www.camara.leg.br/presenca-comissoes/votacao-portal?idVotacao=${v.id}`;
      nominal.target = "_blank";
      nominal.rel = "noopener";
      links.append(nominal);

      links.append(document.createTextNode(" · "));

      const materia = criar("a", undefined, "proposição ↗");
      materia.href = `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${v.proposicao}`;
      materia.target = "_blank";
      materia.rel = "noopener";
      links.append(materia);
      item.append(links);
      listaVot.append(item);
    }
    card.append(listaVot);
    gradeEixos.append(card);
  }

  for (const item of estado.indice.contexto) {
    const card = criar("article", "votacoes-card votacoes-card-contexto");
    card.append(criar("h3", "votacoes-card-titulo", `Contexto: ${item.rotulo}`));
    card.append(criar("p", "votacoes-card-posicao", item.nota));
    const itemDiv = criar("div", "votacoes-item");
    const placar = [`${item.sim} Sim`, `${item.nao} Não`];
    if (item.outros > 0) placar.push(`${item.outros} sem lado`);
    itemDiv.append(criar("p", "votacoes-item-meta", `${dataBr(item.data)} · ${placar.join(" x ")}`));
    const links = criar("p", "votacoes-item-links");
    const nominal = criar("a", undefined, "votação nominal ↗");
    nominal.href = `https://www.camara.leg.br/presenca-comissoes/votacao-portal?idVotacao=${item.id}`;
    nominal.target = "_blank";
    nominal.rel = "noopener";
    links.append(nominal);
    links.append(document.createTextNode(" · "));
    const materia = criar("a", undefined, "proposição ↗");
    materia.href = `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${item.proposicao}`;
    materia.target = "_blank";
    materia.rel = "noopener";
    links.append(materia);
    itemDiv.append(links);
    card.append(itemDiv);
    gradeEixos.append(card);
  }

  sec.append(gradeEixos);
  estado.votacoesRenderizadas = true;
}

function renderizarInimigos() {
  const sec = secoes.inimigos;
  sec.replaceChildren();

  const cabeca = criar("div", "inimigos-cabeca");
  cabeca.append(criar("h2", "pagina-titulo", "Inimigos do Povo"));
  cabeca.append(
    criar(
      "p",
      "pagina-intro",
      "Quem votou contra o eleitor em pelo menos 3 dos 6 eixos, contando só as votações em que tomou lado.",
    ),
  );

  const arqBr = estado.estados.get("BR");
  const arqUf = estado.estados.get(estado.uf);
  const aFavor = (arqBr ? aFavorDaBlindagem(arqBr) : 0) + (arqUf && estado.uf !== "BR" ? aFavorDaBlindagem(arqUf) : 0);
  if (aFavor > 0) {
    const verbo = aFavor === 1 ? "votou" : "votaram";
    const nomeUf = arqUf ? arqUf.nome : estado.uf;
    cabeca.append(
      criar("p", "inimigos-manchete", `${plural(aFavor, "candidatura", "candidaturas")} de ${nomeUf} + Brasil ${verbo} a favor da blindagem`),
    );
  }
  sec.append(cabeca);

  const pares = paresConcatenados().filter((p) => campos(p).ficha !== null);
  const qualificados = [];
  const totalEixos = estado.indice.eixos.length;

  for (const par of pares) {
    const dado = campos(par);
    const res = resumo(dado.ficha);
    if (res.contra >= 1) {
      qualificados.push({ par, dado, res });
    }
  }

  qualificados.sort((a, b) => {
    if (b.res.contra !== a.res.contra) return b.res.contra - a.res.contra;
    if (a.res.defende !== b.res.defende) return a.res.defende - b.res.defende;
    return a.dado.nome.localeCompare(b.dado.nome, "pt-BR");
  });

  if (qualificados.length === 0) {
    sec.append(criar("p", "inimigos-vazio", "Nenhuma candidatura deste estado votou contra o eleitor nos eixos avaliados."));
    return;
  }

  const lista = criar("div", "inimigos-lista");
  for (const item of qualificados) {
    const linha = criar("article", "inimigo-item");
    linha.append(montarRetrato(item.dado, "pequeno"));

    const corpo = criar("div", "inimigo-corpo");
    const nomeBtn = criar("button", "inimigo-nome", item.dado.nome);
    nomeBtn.type = "button";
    nomeBtn.addEventListener("click", () => {
      location.hash = `#/ficha/${item.dado.sq}`;
    });
    corpo.append(nomeBtn);

    const siglaPartido = estado.indice.partidos[item.dado.partido].sigla;
    const meta = criar("p", "inimigo-meta", `${siglaPartido} · ${estado.indice.cargos[item.dado.cargo]}`);
    corpo.append(meta);

    const placar = criar("p", "inimigo-placar", `contra o eleitor em ${item.res.contra} de ${totalEixos} eixos`);
    corpo.append(placar);

    corpo.append(fileiraPontos(item.res.notas));

    if (item.res.contra >= 3) {
      corpo.append(criar("p", "selo-inimigo", "INIMIGO DO POVO"));
    }
    linha.append(corpo);
    lista.append(linha);
  }
  sec.append(lista);
}

function renderizarLista() {
  const sec = secoes.lista;
  sec.replaceChildren();

  const cabeca = criar("div", "lista-cabeca");
  cabeca.append(criar("h2", "pagina-titulo", "Minha lista"));
  sec.append(cabeca);

  if (estado.salvos.size === 0) {
    sec.append(criar("p", "lista-vazio", "Nada salvo ainda. Toque em Salvar num card para montar sua cola de votação."));
    return;
  }

  sec.append(criar("p", "lista-intro", "Funciona sem internet. Os números abaixo são o que você digita na urna."));

  const porCargo = new Map();
  for (const item of estado.salvos.values()) {
    if (!porCargo.has(item.cargo)) porCargo.set(item.cargo, []);
    porCargo.get(item.cargo).push(item);
  }

  for (const [cargo, itens] of [...porCargo].sort(([a], [b]) => a - b)) {
    const grupo = criar("div", "lista-grupo");
    grupo.append(criar("h3", "lista-grupo-titulo", estado.indice.cargos[cargo]));
    for (const item of itens.sort((a, b) => a.numero - b.numero)) {
      const linha = criar("div", "lista-item");
      linha.append(criar("span", "lista-item-numero", String(item.numero)));
      const texto = criar("span", "lista-item-texto");
      const nomeBtn = criar("button", "lista-item-nome-btn", item.nome);
      nomeBtn.type = "button";
      nomeBtn.addEventListener("click", () => {
        location.hash = `#/ficha/${item.sq}`;
      });
      texto.append(nomeBtn);
      texto.append(criar("span", "lista-item-sub", `${estado.indice.partidos[item.partido].sigla} · ${item.uf}`));
      linha.append(texto);
      const remover = criar("button", "lista-item-remover", "Remover");
      remover.type = "button";
      remover.dataset.sq = String(item.sq);
      remover.setAttribute("aria-label", `Remover ${item.nome} da minha lista`);
      remover.addEventListener("click", () => {
        estado.salvos.delete(item.sq);
        gravarSalvos();
        renderizarLista();
        for (const botao of grade.querySelectorAll(`.carta[data-sq="${item.sq}"] .carta-salvar`)) {
          marcarSalvar(botao, item.sq, item.nome);
        }
      });
      linha.append(remover);
      grupo.append(linha);
    }
    sec.append(grupo);
  }
}

function abrirSeletorUf() {
  dialogoUf.replaceChildren();
  const cabeca = criar("div", "seletor-uf-cabeca");
  cabeca.append(criar("h2", "seletor-uf-titulo", "Escolha o estado"));
  const fechar = criar("button", "seletor-uf-fechar", "✕");
  fechar.type = "button";
  fechar.setAttribute("aria-label", "Fechar seleção de estado");
  fechar.addEventListener("click", () => dialogoUf.close());
  cabeca.append(fechar);
  dialogoUf.append(cabeca);

  const secao = criar("div", "seletor-uf-secao");
  secao.append(
    criar(
      "p",
      "seletor-uf-ajuda",
      "Você só pode votar em candidaturas do seu próprio estado. As candidaturas à Presidência e Vice aparecem em todos os estados.",
    ),
  );
  const lista = criar("div", "uf-opcoes");
  const ufsFiltradas = estado.indice.ufs.filter((uf) => uf.sigla !== "BR");
  for (const uf of ufsFiltradas) {
    const opcao = criar("button", "uf-opcao");
    opcao.type = "button";
    opcao.dataset.uf = uf.sigla;
    opcao.setAttribute("aria-pressed", uf.sigla === estado.uf ? "true" : "false");
    opcao.append(criar("span", "uf-opcao-sigla", uf.sigla));
    opcao.append(criar("span", "uf-opcao-nome", uf.nome));
    opcao.append(criar("span", "uf-opcao-n", `${numeroBr(uf.candidatos)} · ${uf.comFicha} com histórico`));
    lista.append(opcao);
  }
  secao.append(lista);
  dialogoUf.append(secao);
  dialogoUf.showModal();
}

function lerSalvos() {
  const cru = localStorage.getItem(CHAVE_LISTA);
  if (cru === null) return new Map();
  const bruto = JSON.parse(cru);
  if (!Array.isArray(bruto)) throw new Error(`${CHAVE_LISTA} não é uma lista`);
  return new Map(bruto.map((item) => [item.sq, item]));
}

function gravarSalvos() {
  localStorage.setItem(CHAVE_LISTA, JSON.stringify([...estado.salvos.values()]));
  contadorLista.textContent = String(estado.salvos.size);
}

function marcarSalvar(botao, sq, nome) {
  const salvo = estado.salvos.has(sq);
  botao.setAttribute("aria-pressed", salvo ? "true" : "false");
  botao.textContent = salvo ? "Salvo" : "Salvar";
  botao.setAttribute("aria-label", `${salvo ? "Remover" : "Salvar"} ${nome} na minha lista`);
}

function voltarFicha() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    location.hash = "#/dex";
  }
}

async function trocarUf(sigla) {
  estado.geracao += 1;
  const geracao = estado.geracao;

  if (!estado.estados.has("BR")) {
    const arqBr = await carregarJson("data/dex/BR.json");
    arqBr.indices = Object.fromEntries(arqBr.colunas.map((nome, i) => [nome, i]));
    if (geracao !== estado.geracao) return;
    estado.estados.set("BR", arqBr);
  }

  if (!estado.estados.has(sigla)) {
    const arquivo = await carregarJson(`data/dex/${sigla}.json`);
    arquivo.indices = Object.fromEntries(arquivo.colunas.map((nome, i) => [nome, i]));
    if (geracao !== estado.geracao) return;
    estado.estados.set(sigla, arquivo);
  }

  if (geracao !== estado.geracao) return;
  estado.uf = sigla;
  localStorage.setItem(CHAVE_UF, sigla);
  botaoUf.textContent = sigla;
  filtrar();
  navegar();
}

function navegar() {
  const hash = location.hash || "#/dex";

  const matchFicha = /^#\/ficha\/(\d+)$/.exec(hash);
  if (matchFicha) {
    const sq = Number(matchFicha[1]);
    for (const [chave, sec] of Object.entries(secoes)) {
      sec.hidden = chave !== "ficha";
    }
    for (const btn of navAbas.querySelectorAll("button")) {
      btn.removeAttribute("aria-current");
    }
    busca.hidden = true;
    botaoAbrirFiltros.hidden = true;
    contagem.hidden = true;
    renderizarFicha(sq);
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }
  if (hash.startsWith("#/ficha/")) {
    location.replace("#/dex");
    return;
  }

  let rota = "dex";
  if (hash === "#/votacoes") rota = "votacoes";
  else if (hash === "#/inimigos") rota = "inimigos";
  else if (hash === "#/lista") rota = "lista";
  else if (hash !== "#/dex" && hash !== "") {
    location.replace("#/dex");
    return;
  }

  for (const [chave, sec] of Object.entries(secoes)) {
    sec.hidden = chave !== rota;
  }

  for (const btn of navAbas.querySelectorAll("button")) {
    if (btn.dataset.rota === `#/${rota}`) {
      btn.setAttribute("aria-current", "page");
    } else {
      btn.removeAttribute("aria-current");
    }
  }

  const noDex = rota === "dex";
  busca.hidden = !noDex;
  botaoAbrirFiltros.hidden = !noDex;
  contagem.hidden = !noDex;

  if (rota === "votacoes") renderizarVotacoes();
  else if (rota === "inimigos") renderizarInimigos();
  else if (rota === "lista") renderizarLista();

  window.scrollTo({ top: 0, behavior: "instant" });
}

function ligarEventos() {
  let atrasado = null;
  busca.addEventListener("input", () => {
    clearTimeout(atrasado);
    atrasado = setTimeout(() => {
      estado.termo = busca.value;
      filtrar();
    }, 140);
  });

  botaoAbrirFiltros.addEventListener("click", () => {
    renderizarFolhaFiltros();
    dialogoFiltros.showModal();
  });

  grade.addEventListener("click", (evento) => {
    const carta = evento.target.closest(".carta");
    if (carta === null) return;
    const sq = Number(carta.dataset.sq);
    const salvar = evento.target.closest(".carta-salvar");
    if (salvar === null) {
      location.hash = `#/ficha/${sq}`;
      return;
    }
    const pares = paresConcatenados();
    const par = pares.find((p) => campos(p).sq === sq);
    if (!par) return;
    const dado = campos(par);
    if (estado.salvos.has(sq)) estado.salvos.delete(sq);
    else {
      estado.salvos.set(sq, {
        sq,
        uf: par.arquivo.uf,
        numero: dado.numero,
        nome: dado.nome,
        cargo: dado.cargo,
        partido: dado.partido,
      });
    }
    gravarSalvos();
    marcarSalvar(salvar, sq, dado.nome);
  });

  navAbas.addEventListener("click", (evento) => {
    const btn = evento.target.closest("button[data-rota]");
    if (btn !== null) {
      location.hash = btn.dataset.rota;
    }
  });

  window.addEventListener("hashchange", navegar);

  botaoUf.addEventListener("click", abrirSeletorUf);
  dialogoUf.addEventListener("click", (evento) => {
    const opcao = evento.target.closest(".uf-opcao");
    if (opcao === null) return;
    dialogoUf.close();
    trocarUf(opcao.dataset.uf).catch((erro) => falhar(`Não foi possível carregar ${opcao.dataset.uf}: ${erro.message}`));
  });

  dialogoFiltros.addEventListener("click", (evento) => {
    if (evento.target === dialogoFiltros) dialogoFiltros.close();
  });
  dialogoUf.addEventListener("click", (evento) => {
    if (evento.target === dialogoUf) dialogoUf.close();
  });

  let convite = null;
  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    convite = evento;
    botaoInstalar.hidden = false;
  });
  botaoInstalar.addEventListener("click", () => {
    if (convite === null) return;
    convite.prompt();
    convite = null;
    botaoInstalar.hidden = true;
  });
}

async function iniciar() {
  try {
    estado.indice = await carregarJson("data/dex/indice.json");
    estado.salvos = lerSalvos();
  } catch (erro) {
    falhar(`Não foi possível iniciar o catálogo: ${erro.message}`);
    return;
  }
  contadorLista.textContent = String(estado.salvos.size);
  ligarEventos();

  const salva = localStorage.getItem(CHAVE_UF);
  const conhecida = salva !== "BR" && estado.indice.ufs.some((uf) => uf.sigla === salva);
  try {
    await trocarUf(conhecida ? salva : "SP");
  } catch (erro) {
    falhar(`Não foi possível carregar as candidaturas: ${erro.message}`);
    return;
  }
  if (!conhecida) abrirSeletorUf();

  navegar();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((erro) => {
      console.error(`registro do service worker falhou, o app segue funcionando online: ${erro.message}`);
    });
  }
}

iniciar();
