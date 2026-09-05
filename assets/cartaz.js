export const fontes = typeof document !== "undefined" && document.fonts
  ? Promise.allSettled([
      document.fonts.load('40px "Anton"'),
      document.fonts.load('800 20px "Archivo"'),
      document.fonts.load('600 20px "Archivo"'),
      document.fonts.load('40px "DSEG7Classic"'),
    ])
  : Promise.resolve();

export function ajustar(ctx, texto, maxLargura) {
  if (ctx.measureText(texto).width <= maxLargura) return texto;
  let cortado = texto;
  while (cortado.length > 1 && ctx.measureText(`${cortado}…`).width > maxLargura) {
    cortado = cortado.slice(0, -1).trimEnd();
  }
  return `${cortado}…`;
}

export function envolver(ctx, texto, maxLargura, maxLinhas) {
  const linhas = [];
  let atual = "";
  for (const palavra of String(texto).split(/\s+/).filter(Boolean)) {
    if (atual === "") {
      atual = palavra;
    } else if (ctx.measureText(`${atual} ${palavra}`).width <= maxLargura) {
      atual = `${atual} ${palavra}`;
    } else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual !== "") linhas.push(atual);
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

export function retanguloArredondado(ctx, x, y, w, h, raio) {
  const r = Math.min(raio, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function desenharCapa(ctx, img, x, y, w, h) {
  if (!img) return;
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

const cacheImagens = new Map();
export function carregarImagem(src) {
  if (!src) return Promise.resolve(null);
  let p = cacheImagens.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    cacheImagens.set(src, p);
  }
  return p;
}

export function desenharQr(ctx, url, x, y, tamanho) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, tamanho, tamanho);
  if (typeof window === "undefined" || !window.qrcode) return;
  try {
    const qr = window.qrcode(0, "M");
    qr.addData(url);
    qr.make();
    const count = qr.getModuleCount();
    const pad = 4;
    const drawSize = tamanho - pad * 2;
    const cellSize = drawSize / count;
    ctx.fillStyle = "#131218";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(
            x + pad + c * cellSize,
            y + pad + r * cellSize,
            cellSize + 0.05,
            cellSize + 0.05,
          );
        }
      }
    }
  } catch (e) {
    console.error("QR draw error:", e);
  }
}

function desenharPlisse(ctx, x, y, w, h, stripe = 18) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  let curr = x;
  let toggle = false;
  while (curr < x + w) {
    ctx.fillStyle = toggle ? "#1e1b26" : "#15131b";
    ctx.fillRect(curr, y, stripe, h);
    curr += stripe;
    toggle = !toggle;
  }
  ctx.restore();
}

function desenharLogoCabecalho(ctx, x, y, accent, dark) {
  ctx.save();
  ctx.font = "15px Anton, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = dark ? "#f4efe3" : "#131218";
  ctx.fillText("VOTO ", x, y);
  const wVoto = ctx.measureText("VOTO ").width;
  const xSec = x + wVoto;
  ctx.fillText("SECRETO", xSec, y);
  const wSec = ctx.measureText("SECRETO").width;

  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(xSec - 2, y + 8);
  ctx.lineTo(xSec + wSec + 2, y + 6);
  ctx.stroke();

  ctx.font = "15px sans-serif";
  ctx.fillText("🤭", xSec + wSec + 4, y);
  ctx.restore();
}

function desenharFaixaNao(ctx, x, y, w, h, texto = "NÃO VOTO", fs = 20) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((-18 * Math.PI) / 180);
  ctx.fillStyle = "#d81e2c";
  const bh = fs * 1.5;
  ctx.fillRect(-w, -bh / 2, w * 2, bh);
  ctx.fillStyle = "#ffffff";
  ctx.font = `${fs}px Anton, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, 0, 1);
  ctx.restore();
}

function desenharCheckVerde(ctx, x, y, r = 24, bgBorda = "#15131b") {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#178a4c";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = bgBorda;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${Math.round(r * 1.15)}px Archivo, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✓", x, y + 1);
  ctx.restore();
}

function desenharRetratoOuMonograma(ctx, img, iniciais, matiz, x, y, w, h, grayscale = false) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (img) {
    if (grayscale) {
      ctx.filter = "grayscale(1) contrast(1.1)";
    }
    desenharCapa(ctx, img, x, y, w, h);
  } else {
    ctx.fillStyle = `hsl(${matiz ?? 260}, 30%, 42%)`;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#f4efe3";
    ctx.font = `800 ${Math.round(Math.min(w * 0.38, h * 0.28))}px Archivo, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(iniciais || "VS", x + w / 2, y + h / 2);
  }
  ctx.restore();
}

