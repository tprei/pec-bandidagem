export const fontsReady =
  typeof document !== "undefined" && document.fonts
    ? Promise.allSettled([
        document.fonts.load('40px "Anton"'),
        document.fonts.load('800 20px "Archivo"'),
        document.fonts.load('600 20px "Archivo"'),
        document.fonts.load('40px "DSEG7Classic"'),
      ])
    : Promise.resolve();

export function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1).trimEnd();
  }
  return `${truncated}…`;
}

export function wrapText(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let current = "";
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (current === "") {
      current = word;
    } else if (ctx.measureText(`${current} ${word}`).width <= maxWidth) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last !== "" && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

export function roundedRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawCover(ctx, img, x, y, w, h) {
  if (!img) return;
  const target = w / h;
  const source = img.naturalWidth / img.naturalHeight;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  let sx = 0;
  let sy = 0;
  if (source > target) {
    sw = img.naturalHeight * target;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / target;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

const imageCache = new Map();
export const DISCLAIMER = "Manifestação individual de preferência do eleitor. Não é recomendação de voto.";
export function loadImage(src) {
  if (!src) return Promise.resolve(null);
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

export function drawQr(ctx, url, x, y, size) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, size, size);
  if (typeof window === "undefined" || !window.qrcode) return;
  try {
    const qr = window.qrcode(0, "M");
    qr.addData(url);
    qr.make();
    const count = qr.getModuleCount();
    const pad = 4;
    const drawSize = size - pad * 2;
    const cellSize = drawSize / count;
    ctx.fillStyle = "#131218";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(x + pad + c * cellSize, y + pad + r * cellSize, cellSize + 0.05, cellSize + 0.05);
        }
      }
    }
  } catch (e) {
    console.error("QR draw error:", e);
  }
}

