const LARGURA = 1080;
const ALTURA = 1920;
const MARGEM = 60;
const CAPACIDADE = { cartaz: 9, motivos: 6 };
const FONTE_NOME = '"Trebuchet MS", "Lucida Grande", system-ui, sans-serif';
const FONTE_LCD = '"DSEG7Classic", ui-monospace, monospace';
const ACENTO = {
  cartaz: { apoio: "#37a06b", repudio: "#d64550" },
  motivos: { apoio: "#1e7a4c", repudio: "#c22333" },
};
const TITULO_PADRAO = { apoio: "VOTE NESTES", repudio: "NÃO VOTE NESTES" };

function criar(tag, classe, texto) {
  const no = document.createElement(tag);
  if (classe !== undefined) no.className = classe;
  if (texto !== undefined) no.textContent = texto;
  return no;
}

function tituloCargo(nome) {
  return nome
    .toLowerCase()
    .split(/\s+/)
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(" ");
}

function ajustar(ctx, texto, maxLargura) {
  if (ctx.measureText(texto).width <= maxLargura) return texto;
  let cortado = texto;
  while (cortado.length > 1 && ctx.measureText(`${cortado}…`).width > maxLargura) {
    cortado = cortado.slice(0, -1).trimEnd();
  }
  return `${cortado}…`;
}

function envolver(ctx, texto, maxLargura, maxLinhas) {
  const linhas = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    if (atual === "") {
      atual = palavra;
    } else if (ctx.measureText(`${atual} ${palavra}`).width <= maxLargura) {
      atual = `${atual} ${palavra}`;
    } else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (linhas.length < maxLinhas && atual !== "") linhas.push(atual);
  if (linhas.length > maxLinhas) {
    linhas.length = maxLinhas;
    let ultima = linhas[maxLinhas - 1];
    while (ultima !== "" && ctx.measureText(`${ultima}…`).width > maxLargura) {
      ultima = ultima.slice(0, -1).trimEnd();
    }
    linhas[maxLinhas - 1] = `${ultima}…`;
  }
  return linhas;
}