function desenharLcdBox(ctx, numero, x, y, fs = 34, bg = "#0d1710", fg = "#b9f0c9") {
  ctx.save();
  ctx.font = `${fs}px DSEG7Classic, monospace`;
  const m = ctx.measureText(String(numero));
  const padX = 8;
  const padY = 4;
  const w = m.width + padX * 2;
  const h = fs + padY * 2;
  ctx.fillStyle = bg;
  retanguloArredondado(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(String(numero), x + padX, y + padY + 1);
  ctx.restore();
  return { w, h };
}

export async function desenharCartao(canvas, post) {
  await fontes;
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.scale(3, 3);

  const modelo = post.modelo ?? "cabine";
  const postura = post.postura ?? "nao";
  const tipo = post.tipo ?? "candidato";
  const isDark = modelo === "cabine";

  const red = isDark ? "#ff4553" : "#d81e2c";
  const green = isDark ? "#3ad07a" : "#178a4c";
  const accent = postura === "nao" ? red : green;
  const fg = isDark ? "#f4efe3" : "#131218";
  const muted = isDark ? "#a9a3b5" : "#6b6675";
  const linha = isDark ? "rgba(244,239,227,.18)" : "rgba(19,18,24,.15)";
  const lcdBg = isDark ? "#0d1710" : "#c7d3b8";
  const lcdFg = isDark ? "#b9f0c9" : "#22301f";

  if (isDark) {
    desenharPlisse(ctx, 0, 0, 360, 450, 18);
  } else {
    ctx.fillStyle = "#f4efe3";
    ctx.fillRect(0, 0, 360, 450);
  }

  desenharLogoCabecalho(ctx, 18, 16, accent, isDark);
  ctx.font = "700 10.5px Archivo, sans-serif";
  ctx.fillStyle = muted;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(String(post.meta || "").toUpperCase(), 342, 18);

  const imagens = new Map();
  if (tipo === "candidato" && post.candidato?.fotoSrc) {
    const img = await carregarImagem(post.candidato.fotoSrc);
    if (img) imagens.set("candidato", img);
  } else if (tipo === "duelo") {
    if (post.duelo?.nao?.fotoSrc) {
      const img = await carregarImagem(post.duelo.nao.fotoSrc);
      if (img) imagens.set("nao", img);
    }
    if (post.duelo?.sim?.fotoSrc) {
      const img = await carregarImagem(post.duelo.sim.fotoSrc);
      if (img) imagens.set("sim", img);
    }
  } else if (tipo === "pauta" || tipo === "lista") {
    for (let i = 0; i < (post.grade?.faces?.length ?? 0); i++) {
      const f = post.grade.faces[i];
      if (f.fotoSrc) {
        const img = await carregarImagem(f.fotoSrc);
        if (img) imagens.set(f.sq ?? f.numero ?? i, img);
      }
    }
  }

  if (tipo === "candidato") {
    const c = post.candidato || {};
    const fx = 18;
    const fy = 46;
    const fw = 150;
    const fh = 328;

    ctx.lineWidth = 4;
    ctx.strokeStyle = accent;
    ctx.strokeRect(fx, fy, fw, fh);

    desenharRetratoOuMonograma(
      ctx,
      imagens.get("candidato"),
      c.iniciais,
      c.matiz,
      fx,
      fy,
      fw,
      fh,
      postura === "nao",
    );

    if (postura === "nao") {
      desenharFaixaNao(ctx, fx, fy, fw, fh, "NÃO VOTO", 20);
    } else {
      desenharCheckVerde(ctx, fx + fw - 4, fy + fh - 4, 24, isDark ? "#15131b" : "#f4efe3");
    }

    const dx = 182;
    let dy = 46;

    ctx.font = `${postura === "nao" ? 46 : 60}px Anton, sans-serif`;
    ctx.fillStyle = accent;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(postura === "nao" ? "NÃO VOTO" : "VOTO", dx, dy);
    dy += postura === "nao" ? 44 : 56;

    ctx.font = "700 9.5px Archivo, sans-serif";
    ctx.fillStyle = muted;
    ctx.fillText("NÚMERO NA URNA", dx, dy);
    dy += 15;

    const lcdDim = desenharLcdBox(ctx, c.numero || "", dx, dy, 34, lcdBg, lcdFg);
    dy += lcdDim.h + 8;

    ctx.font = "19px Anton, sans-serif";
    ctx.fillStyle = fg;
    const nomeLinhas = envolver(ctx, String(c.nome || "").toUpperCase(), 160, 2);
    for (const nl of nomeLinhas) {
      ctx.fillText(nl, dx, dy);
      dy += 19;
    }

    ctx.font = "600 11.5px Archivo, sans-serif";
    ctx.fillStyle = muted;
    ctx.fillText(`${c.partido || ""} · ${post.uf || "SP"}`, dx, dy);
    dy += 18;

    const temFavor = (c.favor?.length ?? 0) > 0;
    const temContra = (c.contra?.length ?? 0) > 0;

    if (temFavor) {
      ctx.font = "800 8.5px Archivo, sans-serif";
      ctx.fillStyle = muted;
      ctx.fillText("FOI A FAVOR", dx, dy);
      dy += 13;
      let bx = dx;
      for (const badge of c.favor) {
        ctx.font = "800 9px Archivo, sans-serif";
        const bw = ctx.measureText(badge.toUpperCase()).width + 8;
        if (bx + bw > 342) {
          bx = dx;
          dy += 18;
        }
        ctx.fillStyle = accent;
        retanguloArredondado(ctx, bx, dy, bw, 15, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(badge.toUpperCase(), bx + 4, dy + 3);
        bx += bw + 4;
      }
      dy += 20;
    }

    if (temContra) {
      ctx.font = "800 8.5px Archivo, sans-serif";
      ctx.fillStyle = muted;
      ctx.fillText("FOI CONTRA", dx, dy);
      dy += 13;
      let bx = dx;
      for (const badge of c.contra) {
        ctx.font = "800 9px Archivo, sans-serif";
        const bw = ctx.measureText(badge.toUpperCase()).width + 8;
        if (bx + bw > 342) {
          bx = dx;
          dy += 18;
        }
        ctx.fillStyle = accent;
        retanguloArredondado(ctx, bx, dy, bw, 15, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(badge.toUpperCase(), bx + 4, dy + 3);
        bx += bw + 4;
      }
      dy += 20;
    }

    if (!temFavor && !temContra) {
      ctx.font = "600 9.5px Archivo, sans-serif";
      ctx.fillStyle = muted;
      ctx.fillText("Sem histórico no Congresso nestas votações.", dx, dy);
    }
  } else if (tipo === "duelo") {
    const d = post.duelo || {};
    const dNao = d.nao || {};
    const dSim = d.sim || {};

    let dy = 42;
    ctx.font = "30px Anton, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = red;
    ctx.fillText("ESTE NÃO. ", 18, dy);
    const wNao = ctx.measureText("ESTE NÃO. ").width;
    ctx.fillStyle = green;
    ctx.fillText("ESTE SIM.", 18 + wNao, dy);
    dy += 34;

    const colW = 156;
    const col1X = 18;
    const col2X = 186;

    ctx.lineWidth = 4;
    ctx.strokeStyle = red;
    ctx.strokeRect(col1X, dy, colW, 118);
    desenharRetratoOuMonograma(ctx, imagens.get("nao"), dNao.iniciais, dNao.matiz, col1X, dy, colW, 118, true);
    desenharFaixaNao(ctx, col1X, dy, colW, 118, "NÃO", 22);

    ctx.strokeStyle = green;
    ctx.strokeRect(col2X, dy, colW, 118);
    desenharRetratoOuMonograma(ctx, imagens.get("sim"), dSim.iniciais, dSim.matiz, col2X, dy, colW, 118, false);
    desenharCheckVerde(ctx, col2X + colW - 4, dy + 118 - 4, 20, isDark ? "#15131b" : "#f4efe3");

    dy += 124;

    desenharLcdBox(ctx, dNao.numero || "", col1X, dy, 24, lcdBg, lcdFg);
    desenharLcdBox(ctx, dSim.numero || "", col2X, dy, 24, lcdBg, lcdFg);
    dy += 34;

    ctx.font = "14px Anton, sans-serif";
    ctx.fillStyle = fg;
    ctx.fillText(ajustar(ctx, String(dNao.nome || "").toUpperCase(), colW), col1X, dy);
    ctx.fillText(ajustar(ctx, String(dSim.nome || "").toUpperCase(), colW), col2X, dy);
    dy += 16;

    ctx.font = "600 10.5px Archivo, sans-serif";
    ctx.fillStyle = muted;
    ctx.fillText(`${dNao.partido || ""} · ${post.uf || "SP"}`, col1X, dy);
    ctx.fillText(`${dSim.partido || ""} · ${post.uf || "SP"}`, col2X, dy);
    dy += 16;

    if (dNao.contra?.length) {
      let bx = col1X;
      for (const badge of dNao.contra.slice(0, 3)) {
        ctx.font = "800 8.5px Archivo, sans-serif";
        const bw = ctx.measureText(badge.toUpperCase()).width + 8;
        ctx.fillStyle = red;
        retanguloArredondado(ctx, bx, dy, bw, 15, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(badge.toUpperCase(), bx + 4, dy + 3);
        bx += bw + 4;
      }
    }

    if (dSim.favor?.length) {
      let bx = col2X;
      for (const badge of dSim.favor.slice(0, 3)) {
        ctx.font = "800 8.5px Archivo, sans-serif";
        const bw = ctx.measureText(badge.toUpperCase()).width + 8;
        ctx.fillStyle = green;
        retanguloArredondado(ctx, bx, dy, bw, 15, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(badge.toUpperCase(), bx + 4, dy + 3);
        bx += bw + 4;
      }
    }
  } else if (tipo === "pauta" || tipo === "lista") {
    const g = post.grade || {};
    const faces = g.faces || [];
    const nFaces = faces.length;
    const muitos = nFaces > 6;
    const faceH = muitos ? 40 : 66;
    const faceGap = muitos ? 4 : 6;
    const faixaFs = muitos ? 9 : 11;
    const lcdFs = muitos ? 12 : 13;

    let dy = 44;
    ctx.font = "20px Anton, sans-serif";
    ctx.fillStyle = accent;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const tituloTexto = g.titulo || "NÃO VOTO EM NENHUM DESTES";
    let titLinhas = envolver(ctx, tituloTexto, 324, 2);
    let lineAdvance = 22;
    if (titLinhas.length > 0 && titLinhas[titLinhas.length - 1].endsWith("…")) {
      ctx.font = "16px Anton, sans-serif";
      titLinhas = envolver(ctx, tituloTexto, 324, 3);
      lineAdvance = 18;
    }
    for (const tl of titLinhas) {
      ctx.fillText(tl, 18, dy);
      dy += lineAdvance;
    }

    dy += 6;
    const colW = 104;
    const gapX = 6;

    for (let i = 0; i < nFaces; i++) {
      const f = faces[i];
      const col = i % 3;
      const row = Math.floor(i / 3);
      const fx = 18 + col * (colW + gapX);
      const fy = dy + row * (faceH + 28 + faceGap);

      ctx.lineWidth = 3;
      ctx.strokeStyle = accent;
      ctx.strokeRect(fx, fy, colW, faceH);

      desenharRetratoOuMonograma(
        ctx,
        imagens.get(f.sq ?? f.numero ?? i),
        f.iniciais,
        f.matiz,
        fx,
        fy,
        colW,
        faceH,
        postura === "nao",
      );

      if (postura === "nao") {
        desenharFaixaNao(ctx, fx, fy, colW, faceH, g.faixa || "CONTRA VOCÊ", faixaFs);
      }

      ctx.fillStyle = lcdBg;
      retanguloArredondado(ctx, fx, fy + faceH + 2, colW, lcdFs + 4, 3);
      ctx.fill();
      ctx.font = `${lcdFs}px DSEG7Classic, monospace`;
      ctx.fillStyle = lcdFg;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(f.numero || ""), fx + colW / 2, fy + faceH + 4);

      ctx.font = "800 8.5px Archivo, sans-serif";
      ctx.fillStyle = fg;
      ctx.textAlign = "left";
      const nomeCurto = String(f.nome || "").split(/\s+/).slice(0, 2).join(" ");
      ctx.fillText(ajustar(ctx, nomeCurto.toUpperCase(), colW), fx, fy + faceH + lcdFs + 8);
    }

    if (g.fonteBadges?.length) {
      ctx.font = "800 9px Archivo, sans-serif";
      const rotulo = (g.fonteRotulo || "Eles apoiaram").toUpperCase();
      const rotuloW = ctx.measureText(rotulo).width + 8;

      let totalW = 18 + rotuloW;
      let cabeEmUmaLinha = true;
      for (const badge of g.fonteBadges) {
        const bw = ctx.measureText(badge.toUpperCase()).width + 8;
        if (totalW + bw > 342) {
          cabeEmUmaLinha = false;
          break;
        }
        totalW += bw + 4;
      }

      let by = cabeEmUmaLinha ? 358 : 338;
      ctx.fillStyle = muted;
      ctx.fillText(rotulo, 18, by);
      let bx = 18 + rotuloW;

      for (const badge of g.fonteBadges) {
        const bw = ctx.measureText(badge.toUpperCase()).width + 8;
        if (bx + bw > 342) {
          if (by === 338) {
            by = 356;
            bx = 18;
          } else {
            break;
          }
        }
        ctx.fillStyle = accent;
        retanguloArredondado(ctx, bx, by - 2, bw, 15, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(badge.toUpperCase(), bx + 4, by + 1);
        bx += bw + 4;
      }
    }
  }

  const isGrade = tipo === "pauta" || tipo === "lista";
  const qrSize = isGrade ? 56 : 66;
  const footY = 450 - 14 - qrSize;

  ctx.strokeStyle = linha;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(18, footY - 8);
  ctx.lineTo(342, footY - 8);
  ctx.stroke();

  ctx.font = "700 13px ui-monospace, Menlo, monospace";
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(post.link || "votosecreto.com.br", 18, footY + 4);

  ctx.font = "600 10px Archivo, sans-serif";
  ctx.fillStyle = muted;
  ctx.fillText("Escaneie e veja a prova: votação nominal do Congresso.", 18, footY + 24);

  const qrX = 342 - qrSize;
  desenharQr(ctx, post.url || `https://${post.link || "votosecreto.com.br"}`, qrX, footY, qrSize);

  ctx.restore();
}

export async function gerarCartao(post) {
  const c = document.createElement("canvas");
  await desenharCartao(c, post);
  return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));
}

export async function desenharStory(canvas, post) {
  await fontes;
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0e0d12";
  ctx.fillRect(0, 0, 1080, 1920);

  ctx.font = "90px Anton, sans-serif";
  ctx.fillStyle = "#f4efe3";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const linhasTitulo = envolver(ctx, post.storyTitulo || "MEU VOTO É SECRETO. 🤭", 960, 3);
  let ty = 140;
  for (const lt of linhasTitulo) {
    ctx.fillText(lt, 540, ty);
    ty += 96;
  }

  const cardCanvas = document.createElement("canvas");
  await desenharCartao(cardCanvas, post);
  ctx.drawImage(cardCanvas, 0, 420, 1080, 1350);

  const footerTexto = `Escaneie o QR ou abra ${post.link || "votosecreto.com.br"}`;
  let footerFs = 39;
  ctx.font = `700 ${footerFs}px Archivo, sans-serif`;
  while (footerFs > 16 && ctx.measureText(footerTexto).width > 960) {
    footerFs -= 1;
    ctx.font = `700 ${footerFs}px Archivo, sans-serif`;
  }
  ctx.fillStyle = "#a9a3b5";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ajustar(ctx, footerTexto, 960), 540, 1830);
}

export async function gerarStory(post) {
  const canvas = document.createElement("canvas");
  await desenharStory(canvas, post);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

export async function gerarAdesivos(post) {
  await fontes;
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1240, 1754);

  const stickerSize = 354;
  const marginX = Math.round((1240 - 3 * stickerSize) / 2);
  const marginY = Math.round((1754 - 4 * stickerSize) / 2);

  const sCanvas = document.createElement("canvas");
  sCanvas.width = stickerSize;
  sCanvas.height = stickerSize;
  const sCtx = sCanvas.getContext("2d");

  sCtx.save();
  sCtx.scale(1.475, 1.475);

  const postura = post.postura ?? "nao";
  const corBorda = postura === "nao" ? "#d81e2c" : "#178a4c";

  sCtx.fillStyle = "#f4efe3";
  sCtx.fillRect(0, 0, 240, 240);

  sCtx.lineWidth = 3;
  sCtx.strokeStyle = corBorda;
  sCtx.strokeRect(1.5, 1.5, 237, 237);

  let c = post.candidato;
  if (!c && post.duelo) {
    c = postura === "nao" ? post.duelo.nao : post.duelo.sim;
  } else if (!c && post.grade?.faces?.length) {
    c = post.grade.faces[0];
  }
  c = c || {};

  let imgCand = null;
  if (c.fotoSrc) imgCand = await carregarImagem(c.fotoSrc);

  desenharRetratoOuMonograma(sCtx, imgCand, c.iniciais, c.matiz, 10, 12, 62, 80, postura === "nao");
  if (postura === "nao") {
    desenharFaixaNao(sCtx, 10, 12, 62, 80, "NÃO", 12);
  }

  sCtx.font = "24px Anton, sans-serif";
  sCtx.fillStyle = corBorda;
  sCtx.textAlign = "left";
  sCtx.textBaseline = "top";
  sCtx.fillText(postura === "nao" ? "NÃO VOTO" : "VOTO", 80, 12);

  desenharLcdBox(sCtx, c.numero || "", 80, 40, 16, "#c7d3b8", "#22301f");

  sCtx.font = "11.5px Anton, sans-serif";
  sCtx.fillStyle = "#131218";
  sCtx.fillText(ajustar(sCtx, String(c.nome || "").toUpperCase(), 150), 80, 66);

  sCtx.font = "600 9px Archivo, sans-serif";
  sCtx.fillStyle = "#6b6675";
  sCtx.fillText(`${c.partido || ""} · ${post.uf || "SP"} · 2026`, 80, 80);

  const contraBadges = (c.contra || []).filter(Boolean);
  const favorBadges = (c.favor || []).filter(Boolean);

  let ay = 100;
  if (contraBadges.length) {
    sCtx.font = "800 7.5px Archivo, sans-serif";
    sCtx.fillStyle = "#6b6675";
    sCtx.fillText("FOI CONTRA: " + contraBadges.slice(0, 2).join(", ").toUpperCase(), 10, ay);
    ay += 12;
  }
  if (favorBadges.length) {
    sCtx.font = "800 7.5px Archivo, sans-serif";
    sCtx.fillStyle = "#6b6675";
    sCtx.fillText("FOI A FAVOR: " + favorBadges.slice(0, 2).join(", ").toUpperCase(), 10, ay);
    ay += 12;
  }

  sCtx.strokeStyle = "rgba(19,18,24,.15)";
  sCtx.lineWidth = 1;
  sCtx.beginPath();
  sCtx.moveTo(10, 174);
  sCtx.lineTo(230, 174);
  sCtx.stroke();

  desenharLogoCabecalho(sCtx, 10, 180, corBorda, false);

  sCtx.font = "700 8px ui-monospace, monospace";
  sCtx.fillStyle = "#131218";
  sCtx.fillText(post.link || "votosecreto.com.br", 10, 202);

  sCtx.font = "600 7px Archivo, sans-serif";
  sCtx.fillStyle = "#6b6675";
  sCtx.fillText("Votação nominal da Câmara", 10, 214);

  desenharQr(sCtx, post.url || `https://${post.link || "votosecreto.com.br"}`, 176, 178, 54);

  sCtx.restore();

  for (let r = 0; r < 4; r++) {
    for (let col = 0; col < 3; col++) {
      const x = marginX + col * stickerSize;
      const y = marginY + r * stickerSize;
      ctx.drawImage(sCanvas, x, y);

      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, stickerSize, stickerSize);
      ctx.setLineDash([]);
    }
  }

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
