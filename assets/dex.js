const CHAVE_UF = "dex.uf";
const CHAVE_LISTA = "dex.lista";
const LOTE = 60;

const VERBO = {
  blindagem: { defende: "Votou CONTRA a blindagem", contra: "Votou A FAVOR da blindagem" },
  jornada: { defende: "Votou pela redução da jornada", contra: "Votou CONTRA a redução da jornada" },
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
const botaoSoFicha = elemento("so-ficha");
const botaoInstalar = elemento("instalar");
const botaoLista = elemento("abrir-lista");
const contadorLista = elemento("minha-lista-n");
const dialogoFicha = elemento("ficha");
const dialogoUf = elemento("seletor-uf");
const dialogoLista = elemento("lista");
const grupoCargo = document.querySelector('.filtro-grupo[data-grupo="cargo"]');
const grupoBadge = document.querySelector('.filtro-grupo[data-grupo="badge"]');

const estado = {
  indice: null,
  uf: null,
  estados: new Map(),
  visiveis: [],
  desenhados: 0,
  sentinela: null,
  cargos: new Set(),
  badges: new Set(),
  soFicha: false,
  termo: "",
  salvos: new Map(),
  geracao: 0,
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

function atual() {
  return estado.estados.get(estado.uf);
}

function campos(linha) {
  const c = atual().indices;
  return {
    sq: linha[c.sq],
    numero: linha[c.numero],
    nome: linha[c.nome],
    nomeCompleto: linha[c.nomeCompleto],
    cargo: linha[c.cargo],
    partido: linha[c.partido],
    coligacao: linha[c.coligacao],
    badge: linha[c.badge],
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

function montarBarra(eixo, nota) {
  const barra = criar("div", "barra");
  barra.dataset.eixo = eixo.id;
  barra.dataset.estado = nota.estado;
  barra.style.setProperty("--valor", nota.valor === null ? "0" : String(nota.valor));
  barra.append(criar("span", "barra-rotulo", textoVerbo(eixo, nota)));
  const trilha = criar("span", "barra-trilha");
  trilha.append(criar("span", "barra-preenche"));
  barra.append(trilha);
  const contados = nota.defende + nota.contra;
  const total = eixo.votacoes.length;
  const partes = [`${contados} de ${total} ${total === 1 ? "votação" : "votações"}`];
  if (nota.outros.length > 0) partes.push(`+${nota.outros.length} sem lado`);
  barra.append(criar("span", "barra-valor", partes.join(" · ")));
  return barra;
}

function montarCarta(linha) {
  const dado = campos(linha);
  const carta = document.createElement("article");
  carta.className = "carta";
  carta.dataset.cargo = String(dado.cargo);
  carta.dataset.ficha = dado.ficha === null ? "nao" : "sim";
  carta.dataset.sq = String(dado.sq);

  if (dado.ficha !== null && dado.ficha.temFoto) {
    const foto = document.createElement("img");
    foto.className = "carta-foto";
    foto.src = `fotos/${dado.ficha.camaraId}.jpg`;
    foto.alt = "";
    foto.loading = "lazy";
    foto.width = 56;
    foto.height = 56;
    carta.append(foto);
  }

  carta.append(criar("p", "carta-numero", String(dado.numero)));

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
    const barras = criar("div", "carta-barras");
    for (const eixo of estado.indice.eixos) barras.append(montarBarra(eixo, pontuar(dado.ficha, eixo)));
    corpo.append(barras);
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

function filtrar() {
  const arquivo = atual();
  const termo = achatar(estado.termo.trim());
  const porNumero = /^\d+$/.test(termo);
  estado.visiveis = arquivo.candidatos.filter((linha) => {
    const dado = campos(linha);
    if (estado.soFicha && dado.ficha === null) return false;
    if (estado.cargos.size > 0 && !estado.cargos.has(String(dado.cargo))) return false;
    if (estado.badges.size > 0 && !estado.badges.has(String(dado.badge))) return false;
    if (termo === "") return true;
    if (porNumero && String(dado.numero).startsWith(termo)) return true;
    return achatar(dado.nome).includes(termo) || achatar(dado.nomeCompleto).includes(termo);
  });
  limparSentinela();
  estado.desenhados = 0;
  grade.replaceChildren();
  desenharLote();
  atualizarContagem();
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
  const arquivo = atual();
  const comFicha = estado.visiveis.filter((linha) => campos(linha).ficha !== null).length;
  const partes = [
    `${plural(estado.visiveis.length, "candidatura", "candidaturas")} de ${numeroBr(arquivo.candidatos.length)} em ${arquivo.nome}`,
    `${numeroBr(comFicha)} com histórico na Câmara`,
  ];
  const aFavor = aFavorDaBlindagem(arquivo);
  if (aFavor > 0) {
    const verbo = aFavor === 1 ? "votou" : "votaram";
    partes.push(`${plural(aFavor, "candidatura", "candidaturas")} deste estado ${verbo} a favor da blindagem`);
  }
  contagem.textContent = partes.join(" · ");
}

function montarChips(grupo, itens, conjunto) {
  grupo.replaceChildren();
  for (const [valor, rotulo] of itens) {
    const chip = criar("button", undefined, rotulo);
    chip.type = "button";
    chip.dataset.valor = String(valor);
    chip.setAttribute("aria-pressed", conjunto.has(String(valor)) ? "true" : "false");
    grupo.append(chip);
  }
}

function montarFiltros() {
  const arquivo = atual();
  const cargos = [...new Set(arquivo.candidatos.map((linha) => campos(linha).cargo))].sort((a, b) => a - b);
  const badges = [...new Set(arquivo.candidatos.map((linha) => campos(linha).badge))].filter((b) => b !== null);
  estado.cargos = new Set([...estado.cargos].filter((c) => cargos.includes(Number(c))));
  estado.badges = new Set([...estado.badges].filter((b) => badges.includes(b)));
  montarChips(grupoCargo, cargos.map((c) => [c, estado.indice.cargos[c]]), estado.cargos);
  montarChips(
    grupoBadge,
    badges
      .map((b) => [b, estado.indice.badges[b]])
      .sort(([, a], [, b]) => a.localeCompare(b, "pt-BR")),
    estado.badges,
  );
}

function alternarChip(conjunto, chip) {
  const valor = chip.dataset.valor;
  if (conjunto.has(valor)) conjunto.delete(valor);
  else conjunto.add(valor);
  chip.setAttribute("aria-pressed", conjunto.has(valor) ? "true" : "false");
  filtrar();
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

function abrirFicha(sq) {
  const arquivo = atual();
  const linha = arquivo.candidatos.find((candidato) => campos(candidato).sq === sq);
  if (linha === undefined) throw new Error(`candidatura ${sq} não existe em ${estado.uf}`);
  const dado = campos(linha);
  dialogoFicha.replaceChildren();

  const cabeca = criar("div", "ficha-cabeca");
  cabeca.append(criar("p", "ficha-numero", String(dado.numero)));
  cabeca.append(criar("h2", "ficha-nome", dado.nome));
  const fechar = criar("button", "ficha-fechar", "✕");
  fechar.type = "button";
  fechar.setAttribute("aria-label", "Fechar ficha");
  fechar.addEventListener("click", () => dialogoFicha.close());
  cabeca.append(fechar);
  dialogoFicha.append(cabeca);

  const identidade = criar("div", "ficha-secao");
  identidade.append(criar("p", undefined, dado.nomeCompleto));
  const partido = estado.indice.partidos[dado.partido];
  const nomePartido = partido.nome === partido.sigla ? partido.sigla : `${partido.sigla} — ${partido.nome}`;
  identidade.append(criar("p", undefined, `${estado.indice.cargos[dado.cargo]} · ${nomePartido}`));
  const coligacao = arquivo.coligacoes[dado.coligacao];
  const bloco = criar("p", "ficha-coligacao");
  bloco.textContent =
    coligacao.tipo === "PARTIDO ISOLADO"
      ? `Concorre por partido isolado (${coligacao.composicao}). O voto de legenda fica só com esse partido.`
      : `${coligacao.tipo}: ${coligacao.nome}. Votar aqui também ajuda a eleger ${coligacao.composicao}.`;
  identidade.append(bloco);
  dialogoFicha.append(identidade);

  const historico = criar("div", "ficha-secao");
  if (dado.ficha === null) {
    historico.append(
      criar(
        "p",
        "carta-sem-ficha",
        "Sem histórico na Câmara dos Deputados entre 2021 e 2026. Isso não é nota baixa: é ausência de registro. Estreantes e quem só teve mandato estadual ou municipal aparecem assim.",
      ),
    );
  } else {
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

    for (const eixo of estado.indice.eixos) {
      const nota = pontuar(ficha, eixo);
      const caixa = criar("div", "ficha-eixo");
      caixa.append(criar("h4", "ficha-eixo-pergunta", `${eixo.nome} — ${textoVerbo(eixo, nota)}`));
      caixa.append(criar("p", "ficha-eixo-posicao", eixo.pergunta));
      caixa.append(criar("p", "ficha-eixo-posicao", eixo.posicao));
      for (const votacao of eixo.votacoes) caixa.append(linhaVotacao(votacao, ficha.votos[votacao.id], eixo));
      historico.append(caixa);
    }

    for (const item of estado.indice.contexto) {
      const caixa = criar("div", "ficha-contexto");
      caixa.append(criar("h4", "ficha-eixo-pergunta", `Contexto, não pontua: ${item.rotulo}`));
      caixa.append(criar("p", "ficha-eixo-posicao", item.nota));
      caixa.append(linhaVotacao(item, ficha.votos[item.id], null));
      historico.append(caixa);
    }
  }
  dialogoFicha.append(historico);

  const fonte = criar("div", "ficha-secao");
  fonte.append(
    criar(
      "p",
      "ficha-fonte",
      "Candidatura e número de urna: Dados Abertos do TSE. Votos nominais: Dados Abertos da Câmara dos Deputados. Os eixos são opinião editorial declarada deste guia sobre votações reais.",
    ),
  );
  dialogoFicha.append(fonte);
  dialogoFicha.showModal();
}

function abrirSeletorUf() {
  dialogoUf.replaceChildren();
  const cabeca = criar("div", "ficha-cabeca");
  cabeca.append(criar("h2", "ficha-nome", "Escolha o estado"));
  const fechar = criar("button", "ficha-fechar", "✕");
  fechar.type = "button";
  fechar.setAttribute("aria-label", "Fechar seleção de estado");
  fechar.addEventListener("click", () => dialogoUf.close());
  cabeca.append(fechar);
  dialogoUf.append(cabeca);

  const secao = criar("div", "ficha-secao");
  secao.append(
    criar(
      "p",
      "ficha-fonte",
      "Você só pode votar em candidaturas do seu próprio estado. A escolha fica salva neste aparelho. BRASIL reúne as candidaturas de alcance nacional, à Presidência e à Vice.",
    ),
  );
  const lista = criar("div", "uf-opcoes");
  for (const uf of estado.indice.ufs) {
    const opcao = criar("button", "uf-opcao");
    opcao.type = "button";
    opcao.dataset.uf = uf.sigla;
    opcao.setAttribute("aria-pressed", uf.sigla === estado.uf ? "true" : "false");
    opcao.append(criar("span", "uf-opcao-sigla", uf.sigla));
    opcao.append(criar("span", "uf-opcao-nome", uf.sigla === "BR" ? "BRASIL (Presidência)" : uf.nome));
    opcao.append(criar("span", "uf-opcao-n", `${numeroBr(uf.candidatos)} · ${uf.comFicha} com histórico`));
    lista.append(opcao);
  }
  secao.append(lista);
  dialogoUf.append(secao);
  dialogoUf.showModal();
}

function montarLista() {
  dialogoLista.replaceChildren();
  const cabeca = criar("div", "ficha-cabeca");
  cabeca.append(criar("h2", "ficha-nome", "Minha lista"));
  const fechar = criar("button", "ficha-fechar", "✕");
  fechar.type = "button";
  fechar.setAttribute("aria-label", "Fechar minha lista");
  fechar.addEventListener("click", () => dialogoLista.close());
  cabeca.append(fechar);
  dialogoLista.append(cabeca);

  const secao = criar("div", "ficha-secao");
  if (estado.salvos.size === 0) {
    secao.append(criar("p", "ficha-fonte", "Nada salvo ainda. Toque em Salvar num card para montar sua cola de votação."));
  } else {
    secao.append(criar("p", "ficha-fonte", "Funciona sem internet. Os números abaixo são o que você digita na urna."));
    const porCargo = new Map();
    for (const item of estado.salvos.values()) {
      if (!porCargo.has(item.cargo)) porCargo.set(item.cargo, []);
      porCargo.get(item.cargo).push(item);
    }
    for (const [cargo, itens] of [...porCargo].sort(([a], [b]) => a - b)) {
      secao.append(criar("h3", "ficha-eixo-pergunta", estado.indice.cargos[cargo]));
      for (const item of itens.sort((a, b) => a.numero - b.numero)) {
        const linha = criar("div", "lista-item");
        linha.append(criar("span", "lista-item-numero", String(item.numero)));
        const texto = criar("span", "lista-item-texto");
        texto.append(criar("strong", undefined, item.nome));
        texto.append(criar("span", undefined, `${estado.indice.partidos[item.partido].sigla} · ${item.uf}`));
        linha.append(texto);
        const remover = criar("button", "lista-item-remover", "Remover");
        remover.type = "button";
        remover.dataset.sq = String(item.sq);
        remover.setAttribute("aria-label", `Remover ${item.nome} da minha lista`);
        linha.append(remover);
        secao.append(linha);
      }
    }
  }
  dialogoLista.append(secao);
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

async function trocarUf(sigla) {
  estado.geracao += 1;
  const geracao = estado.geracao;
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
  montarFiltros();
  filtrar();
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

  grupoCargo.addEventListener("click", (evento) => {
    const chip = evento.target.closest("button");
    if (chip !== null) alternarChip(estado.cargos, chip);
  });
  grupoBadge.addEventListener("click", (evento) => {
    const chip = evento.target.closest("button");
    if (chip !== null) alternarChip(estado.badges, chip);
  });

  botaoSoFicha.addEventListener("click", () => {
    estado.soFicha = !estado.soFicha;
    botaoSoFicha.setAttribute("aria-pressed", estado.soFicha ? "true" : "false");
    filtrar();
  });

  grade.addEventListener("click", (evento) => {
    const carta = evento.target.closest(".carta");
    if (carta === null) return;
    const sq = Number(carta.dataset.sq);
    const salvar = evento.target.closest(".carta-salvar");
    if (salvar === null) {
      abrirFicha(sq);
      return;
    }
    const dado = campos(atual().candidatos.find((linha) => campos(linha).sq === sq));
    if (estado.salvos.has(sq)) estado.salvos.delete(sq);
    else {
      estado.salvos.set(sq, {
        sq,
        uf: estado.uf,
        numero: dado.numero,
        nome: dado.nome,
        cargo: dado.cargo,
        partido: dado.partido,
      });
    }
    gravarSalvos();
    marcarSalvar(salvar, sq, dado.nome);
  });

  botaoUf.addEventListener("click", abrirSeletorUf);
  dialogoUf.addEventListener("click", (evento) => {
    const opcao = evento.target.closest(".uf-opcao");
    if (opcao === null) return;
    dialogoUf.close();
    trocarUf(opcao.dataset.uf).catch((erro) => falhar(`Não foi possível carregar ${opcao.dataset.uf}: ${erro.message}`));
  });

  botaoLista.addEventListener("click", () => {
    montarLista();
    dialogoLista.showModal();
  });
  dialogoLista.addEventListener("click", (evento) => {
    const remover = evento.target.closest(".lista-item-remover");
    if (remover === null) return;
    const sq = Number(remover.dataset.sq);
    estado.salvos.delete(sq);
    gravarSalvos();
    montarLista();
    for (const botao of grade.querySelectorAll(`.carta[data-sq="${sq}"] .carta-salvar`)) {
      const nome = botao.closest(".carta").querySelector(".carta-abrir").textContent;
      marcarSalvar(botao, sq, nome);
    }
  });

  for (const dialogo of [dialogoFicha, dialogoUf, dialogoLista]) {
    dialogo.addEventListener("click", (evento) => {
      if (evento.target === dialogo) dialogo.close();
    });
  }

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
  const conhecida = estado.indice.ufs.some((uf) => uf.sigla === salva);
  try {
    await trocarUf(conhecida ? salva : "SP");
  } catch (erro) {
    falhar(`Não foi possível carregar as candidaturas: ${erro.message}`);
    return;
  }
  if (!conhecida) abrirSeletorUf();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((erro) => {
      console.error(`registro do service worker falhou, o app segue funcionando online: ${erro.message}`);
    });
  }
}

iniciar();