function drawPleat(ctx, x, y, w, h, stripe = 18) {
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

function drawHeaderLogo(ctx, x, y, accent, dark) {
  ctx.save();
  ctx.font = "15px Anton, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = dark ? "#f4efe3" : "#131218";
  ctx.fillText("VOTO ", x, y);
  const voteWidth = ctx.measureText("VOTO ").width;
  const secretX = x + voteWidth;
  ctx.fillText("SECRETO", secretX, y);
  const secretWidth = ctx.measureText("SECRETO").width;

  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(secretX - 2, y + 8);
  ctx.lineTo(secretX + secretWidth + 2, y + 6);
  ctx.stroke();

  ctx.font = "15px sans-serif";
  ctx.fillText("🤭", secretX + secretWidth + 4, y);
  ctx.restore();
}

function drawRejectBanner(ctx, x, y, w, h, text = "NÃO VOTO", fs = 20) {
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
  ctx.fillText(text, 0, 1);
  ctx.restore();
}

function drawGreenCheck(ctx, x, y, r = 24, bgBorder = "#15131b") {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#178a4c";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = bgBorder;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${Math.round(r * 1.15)}px Archivo, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✓", x, y + 1);
  ctx.restore();
}

function drawPortraitOrMonogram(ctx, img, initials, hue, x, y, w, h, grayscale = false) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (img) {
    if (grayscale) {
      ctx.filter = "grayscale(1) contrast(1.1)";
    }
    drawCover(ctx, img, x, y, w, h);
  } else {
    ctx.fillStyle = `hsl(${hue ?? 260}, 30%, 42%)`;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#f4efe3";
    ctx.font = `800 ${Math.round(Math.min(w * 0.38, h * 0.28))}px Archivo, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials || "VS", x + w / 2, y + h / 2);
  }
  ctx.restore();
}

function drawLcdBox(ctx, number, x, y, fs = 34, bg = "#0d1710", fg = "#b9f0c9") {
  ctx.save();
  ctx.font = `${fs}px DSEG7Classic, monospace`;
  const m = ctx.measureText(String(number));
  const padX = 8;
  const padY = 4;
  const w = m.width + padX * 2;
  const h = fs + padY * 2;
  ctx.fillStyle = bg;
  roundedRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(String(number), x + padX, y + padY + 1);
  ctx.restore();
  return { w, h };
}

export async function drawCard(canvas, post) {
  await fontsReady;
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.scale(3, 3);

  const template = post.template ?? "booth";
  const stance = post.stance ?? "nao";
  const type = post.type ?? "candidate";
  const isDark = template === "booth";

  const red = isDark ? "#ff4553" : "#d81e2c";
  const green = isDark ? "#3ad07a" : "#178a4c";
  const accent = stance === "nao" ? red : green;
  const fg = isDark ? "#f4efe3" : "#131218";
  const muted = isDark ? "#a9a3b5" : "#6b6675";
  const line = isDark ? "rgba(244,239,227,.18)" : "rgba(19,18,24,.15)";
  const lcdBg = isDark ? "#0d1710" : "#c7d3b8";
  const lcdFg = isDark ? "#b9f0c9" : "#22301f";

  if (isDark) {
    drawPleat(ctx, 0, 0, 360, 450, 18);
  } else {
    ctx.fillStyle = "#f4efe3";
    ctx.fillRect(0, 0, 360, 450);
  }

  drawHeaderLogo(ctx, 18, 16, accent, isDark);
  ctx.font = "700 10.5px Archivo, sans-serif";
  ctx.fillStyle = muted;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(String(post.meta || "").toUpperCase(), 342, 18);

  const images = new Map();
  if (type === "candidate" && post.candidate?.photoSrc) {
    const img = await loadImage(post.candidate.photoSrc);
    if (img) images.set("candidate", img);
  } else if (type === "duel") {
    if (post.duel?.rejected?.photoSrc) {
      const img = await loadImage(post.duel.rejected.photoSrc);
      if (img) images.set("rejected", img);
    }
    if (post.duel?.chosen?.photoSrc) {
      const img = await loadImage(post.duel.chosen.photoSrc);
      if (img) images.set("chosen", img);
    }
  } else if (type === "issue" || type === "list") {
    for (let i = 0; i < (post.grid?.faces?.length ?? 0); i++) {
      const f = post.grid.faces[i];
      if (f.photoSrc) {
        const img = await loadImage(f.photoSrc);
        if (img) images.set(f.sq ?? f.ballotNumber ?? i, img);
      }
    }
  }

  if (type === "candidate") {
    const c = post.candidate || {};
    const fx = 18;
    const fy = 46;
    const fw = 150;
    const fh = 328;

    ctx.lineWidth = 4;
    ctx.strokeStyle = accent;
    ctx.strokeRect(fx, fy, fw, fh);

    drawPortraitOrMonogram(ctx, images.get("candidate"), c.initials, c.hue, fx, fy, fw, fh, stance === "nao");

    if (stance === "nao") {
      drawRejectBanner(ctx, fx, fy, fw, fh, "NÃO VOTO", 20);
    } else {
      drawGreenCheck(ctx, fx + fw - 4, fy + fh - 4, 24, isDark ? "#15131b" : "#f4efe3");
    }

    const dx = 182;
    let dy = 46;

    ctx.font = `${stance === "nao" ? 46 : 60}px Anton, sans-serif`;
    ctx.fillStyle = accent;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(stance === "nao" ? "NÃO VOTO" : "VOTO", dx, dy);
    dy += stance === "nao" ? 44 : 56;

    ctx.font = "700 9.5px Archivo, sans-serif";
    ctx.fillStyle = muted;
    ctx.fillText("NÚMERO NA URNA", dx, dy);
    dy += 15;

    const lcdDim = drawLcdBox(ctx, c.ballotNumber || "", dx, dy, 34, lcdBg, lcdFg);
    dy += lcdDim.h + 8;

    ctx.font = "19px Anton, sans-serif";
    ctx.fillStyle = fg;
    const nameLines = wrapText(ctx, String(c.name || "").toUpperCase(), 160, 2);
    for (const nl of nameLines) {
      ctx.fillText(nl, dx, dy);
      dy += 19;
    }

    ctx.font = "600 11.5px Archivo, sans-serif";
    ctx.fillStyle = muted;
    ctx.fillText(`${c.party || ""} · ${post.state || "SP"}`, dx, dy);
    dy += 18;

    const hasInFavor = (c.inFavor?.length ?? 0) > 0;
    const hasAgainst = (c.against?.length ?? 0) > 0;

    if (hasInFavor) {
      ctx.font = "800 8.5px Archivo, sans-serif";
      ctx.fillStyle = muted;
      ctx.fillText("FOI A FAVOR", dx, dy);
      dy += 13;
      let bx = dx;
      for (const badge of c.inFavor) {
        ctx.font = "800 9px Archivo, sans-serif";
        const bw = ctx.measureText(badge.toUpperCase()).width + 8;
        if (bx + bw > 342) {
          bx = dx;
          dy += 18;
        }
        ctx.fillStyle = accent;
        roundedRect(ctx, bx, dy, bw, 15, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(badge.toUpperCase(), bx + 4, dy + 3);
        bx += bw + 4;
      }
      dy += 20;
    }

    if (hasAgainst) {
      ctx.font = "800 8.5px Archivo, sans-serif";
      ctx.fillStyle = muted;
      ctx.fillText("FOI CONTRA", dx, dy);
      dy += 13;
      let bx = dx;
      for (const badge of c.against) {
        ctx.font = "800 9px Archivo, sans-serif";
        const bw = ctx.measureText(badge.toUpperCase()).width + 8;
        if (bx + bw > 342) {
          bx = dx;
          dy += 18;
        }
        ctx.fillStyle = accent;
        roundedRect(ctx, bx, dy, bw, 15, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(badge.toUpperCase(), bx + 4, dy + 3);
        bx += bw + 4;
      }
      dy += 20;
    }

    if (!hasInFavor && !hasAgainst) {
      ctx.font = "600 9.5px Archivo, sans-serif";
      ctx.fillStyle = muted;
      ctx.fillText("Sem histórico no Congresso nestas votações.", dx, dy);
    }
  } else if (type === "duel") {
    const d = post.duel || {};
    const dRejected = d.rejected || {};
    const dChosen = d.chosen || {};

    let dy = 42;
    ctx.font = "30px Anton, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = red;
    ctx.fillText("ESTE NÃO. ", 18, dy);
    const wReject = ctx.measureText("ESTE NÃO. ").width;
    ctx.fillStyle = green;
    ctx.fillText("ESTE SIM.", 18 + wReject, dy);
    dy += 36;

    const colW = 156;
    const col1X = 18;
    const col2X = 186;
    const faceH = 168;

    ctx.lineWidth = 4;
    ctx.strokeStyle = red;
    ctx.strokeRect(col1X, dy, colW, faceH);
    drawPortraitOrMonogram(
      ctx,
      images.get("rejected"),
      dRejected.initials,
      dRejected.hue,
      col1X,
      dy,
      colW,
      faceH,
      true,
    );
    drawRejectBanner(ctx, col1X, dy, colW, faceH, "NÃO", 26);

    ctx.strokeStyle = green;
    ctx.strokeRect(col2X, dy, colW, faceH);
    drawPortraitOrMonogram(
      ctx,
      images.get("chosen"),
      dChosen.initials,
      dChosen.hue,
      col2X,
      dy,
      colW,
      faceH,
      false,
    );
    drawGreenCheck(ctx, col2X + colW - 4, dy + faceH - 4, 22, isDark ? "#15131b" : "#f4efe3");

    dy += faceH + 10;

    drawLcdBox(ctx, dRejected.ballotNumber || "", col1X, dy, 24, lcdBg, lcdFg);
    drawLcdBox(ctx, dChosen.ballotNumber || "", col2X, dy, 24, lcdBg, lcdFg);
    dy += 40;

    ctx.font = "15px Anton, sans-serif";
    ctx.fillStyle = fg;
    ctx.fillText(fitText(ctx, String(dRejected.name || "").toUpperCase(), colW), col1X, dy);
    ctx.fillText(fitText(ctx, String(dChosen.name || "").toUpperCase(), colW), col2X, dy);
    dy += 18;

    ctx.font = "600 10.5px Archivo, sans-serif";
    ctx.fillStyle = muted;
    ctx.fillText(`${dRejected.party || ""} · ${post.state || "SP"}`, col1X, dy);
    ctx.fillText(`${dChosen.party || ""} · ${post.state || "SP"}`, col2X, dy);
    dy += 16;

    const rejectedBadges = (
      dRejected.badges ?? [...(dRejected.against ?? []), ...(dRejected.inFavor ?? [])]
    ).slice(0, 2);
    const chosenBadges = (
      dChosen.badges ?? [...(dChosen.inFavor ?? []), ...(dChosen.against ?? [])]
    ).slice(0, 2);

    ctx.font = "800 8.5px Archivo, sans-serif";
    for (const [colX, badges, badgeColor] of [
      [col1X, rejectedBadges, red],
      [col2X, chosenBadges, green],
    ]) {
      let by = dy;
      for (const badge of badges) {
        const text = fitText(ctx, badge.toUpperCase(), colW - 8);
        const bw = ctx.measureText(text).width + 8;
        ctx.fillStyle = badgeColor;
        roundedRect(ctx, colX, by, bw, 15, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, colX + 4, by + 3);
        by += 19;
      }
    }
  } else if (type === "issue" || type === "list") {
    const g = post.grid || {};
    const faces = g.faces || [];
    const faceCount = faces.length;
    const many = faceCount > 6;
    const lcdFs = many ? 12 : 13;

    let dy = 44;
    ctx.font = "20px Anton, sans-serif";
    ctx.fillStyle = accent;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const titleText = g.title || "NÃO VOTO EM NENHUM DESTES";
    let titleLines = wrapText(ctx, titleText, 324, 2);
    let lineAdvance = 22;
    if (titleLines.length > 0 && titleLines[titleLines.length - 1].endsWith("…")) {
      ctx.font = "16px Anton, sans-serif";
      titleLines = wrapText(ctx, titleText, 324, 3);
      lineAdvance = 18;
    }
    for (const tl of titleLines) {
      ctx.fillText(tl, 18, dy);
      dy += lineAdvance;
    }

    dy += 10;
    const colW = 104;
    const gapX = 6;
    const rowGap = 10;
    const rows = Math.ceil(faceCount / 3);
    const labelH = lcdFs + 24;

    const sourceBadges = g.sourceBadges || g.badges;
    const sourceLabel = (g.sourceLabel || g.label || "Eles apoiaram").toUpperCase();
    let sourceFitsOneLine = true;
    let sourceLabelW = 0;
    if (sourceBadges?.length) {
      ctx.font = "800 9px Archivo, sans-serif";
      sourceLabelW = ctx.measureText(sourceLabel).width + 8;
      let totalW = 18 + sourceLabelW;
      for (const badge of sourceBadges) {
        const bw = ctx.measureText(badge.toUpperCase()).width + 8;
        if (totalW + bw > 342) {
          sourceFitsOneLine = false;
          break;
        }
        totalW += bw + 4;
      }
    }

    const sourceRowY = sourceFitsOneLine ? 362 : 344;
    const gridBottom = sourceBadges?.length ? sourceRowY - 12 : 378;

    const faceH = Math.max(
      34,
      Math.min(96, Math.floor((gridBottom - dy - (rows - 1) * rowGap) / rows) - labelH),
    );
    const bannerFs = faceH >= 78 ? 13 : faceH >= 56 ? 11 : 9;
    const blockH = rows * (faceH + labelH) + (rows - 1) * rowGap;
    const gridTop = dy + Math.max(0, Math.floor((gridBottom - dy - blockH) / 2));

    for (let i = 0; i < faceCount; i++) {
      const f = faces[i];
      const col = i % 3;
      const row = Math.floor(i / 3);
      const fx = 18 + col * (colW + gapX);
      const fy = gridTop + row * (faceH + labelH + rowGap);

      ctx.lineWidth = 3;
      ctx.strokeStyle = accent;
      ctx.strokeRect(fx, fy, colW, faceH);

      drawPortraitOrMonogram(
        ctx,
        images.get(f.sq ?? f.ballotNumber ?? i),
        f.initials,
        f.hue,
        fx,
        fy,
        colW,
        faceH,
        stance === "nao",
      );

      if (stance === "nao") {
        drawRejectBanner(ctx, fx, fy, colW, faceH, g.banner || "CONTRA VOCÊ", bannerFs);
      }

      ctx.fillStyle = lcdBg;
      roundedRect(ctx, fx, fy + faceH + 4, colW, lcdFs + 5, 3);
      ctx.fill();
      ctx.font = `${lcdFs}px DSEG7Classic, monospace`;
      ctx.fillStyle = lcdFg;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(f.ballotNumber || ""), fx + colW / 2, fy + faceH + 6);

      ctx.font = "800 8.5px Archivo, sans-serif";
      ctx.fillStyle = fg;
      ctx.textAlign = "left";
      const shortName = String(f.name || "")
        .split(/\s+/)
        .slice(0, 2)
        .join(" ");
      ctx.fillText(fitText(ctx, shortName.toUpperCase(), colW), fx, fy + faceH + lcdFs + 13);
    }

    if (sourceBadges?.length) {
      ctx.font = "800 9px Archivo, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      let by = sourceRowY;
      let bx = 18 + sourceLabelW;
      ctx.fillStyle = muted;
      ctx.fillText(sourceLabel, 18, by);
      for (const badge of sourceBadges) {
        const bw = ctx.measureText(badge.toUpperCase()).width + 8;
        if (bx + bw > 342) {
          if (by === 344) {
            by = 362;
            bx = 18;
          } else {
            break;
          }
        }
        ctx.fillStyle = accent;
        roundedRect(ctx, bx, by - 2, bw, 15, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(badge.toUpperCase(), bx + 4, by + 1);
        bx += bw + 4;
      }
    }
  }

  const qrSize = 44;
  const footerLineY = 386;
  const qrX = 342 - qrSize;
  const textW = qrX - 10 - 18;

  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(18, footerLineY);
  ctx.lineTo(342, footerLineY);
  ctx.stroke();

  drawQr(ctx, post.url || `https://${post.link || "votosecreto.com.br"}`, qrX, footerLineY + 6, qrSize);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "600 7.5px Archivo, sans-serif";
  ctx.fillStyle = muted;
  let noteY = footerLineY + 6;
  for (const noteLine of wrapText(ctx, DISCLAIMER, textW, 2)) {
    ctx.fillText(noteLine, 18, noteY);
    noteY += 10;
  }

  const linkStr = post.link || "votosecreto.com.br";
  let linkFs = 9;
  ctx.font = `700 ${linkFs}px ui-monospace, Menlo, monospace`;
  while (linkFs > 6.5 && ctx.measureText(linkStr).width > textW) {
    linkFs -= 0.5;
    ctx.font = `700 ${linkFs}px ui-monospace, Menlo, monospace`;
  }
  ctx.fillStyle = fg;
  ctx.fillText(fitText(ctx, linkStr, textW), 18, 424);
  ctx.restore();
}

export async function renderCard(post) {
  const c = document.createElement("canvas");
  await drawCard(c, post);
  return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));
}

