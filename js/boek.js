/* Fotoboek met krullende omslag-animatie + tekst op de pagina's */
(function () {
  const book = document.getElementById('flipbook');
  if (!book) return;

  const leaves = Array.from(book.querySelectorAll('.leaf'));
  const N = leaves.length;
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  const W = 300;
  const H = 410;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'flip-canvas';
  canvas.width = 2 * W * dpr;
  canvas.height = H * dpr;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Fotoboek, klik om te bladeren');
  const ctx = canvas.getContext('2d');

  leaves.forEach(function (l) { l.style.display = 'none'; });
  book.appendChild(canvas);

  const fronts = [];
  const backs = [];
  let index = 0;
  let busy = false;
  let isReady = false;

  /* ---------- afbeeldingen veilig laden (hangt nooit vast) ---------- */
  function ready(img) {
    if (!img || img.complete) return Promise.resolve();
    return new Promise(function (res) {
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', res, { once: true });
      setTimeout(res, 1500); // vangnet zodat het boek altijd start
    });
  }

  function getWrappedLines(g, text, maxWidth) {
    const words = text.trim().split(/\s+/);
    const lines = [];
    let currentLine = '';

    words.forEach(function (word) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (g.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  function makePage(sideEl, isCover) {
    const c = document.createElement('canvas');
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);

    // 1. Foto tekenen
    const img = sideEl ? sideEl.querySelector('img') : null;
    if (img && img.naturalWidth > 0) {
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    } else {
      g.fillStyle = '#3a3c3f';
      g.fillRect(0, 0, W, H);
    }

    // 2. Tekst uit .page-text tekenen
    const textBox = sideEl ? sideEl.querySelector('.page-text') : null;
    if (textBox) {
      const grad = g.createLinearGradient(0, H * 0.45, 0, H);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
      g.fillStyle = grad;
      g.fillRect(0, H * 0.45, W, H * 0.55);

      const pad = 22;
      const maxWidth = W - pad * 2;
      let cursorY = H - pad;

      const tagEl = textBox.querySelector('.page-tag');
      const titleEl = textBox.querySelector('h3');
      const descEl = textBox.querySelector('p');

      g.textBaseline = 'bottom';
      g.textAlign = 'left';

      if (descEl && descEl.textContent.trim()) {
        g.font = '400 13px Inter, Arial, sans-serif';
        g.fillStyle = '#f0f2f5';
        const lines = getWrappedLines(g, descEl.textContent, maxWidth);
        for (let i = lines.length - 1; i >= 0; i--) {
          g.fillText(lines[i], pad, cursorY);
          cursorY -= 18;
        }
        cursorY -= 6;
      }

      if (titleEl && titleEl.textContent.trim()) {
        g.font = '800 20px Inter, Arial, sans-serif';
        g.fillStyle = '#ffffff';
        const lines = getWrappedLines(g, titleEl.textContent, maxWidth);
        for (let i = lines.length - 1; i >= 0; i--) {
          g.fillText(lines[i], pad, cursorY);
          cursorY -= 24;
        }
        cursorY -= 6;
      }

      if (tagEl && tagEl.textContent.trim()) {
        g.font = '700 10px Inter, Arial, sans-serif';
        g.fillStyle = '#d4d7da';
        g.fillText(tagEl.textContent.trim().toUpperCase(), pad, cursorY);
      }
    }

    // 3. Magazine-omslag: subtiele rand en rugschaduw
    if (isCover) {
      // dunne buitenrand
      g.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      g.lineWidth = 2;
      g.strokeRect(1, 1, W - 2, H - 2);

      // fijn kader binnen de pagina
      g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      g.lineWidth = 1;
      g.strokeRect(12.5, 12.5, W - 25, H - 25);

      // lichte schaduw bij de rug (linkerrand)
      const spine = g.createLinearGradient(0, 0, 16, 0);
      spine.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
      spine.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = spine;
      g.fillRect(0, 0, 16, H);
    }

    return c;
  }

  /* ---------- geometrie ---------- */
  function clipPoly(poly, M, n, side) {
    const out = [];
    const dist = function (p) { return ((p.x - M.x) * n.x + (p.y - M.y) * n.y) * side; };
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = dist(a);
      const db = dist(b);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  }

  function path(poly) {
    ctx.beginPath();
    poly.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.closePath();
  }

  function ease(p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }

  /* ---------- tekenen ---------- */
  function render(k, p) {
    if (!isReady) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 2 * W, H);
    ctx.save();
    ctx.translate(W, 0);

    if (p <= 0) {
      if (k > 0 && backs[k - 1]) ctx.drawImage(backs[k - 1], -W, 0, W, H);
      if (fronts[k]) ctx.drawImage(fronts[k], 0, 0, W, H);
      ctx.restore();
      return;
    }
    if (p >= 1) {
      if (backs[k]) ctx.drawImage(backs[k], -W, 0, W, H);
      if (fronts[k + 1]) ctx.drawImage(fronts[k + 1], 0, 0, W, H);
      ctx.restore();
      return;
    }

    if (k > 0 && backs[k - 1]) ctx.drawImage(backs[k - 1], -W, 0, W, H);
    if (fronts[k + 1]) ctx.drawImage(fronts[k + 1], 0, 0, W, H);

    const e = ease(p);
    const C = { x: W, y: H };
    const P = { x: W - 2 * W * e, y: H - H * 0.38 * Math.sin(Math.PI * e) };
    const M = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 };
    const len = Math.hypot(C.x - P.x, C.y - P.y);
    const n = { x: (C.x - P.x) / len, y: (C.y - P.y) / len };

    const rect = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
    const keep = clipPoly(rect, M, n, -1);
    const fold = clipPoly(rect, M, n, 1);

    if (fold.length > 2) {
      ctx.save();
      path(fold);
      ctx.clip();
      const sh = ctx.createLinearGradient(M.x, M.y, M.x + n.x * 90, M.y + n.y * 90);
      sh.addColorStop(0, 'rgba(0,0,0,0.38)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(-W, -H, 3 * W, 3 * H);
      ctx.restore();
    }

    if (keep.length > 2 && fronts[k]) {
      ctx.save();
      path(keep);
      ctx.clip();
      ctx.drawImage(fronts[k], 0, 0, W, H);
      ctx.restore();
    }

    if (fold.length > 2 && backs[k]) {
      const a = 1 - 2 * n.x * n.x;
      const b = -2 * n.x * n.y;
      const d = 1 - 2 * n.y * n.y;
      const mn = M.x * n.x + M.y * n.y;

      ctx.save();
      ctx.transform(a, b, b, d, 2 * mn * n.x, 2 * mn * n.y);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 22 * dpr;
      ctx.fillStyle = '#fff';
      path(fold);
      ctx.fill();
      ctx.restore();

      path(fold);
      ctx.clip();

      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(backs[k], 0, 0, W, H);
      ctx.restore();

      const gl = ctx.createLinearGradient(M.x, M.y, M.x + n.x * 170, M.y + n.y * 170);
      gl.addColorStop(0, 'rgba(0,0,0,0.30)');
      gl.addColorStop(0.1, 'rgba(255,255,255,0.22)');
      gl.addColorStop(1, 'rgba(0,0,0,0.05)');
      ctx.fillStyle = gl;
      ctx.fillRect(-W, -H, 3 * W, 3 * H);

      ctx.restore();
    }

    ctx.restore();
  }

  /* ---------- bladeren ---------- */
  function shiftFor(i) {
    if (i === 0) return 'translateX(-25%)';
    if (i === N) return 'translateX(25%)';
    return 'translateX(0)';
  }

  function updateButtons() {
    if (prevBtn) prevBtn.disabled = index <= 0;
    if (nextBtn) nextBtn.disabled = index >= N;
  }

  function turn(dir) {
    if (!isReady || busy) return;
    if (dir > 0 && index >= N) return;
    if (dir < 0 && index <= 0) return;

    busy = true;
    const k = dir > 0 ? index : index - 1;
    const from = dir > 0 ? 0 : 1;
    const to = dir > 0 ? 1 : 0;
    const dur = reduceMotion ? 1 : 1100;
    const t0 = performance.now();

    canvas.style.transform = shiftFor(index + dir);

    function frame(now) {
      const t = Math.min((now - t0) / dur, 1);
      render(k, from + (to - from) * t);
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        index += dir;
        busy = false;
        render(index, 0);
        updateButtons();
      }
    }
    requestAnimationFrame(frame);
  }

  book.addEventListener('click', function (ev) {
    const r = canvas.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width;
    turn(x > 0.5 ? 1 : -1);
  });

  if (prevBtn) prevBtn.addEventListener('click', function () { turn(-1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { turn(1); });

  /* ---------- start ---------- */
  const imgs = [];
  leaves.forEach(function (leaf) {
    imgs.push(leaf.querySelector('.front img'));
    imgs.push(leaf.querySelector('.back img'));
  });

  Promise.all(imgs.map(ready)).then(function () {
    leaves.forEach(function (leaf, i) {
      fronts[i] = makePage(leaf.querySelector('.front'), i === 0);
      backs[i] = makePage(leaf.querySelector('.back'), false);
    });
    isReady = true;
    canvas.style.transform = shiftFor(0);
    render(0, 0);
    updateButtons();
  });
})();