function desenharCapa(ctx, img, x, y, w, h) {
  const alvo = w / h;
  const origem = img.naturalWidth / img.naturalHeight;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  let sx = 0;
  let sy = 0;
  if (origem > alvo) {
    sw = img.naturalHeight * alvo;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / alvo;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function desenharRetrato(ctx, item, img, x, y, w, h) {
  if (img != null) {
    desenharCapa(ctx, img, x, y, w, h);
    return;
  }
  ctx.fillStyle = `hsl(${item.matiz}, 42%, 38%)`;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#f4f1e8";
  ctx.font = `800 ${Math.round(Math.min(w * 0.38, h * 0.28))}px ${FONTE_NOME}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(item.iniciais, x + w / 2, y + h / 2);
}

function desenharX(ctx, x, y, w, h, espessura, cor) {
  ctx.strokeStyle = cor;
  ctx.lineWidth = espessura;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();
}

function retanguloArredondado(ctx, x, y, w, h, raio) {
  const r = Math.min(raio, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function desenharPill(ctx, rotulo, x, y, largura, cor) {
  ctx.fillStyle = cor;
  retanguloArredondado(ctx, x, y, largura, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(rotulo, x + (largura - ctx.measureText(rotulo).width) / 2, y + 35);
}

const promessasImagem = new Map();
const imagensResolvidas = new Map();

function carregarImagem(src) {
  let promessa = promessasImagem.get(src);
  if (promessa === undefined) {
    promessa = new Promise((resolver) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = () => resolver(null);
      img.src = src;
    });
    promessa.then((img) => imagensResolvidas.set(src, img));
    promessasImagem.set(src, promessa);
  }
  return promessa;
}

async function preloaderPagina(itensPagina) {
  const imagens = new Map();
  await Promise.all(
    itensPagina.map(async (item) => {
      if (item.fotoSrc === null) return;
      const img = await carregarImagem(item.fotoSrc);
      imagens.set(item.sq, img);
    }),
  );
  return imagens;
}

function imagensJaProntas(itensPagina) {
  for (const item of itensPagina) {
    if (item.fotoSrc === null) continue;
    if (!imagensResolvidas.has(item.fotoSrc)) return false;
  }
  return true;
}

let fontesCarregadas = false;
const fontes = Promise.allSettled([
  document.fonts.load('64px "DSEG7Classic"'),
  document.fonts.load(`900 104px ${FONTE_NOME}`),
]).then(() => {
  fontesCarregadas = true;
});

function desenharCabecalho(ctx, cfg) {
  const cartaz = cfg.modelo === "cartaz";
  const tamanhoTitular = cartaz ? 104 : 92;
  const acento = ACENTO[cfg.modelo][cfg.postura];
  const marcador = cfg.totalPaginas > 1 ? `  ${cfg.indicePagina + 1}/${cfg.totalPaginas}` : "";

  ctx.font = `900 ${tamanhoTitular}px ${FONTE_NOME}`;
  const larguraTitular = ctx.measureText(cfg.titulo).width;
  let escala = 1;
  if (marcador !== "") {
    ctx.font = `700 40px ${FONTE_NOME}`;
    const larguraMarcador = ctx.measureText(marcador).width;
    const total = larguraTitular + 16 + larguraMarcador;
    if (total > LARGURA - 2 * MARGEM) escala = (LARGURA - 2 * MARGEM) / total;
  } else if (larguraTitular > LARGURA - 2 * MARGEM) {
    escala = (LARGURA - 2 * MARGEM) / larguraTitular;
  }

  const tamanhoFinal = Math.max(24, Math.floor(tamanhoTitular * escala));
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `900 ${tamanhoFinal}px ${FONTE_NOME}`;
  ctx.fillStyle = cartaz ? "#f4f1e8" : "#1b1f23";
  ctx.fillText(cfg.titulo, MARGEM, 60);
  if (marcador !== "") {
    const xMarcador = MARGEM + ctx.measureText(cfg.titulo).width + 16 * Math.max(escala, 0.5);
    ctx.font = `700 ${Math.max(20, Math.floor(40 * escala))}px ${FONTE_NOME}`;
    ctx.fillStyle = acento;
    ctx.fillText(marcador, xMarcador, 60 + tamanhoFinal * 0.55);
  }

  ctx.font = `600 ${cartaz ? 38 : 36}px ${FONTE_NOME}`;
  ctx.fillStyle = cartaz ? "#b9b2a2" : "#454f59";
  const subtitulo = `${tituloCargo(cfg.cargoNome)} · ${cfg.uf === "BR" ? "Brasil" : cfg.uf} · eleições 2026`;
  ctx.fillText(subtitulo, MARGEM, 60 + tamanhoFinal + 20);

  if (cartaz) {
    ctx.fillStyle = acento;
    ctx.fillRect(MARGEM, 280, LARGURA - 2 * MARGEM, 12);
  } else {
    ctx.fillStyle = "#dc0a2d";
    ctx.fillRect(MARGEM, 248, LARGURA - 2 * MARGEM, 10);
  }
}

function desenharCartaz(ctx, itensPagina, imagens, cfg) {
  const acento = ACENTO.cartaz[cfg.postura];
  const vao = 26;
  const larguraCartao = (LARGURA - 2 * MARGEM - 2 * vao) / 3;
  const alturaCartao = (1780 - 340 - 2 * vao) / 3;

  for (let i = 0; i < itensPagina.length; i++) {
    const item = itensPagina[i];
    const cx = MARGEM + (i % 3) * (larguraCartao + vao);
    const cy = 340 + Math.floor(i / 3) * (alturaCartao + vao);
    const px = cx + (larguraCartao - 240) / 2;
    const centroX = cx + larguraCartao / 2;

    desenharRetrato(ctx, item, imagens.get(item.sq), px, cy, 240, 320);
    ctx.strokeStyle = acento;
    ctx.lineWidth = 6;
    ctx.strokeRect(px - 3, cy - 3, 246, 326);
    if (cfg.postura === "repudio") desenharX(ctx, px, cy, 240, 320, 20, "#d64550");

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    ctx.font = `64px ${FONTE_LCD}`;
    ctx.fillStyle = acento;
    ctx.fillText(String(item.numero), centroX, cy + 382);

    ctx.font = `800 30px ${FONTE_NOME}`;
    ctx.fillStyle = "#f4f1e8";
    ctx.fillText(ajustar(ctx, item.nome, larguraCartao), centroX, cy + 424);

    ctx.font = `400 26px ${FONTE_NOME}`;
    ctx.fillStyle = "#b9b2a2";
    const meta = item.sigla === "" ? item.uf : `${item.sigla} · ${item.uf}`;
    ctx.fillText(meta, centroX, cy + 458);
  }
}

function desenharMotivos(ctx, itensPagina, imagens, cfg) {
  const repudio = cfg.postura === "repudio";
  const vao = 24;
  const larguraCartao = (LARGURA - 2 * MARGEM - vao) / 2;

  const rotulos = new Set();
  for (const item of itensPagina) {
    for (const rotulo of repudio ? item.motivos : item.defesas) rotulos.add(rotulo);
  }
  const temSecao = rotulos.size > 0;
  const alturaCartao = temSecao ? 340 : (1800 - 320 - 2 * vao) / 3;

  for (let i = 0; i < itensPagina.length; i++) {
    const item = itensPagina[i];
    const cx = MARGEM + (i % 2) * (larguraCartao + vao);
    const cy = 320 + Math.floor(i / 2) * (alturaCartao + vao);
    const py = cy + (alturaCartao - 288) / 2;
    const colX = cx + 240;
    const larguraCol = larguraCartao - 240;

    desenharRetrato(ctx, item, imagens.get(item.sq), cx, py, 216, 288);
    if (repudio) {
      ctx.strokeStyle = "#c22333";
      ctx.lineWidth = 8;
      ctx.strokeRect(cx - 4, py - 4, 224, 296);
      desenharX(ctx, cx, py, 216, 288, 18, "#c22333");
    } else {
      ctx.strokeStyle = "#1e7a4c";
      ctx.lineWidth = 6;
      ctx.strokeRect(cx - 3, py - 3, 222, 294);
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const meta = item.sigla === "" ? item.uf : `${item.sigla} · ${item.uf}`;
    ctx.font = `800 32px ${FONTE_NOME}`;
    const linhasNome = envolver(ctx, item.nome, larguraCol, 2);
    let y = cy + (alturaCartao - (152 + linhasNome.length * 38)) / 2;

    ctx.font = `76px ${FONTE_LCD}`;
    ctx.fillStyle = repudio ? "#c22333" : "#1e7a4c";
    ctx.fillText(String(item.numero), colX, y + 76);
    y += 84;
    ctx.font = `400 22px ${FONTE_NOME}`;
    ctx.fillStyle = "#5d6771";
    ctx.fillText("número na urna", colX, y + 22);
    y += 34;
    ctx.font = `800 32px ${FONTE_NOME}`;
    ctx.fillStyle = "#1b1f23";
    for (const linha of linhasNome) {
      ctx.fillText(linha, colX, y + 32);
      y += 38;
    }
    y += 6;
    ctx.font = `600 28px ${FONTE_NOME}`;
    ctx.fillStyle = "#454f59";
    ctx.fillText(meta, colX, y + 28);
  }

  if (temSecao) {
    desenharSecaoMotivos(ctx, [...rotulos], cfg, 320 + 3 * alturaCartao + 2 * vao);
  }
}

function desenharSecaoMotivos(ctx, rotulos, cfg, fimDaGrade) {
  const repudio = cfg.postura === "repudio";
  ctx.font = `800 40px ${FONTE_NOME}`;
  ctx.fillStyle = "#1b1f23";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(repudio ? "Eles votaram contra você em:" : "Eles defenderam você em:", MARGEM, fimDaGrade + 76);

  const maxLargura = LARGURA - 2 * MARGEM;
  const almofada = 20;
  ctx.font = `700 28px ${FONTE_NOME}`;
  let x = MARGEM;
  let y = fimDaGrade + 112;
  for (const rotulo of rotulos) {
    const texto = ajustar(ctx, rotulo, maxLargura - 2 * almofada);
    const largura = Math.min(ctx.measureText(texto).width + 2 * almofada, maxLargura);
    if (x + largura > MARGEM + maxLargura && x > MARGEM) {
      x = MARGEM;
      y += 66;
    }
    desenharPill(ctx, texto, x, y, largura, repudio ? "#c22333" : "#1e7a4c");
    x += largura + 14;
  }
}
function desenharRodape(ctx, modelo) {
  ctx.font = `400 26px ${FONTE_NOME}`;
  ctx.fillStyle = modelo === "cartaz" ? "#8d8776" : "#5d6771";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Dex 2026 · dados públicos TSE + Câmara dos Deputados", LARGURA / 2, 1870);
}

function desenharPagina(ctx, itensPagina, imagens, cfg) {
  ctx.fillStyle = cfg.modelo === "cartaz" ? "#16191c" : "#f4f1e8";
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  desenharCabecalho(ctx, cfg);
  if (cfg.modelo === "cartaz") desenharCartaz(ctx, itensPagina, imagens, cfg);
  else desenharMotivos(ctx, itensPagina, imagens, cfg);
  desenharRodape(ctx, cfg.modelo);
}

function textoCompartilhavel(postura, cargoNome) {
  const cargo = tituloCargo(cargoNome);
  return postura === "apoio"
    ? `Meus candidatos a ${cargo} em 2026 — o número na urna está em cada card. Dados públicos TSE/Câmara.`
    : `Estes candidatos a ${cargo} votaram contra o eleitor na Câmara. Não vote neles. Fonte: registro nominal em dadosabertos.camara.leg.br`;
}

export function abrirFolhaStory({ itens, posturaInicial = "apoio", avisos = [] }) {
  if (!Array.isArray(itens) || itens.length === 0) return;
  const dialogo = document.getElementById("folha-story");
  if (dialogo === null) return;
  dialogo.replaceChildren();

  let postura = posturaInicial === "repudio" ? "repudio" : "apoio";
  let modelo = "cartaz";
  let tituloEditado = false;
  let geracao = 0;
  let ocupado = false;

  const contagemCargos = new Map();
  for (const item of itens) contagemCargos.set(item.nomeCargo, (contagemCargos.get(item.nomeCargo) ?? 0) + 1);
  const cargos = [...contagemCargos.entries()];
  let cargoSelecionado = cargos.slice().sort((a, b) => b[1] - a[1])[0][0];
  let pagina = 0;

  const itensDoCargo = () => itens.filter((item) => item.nomeCargo === cargoSelecionado);
  const paginas = () => {
    const capacidade = CAPACIDADE[modelo];
    const lista = itensDoCargo();
    const saida = [];
    for (let i = 0; i < lista.length; i += capacidade) saida.push(lista.slice(i, i + capacidade));
    return saida;
  };

  const tela = document.createElement("canvas");
  tela.width = LARGURA;
  tela.height = ALTURA;
  const ctx = tela.getContext("2d");

  const telaExportacao = document.createElement("canvas");
  telaExportacao.width = LARGURA;
  telaExportacao.height = ALTURA;
  const ctxExportacao = telaExportacao.getContext("2d");

  const cabeca = criar("div", "story-cabeca");
  cabeca.append(criar("h2", "story-titulo", "Compartilhar story"));
  const fechar = criar("button", "story-fechar", "✕");
  fechar.type = "button";
  fechar.setAttribute("aria-label", "Fechar");
  fechar.addEventListener("click", () => dialogo.close());
  cabeca.append(fechar);
  dialogo.append(cabeca);

  const controles = criar("div", "story-controles");
  const grupoPostura = criar("div", "story-grupo");
  grupoPostura.setAttribute("role", "group");
  grupoPostura.setAttribute("aria-label", "Postura");
  const botoesPostura = new Map();
  for (const valor of ["apoio", "repudio"]) {
    const botao = criar("button", "story-postura", valor === "apoio" ? "Apoio" : "Repúdio");
    botao.type = "button";
    botao.dataset.postura = valor;
    botao.addEventListener("click", () => {
      if (postura === valor) return;
      postura = valor;
      if (!tituloEditado) entradaTitulo.value = TITULO_PADRAO[postura];
      sincronizarControles();
      compor();
    });
    botoesPostura.set(valor, botao);
    grupoPostura.append(botao);
  }
  controles.append(grupoPostura);

  const grupoModelo = criar("div", "story-grupo");
  grupoModelo.setAttribute("role", "group");
  grupoModelo.setAttribute("aria-label", "Modelo");
  const botoesModelo = new Map();
  for (const valor of ["cartaz", "motivos"]) {
    const botao = criar("button", "story-modelo", valor === "cartaz" ? "Cartaz" : "Motivos");
    botao.type = "button";
    botao.dataset.modelo = valor;
    botao.addEventListener("click", () => {
      modelo = valor;
      pagina = 0;
      sincronizarControles();
      compor();
    });
    botoesModelo.set(valor, botao);
    grupoModelo.append(botao);
  }
  controles.append(grupoModelo);
  dialogo.append(controles);

  if (cargos.length > 1) {
    const grupoCargo = criar("div", "story-grupo story-cargos");
    grupoCargo.setAttribute("role", "group");
    grupoCargo.setAttribute("aria-label", "Cargo");
    for (const [nome, n] of cargos) {
      const chip = criar("button", "story-cargo", `${tituloCargo(nome)} · ${n}`);
      chip.type = "button";
      chip.dataset.cargo = nome;
      chip.addEventListener("click", () => {
        if (cargoSelecionado === nome) return;
        cargoSelecionado = nome;
        pagina = 0;
        sincronizarControles();
        compor();
      });
      grupoCargo.append(chip);
    }
    dialogo.append(grupoCargo);
  }

  const entradaTitulo = criar("input", "story-titulo-input");
  entradaTitulo.type = "text";
  entradaTitulo.maxLength = 28;
  entradaTitulo.value = TITULO_PADRAO[postura];
  entradaTitulo.setAttribute("aria-label", "Título do story");
  entradaTitulo.addEventListener("input", () => {
    tituloEditado = true;
    compor();
  });
  dialogo.append(entradaTitulo);

  const antevisao = criar("div", "story-antevisao");
  dialogo.append(antevisao);

  const paginacao = criar("div", "story-paginacao");
  const anterior = criar("button", undefined, "‹");
  anterior.type = "button";
  anterior.setAttribute("aria-label", "Página anterior");
  const rotuloPagina = criar("span", undefined, "1 / 1");
  const proxima = criar("button", undefined, "›");
  proxima.type = "button";
  proxima.setAttribute("aria-label", "Próxima página");
  anterior.addEventListener("click", () => {
    if (pagina === 0) return;
    pagina -= 1;
    compor();
  });
  proxima.addEventListener("click", () => {
    if (pagina >= paginas().length - 1) return;
    pagina += 1;
    compor();
  });
  paginacao.append(anterior, rotuloPagina, proxima);
  dialogo.append(paginacao);

  if (avisos.length > 0) {
    dialogo.append(
      criar("p", "story-aviso", `Sem rede para buscar ${avisos.join(", ")}: esses cards saem sem foto e sem motivos.`),
    );
  }

  const nota = criar("p", "story-nota");
  nota.hidden = true;
  const mostrarNota = (texto) => {
    nota.textContent = texto;
    nota.hidden = false;
  };

  const acoes = criar("div", "story-acoes");
  const compartilhar = criar("button", "story-botao story-botao-primario", "Compartilhar");
  compartilhar.type = "button";
  const baixarBotao = criar("button", "story-botao", "Baixar imagens");
  baixarBotao.type = "button";
  acoes.append(compartilhar, baixarBotao);
  dialogo.append(acoes);
  dialogo.append(nota);

  function sincronizarControles() {
    for (const [valor, botao] of botoesPostura) {
      botao.setAttribute("aria-pressed", postura === valor ? "true" : "false");
    }
    for (const [valor, botao] of botoesModelo) {
      botao.setAttribute("aria-pressed", modelo === valor ? "true" : "false");
    }
    for (const chip of dialogo.querySelectorAll(".story-cargo")) {
      chip.setAttribute("aria-pressed", chip.dataset.cargo === cargoSelecionado ? "true" : "false");
    }
  }

  function compor() {
    const g = ++geracao;
    const pgs = paginas();
    if (pagina >= pgs.length) pagina = 0;
    const itensPagina = pgs[pagina] ?? [];
    const uf = itensDoCargo()[0]?.uf ?? "BR";
    const cfg = {
      postura,
      modelo,
      titulo: entradaTitulo.value,
      cargoNome: cargoSelecionado,
      uf,
      indicePagina: pagina,
      totalPaginas: pgs.length,
    };

    const desenharTudo = (imagens) => {
      desenharPagina(ctx, itensPagina, imagens, cfg);
      antevisao.replaceChildren(tela);
      rotuloPagina.textContent = `${pagina + 1} / ${pgs.length}`;
      paginacao.hidden = pgs.length === 1;
      anterior.disabled = pagina === 0;
      proxima.disabled = pagina >= pgs.length - 1;
    };

    if (fontesCarregadas && imagensJaProntas(itensPagina)) {
      const imagens = new Map();
      for (const item of itensPagina) {
        if (item.fotoSrc !== null) imagens.set(item.sq, imagensResolvidas.get(item.fotoSrc));
      }
      desenharTudo(imagens);
      return;
    }

    antevisao.replaceChildren(criar("p", "story-compondo", "Compondo…"));
    (async () => {
      await fontes;
      const imagens = await preloaderPagina(itensPagina);
      if (g !== geracao) return;
      desenharTudo(imagens);
    })();
  }

  async function gerarArquivos() {
    await fontes;
    const pgs = paginas();
    const uf = itensDoCargo()[0]?.uf ?? "BR";
    const arquivos = [];
    for (let i = 0; i < pgs.length; i++) {
      const imagens = await preloaderPagina(pgs[i]);
      desenharPagina(
        ctxExportacao,
        pgs[i],
        imagens,
        {
          postura,
          modelo,
          titulo: entradaTitulo.value,
          cargoNome: cargoSelecionado,
          uf,
          indicePagina: i,
          totalPaginas: pgs.length,
        },
      );
      const blob = await new Promise((resolver) => telaExportacao.toBlob(resolver, "image/jpeg", 0.92));
      if (blob === null) throw new Error("toBlob devolveu null");
      arquivos.push(new File([blob], `dex2026-story-${i + 1}-de-${pgs.length}.jpg`, { type: "image/jpeg" }));
    }
    return arquivos;
  }

  function baixar(arquivos) {
    for (const arquivo of arquivos) {
      const url = URL.createObjectURL(arquivo);
      const elo = document.createElement("a");
      elo.href = url;
      elo.download = arquivo.name;
      document.body.append(elo);
      elo.click();
      elo.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  }

  async function agir(tarefa) {
    if (ocupado) return;
    ocupado = true;
    compartilhar.disabled = true;
    baixarBotao.disabled = true;
    try {
      await tarefa();
    } finally {
      ocupado = false;
      compartilhar.disabled = false;
      baixarBotao.disabled = false;
    }
  }

  compartilhar.addEventListener("click", () =>
    agir(async () => {
      try {
        const arquivos = await gerarArquivos();
        if (navigator.canShare?.({ files: arquivos })) {
          try {
            await navigator.share({ files: arquivos, title: entradaTitulo.value, text: textoCompartilhavel(postura, cargoSelecionado) });
          } catch (erro) {
            if (erro.name !== "AbortError") throw erro;
          }
        } else {
          mostrarNota(`Compartilhamento não suportado neste navegador — baixando ${arquivos.length} imagem(ns).`);
          baixar(arquivos);
        }
      } catch (erro) {
        console.error(`falha ao gerar o story: ${erro.message}`);
        mostrarNota("Falha ao gerar a imagem.");
      }
    }),
  );

  baixarBotao.addEventListener("click", () =>
    agir(async () => {
      try {
        baixar(await gerarArquivos());
      } catch (erro) {
        console.error(`falha ao gerar o story: ${erro.message}`);
        mostrarNota("Falha ao gerar a imagem.");
      }
    }),
  );

  dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) dialogo.close();
  });

  sincronizarControles();
  compor();
  dialogo.showModal();
}