export async function drawStory(canvas, post) {
  await fontsReady;
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0e0d12";
  ctx.fillRect(0, 0, 1080, 1920);

  ctx.font = "90px Anton, sans-serif";
  ctx.fillStyle = "#f4efe3";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const titleLines = wrapText(ctx, post.storyTitle || "MEU VOTO É SECRETO MAS… 🤭", 960, 3);
  let ty = 140;
  for (const lt of titleLines) {
    ctx.fillText(lt, 540, ty);
    ty += 96;
  }

  const cardCanvas = document.createElement("canvas");
  await drawCard(cardCanvas, post);
  ctx.drawImage(cardCanvas, 0, 420, 1080, 1350);

  ctx.font = "700 39px Archivo, sans-serif";
  ctx.fillStyle = "#a9a3b5";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Escaneie para mais informações", 540, 1840);
}

export async function renderStory(post) {
  const canvas = document.createElement("canvas");
  await drawStory(canvas, post);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

export async function renderStickerSheet(post) {
  await fontsReady;
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

  const stance = post.stance ?? "nao";
  const borderColor = stance === "nao" ? "#d81e2c" : "#178a4c";

  sCtx.fillStyle = "#f4efe3";
  sCtx.fillRect(0, 0, 240, 240);

  sCtx.lineWidth = 3;
  sCtx.strokeStyle = borderColor;
  sCtx.strokeRect(1.5, 1.5, 237, 237);

  let c = post.candidate;
  if (!c && post.duel) {
    c = stance === "nao" ? post.duel.rejected : post.duel.chosen;
  } else if (!c && post.grid?.faces?.length) {
    c = post.grid.faces[0];
  }
  c = c || {};

  let candidateImg = null;
  if (c.photoSrc) candidateImg = await loadImage(c.photoSrc);

  drawPortraitOrMonogram(sCtx, candidateImg, c.initials, c.hue, 10, 12, 62, 80, stance === "nao");
  if (stance === "nao") {
    drawRejectBanner(sCtx, 10, 12, 62, 80, "NÃO", 12);
  }

  sCtx.font = "24px Anton, sans-serif";
  sCtx.fillStyle = borderColor;
  sCtx.textAlign = "left";
  sCtx.textBaseline = "top";
  sCtx.fillText(stance === "nao" ? "NÃO VOTO" : "VOTO", 80, 12);

  drawLcdBox(sCtx, c.ballotNumber || "", 80, 40, 16, "#c7d3b8", "#22301f");

  sCtx.font = "11.5px Anton, sans-serif";
  sCtx.fillStyle = "#131218";
  sCtx.fillText(fitText(sCtx, String(c.name || "").toUpperCase(), 150), 80, 66);

  sCtx.font = "600 9px Archivo, sans-serif";
  sCtx.fillStyle = "#6b6675";
  sCtx.fillText(`${c.party || ""} · ${post.state || "SP"} · 2026`, 80, 80);

  const againstBadges = (c.against || []).filter(Boolean);
  const inFavorBadges = (c.inFavor || []).filter(Boolean);

  let ay = 100;
  if (againstBadges.length) {
    sCtx.font = "800 7.5px Archivo, sans-serif";
    sCtx.fillStyle = "#6b6675";
    sCtx.fillText("FOI CONTRA: " + againstBadges.slice(0, 2).join(", ").toUpperCase(), 10, ay);
    ay += 12;
  }
  if (inFavorBadges.length) {
    sCtx.font = "800 7.5px Archivo, sans-serif";
    sCtx.fillStyle = "#6b6675";
    sCtx.fillText("FOI A FAVOR: " + inFavorBadges.slice(0, 2).join(", ").toUpperCase(), 10, ay);
  }

  sCtx.strokeStyle = "rgba(19,18,24,.15)";
  sCtx.lineWidth = 1;
  sCtx.beginPath();
  sCtx.moveTo(10, 174);
  sCtx.lineTo(230, 174);
  sCtx.stroke();

  drawHeaderLogo(sCtx, 10, 180, borderColor, false);

  sCtx.font = "700 8px ui-monospace, monospace";
  sCtx.fillStyle = "#131218";
  sCtx.fillText(fitText(sCtx, post.link || "votosecreto.com.br", 160), 10, 198);

  sCtx.font = "600 6.5px Archivo, sans-serif";
  sCtx.fillStyle = "#6b6675";
  let stickerNoteY = 210;
  for (const noteLine of wrapText(sCtx, DISCLAIMER, 160, 2)) {
    sCtx.fillText(noteLine, 10, stickerNoteY);
    stickerNoteY += 9;
  }
  drawQr(sCtx, post.url || `https://${post.link || "votosecreto.com.br"}`, 176, 178, 54);

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
