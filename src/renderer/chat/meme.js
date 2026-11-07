/* Gerador de memes originais com o próprio avatar (nada de imagem de terceiros). */
(function (root) {
  'use strict';
  const A = root.BituAvatar;

  const SCENES = {
    surpreso: { bg: ['#FFE3A3', '#FF8A3D'], css: '.m-o{display:inline}' },
    pensando: { bg: ['#D9E8FF', '#5BA8FF'], css: '.m-flat{display:inline}' },
    dancando: { bg: ['#FFD6EC', '#8E7CFF'], css: '.eyes-happy,.m-open,.m-open-tongue{display:inline}.b-eyes{display:none}' },
    chorando_de_rir: { bg: ['#FFF3B0', '#FFC93C'], css: '.eyes-happy,.m-open,.m-open-tongue,.b-tear{display:inline}.b-eyes{display:none}' },
    estiloso: { bg: ['#C8F7DC', '#2EC4B6'], css: '.eyes-shades,.m-cat{display:inline}.b-eyes{display:none}' },
    dormindo: { bg: ['#E3E0FF', '#3D3A4B'], css: '.eyes-closed,.m-o{display:inline}.b-eyes{display:none}' },
    bravo: { bg: ['#FFD0CC', '#F25F5C'], css: '.brow-angry,.m-flat{display:inline}' }
  };

  const BASE_CSS = '.b-eyes-alt>*,.b-mouth>*,.b-brows>*,.b-tear,.b-props>*{display:none}';

  function sceneSvg(cfg, scene) {
    const s = SCENES[scene] || SCENES.surpreso;
    const raw = A.svg({ ...cfg, kind: 'builtin' });
    return raw.replace('<ellipse class="b-shadow"', `<style>${BASE_CSS}${s.css}</style><ellipse class="b-shadow"`);
  }

  function loadImage(src, cors) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function wrap(ctx, text, maxW) {
    const words = String(text).toUpperCase().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function caption(ctx, text, y, fromBottom, W) {
    if (!text) return;
    let size = 78;
    let lines;
    do {
      ctx.font = `900 ${size}px Impact, "Arial Black", "Segoe UI Black", sans-serif`;
      lines = wrap(ctx, text, W - 70);
      size -= 4;
    } while ((lines.length > 3 || lines.some(l => ctx.measureText(l).width > W - 70)) && size > 30);
    const lh = size * 1.08;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(6, size / 7);
    ctx.strokeStyle = '#111';
    ctx.fillStyle = '#fff';
    const startY = fromBottom ? y - lines.length * lh : y;
    lines.forEach((l, i) => {
      ctx.strokeText(l, W / 2, startY + i * lh);
      ctx.fillText(l, W / 2, startY + i * lh);
    });
  }

  async function make({ top, bottom, scene }, avatarCfg) {
    const W = 900, H = 900;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const s = SCENES[scene] || SCENES.surpreso;

    // fundo: degradê + raios + bolinhas (estilo quadrinho)
    const g = ctx.createRadialGradient(W / 2, H * 0.55, 60, W / 2, H / 2, W * 0.75);
    g.addColorStop(0, s.bg[0]); g.addColorStop(1, s.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H * 0.58);
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    for (let i = 0; i < 18; i++) {
      ctx.rotate(Math.PI / 9);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-60, -900); ctx.lineTo(60, -900); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.07)';
    for (let y = 0; y < H; y += 18) for (let x = (y / 18) % 2 ? 9 : 0; x < W; x += 18) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }

    // personagem
    try {
      let img;
      if (avatarCfg.kind === 'image' && avatarCfg.file) {
        img = await loadImage(`bitu-asset://avatar/${encodeURIComponent(avatarCfg.file)}`, true);
      } else if (avatarCfg.kind === 'pack' && avatarCfg.manifest) {
        const st = avatarCfg.manifest.states || {};
        const f = st[{ dancando: 'dance', dormindo: 'sleep', pensando: 'think' }[scene]] || st.idle || Object.values(st)[0];
        img = await loadImage(`bitu-asset://avatar/${encodeURIComponent(avatarCfg.packDir)}/${encodeURIComponent(f)}`, true);
      } else {
        const svg = sceneSvg(avatarCfg, scene);
        img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      }
      const size = 560;
      const ratio = (img.naturalWidth || 1) / (img.naturalHeight || 1);
      const w = ratio >= 1 ? size : size * ratio, h = ratio >= 1 ? size / ratio : size;
      const tilt = { dancando: -0.12, chorando_de_rir: 0.06, bravo: 0, estiloso: -0.05 }[scene] || 0;
      ctx.save();
      ctx.translate(W / 2, H / 2 + 50);
      ctx.rotate(tilt);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    } catch (e) { console.warn('meme: avatar não carregou', e); }

    caption(ctx, top, 34, false, W);
    caption(ctx, bottom, H - 34, true, W);

    ctx.font = '600 20px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('feito com Bitu', W - 16, H - 10);
    return c.toDataURL('image/png');
  }

  root.BituMeme = { make, SCENES: Object.keys(SCENES) };
})(typeof self !== 'undefined' ? self : this);
