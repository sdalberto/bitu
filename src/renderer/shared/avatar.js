/* Desenho do personagem padrão (SVG feito à mão, 100% original) + suporte a avatares importados. */
(function (root) {
  'use strict';

  function hexToRgb(hex) {
    const h = String(hex || '#FF8A3D').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
    return '#' + [f(r), f(g), f(b)].map(c => c.toString(16).padStart(2, '0')).join('');
  }

  const SHAPES = {
    gota: {
      body: (c) => `<path class="b-shape" d="M100 30 C 120 58 166 84 166 124 C166 157 137 178 100 178 C63 178 34 157 34 124 C34 84 80 58 100 30Z" fill="${c}"/>`,
      feet: true, face: 0
    },
    bolinha: {
      body: (c) => `<circle class="b-shape" cx="100" cy="114" r="66" fill="${c}"/>`,
      feet: true, face: -4
    },
    robo: {
      body: (c, d) => `<line x1="100" y1="50" x2="100" y2="26" stroke="${d}" stroke-width="5" stroke-linecap="round"/>
        <circle class="b-antenna" cx="100" cy="22" r="8" fill="${shade(c, 0.35)}"/>
        <rect class="b-shape" x="36" y="50" width="128" height="124" rx="30" fill="${c}"/>
        <rect x="28" y="96" width="12" height="30" rx="6" fill="${d}"/><rect x="160" y="96" width="12" height="30" rx="6" fill="${d}"/>`,
      feet: true, face: 0
    },
    fantasminha: {
      body: (c) => `<path class="b-shape" d="M38 112 C38 66 66 40 100 40 C134 40 162 66 162 112 L162 170 Q151 158 140 170 Q130 182 120 170 Q110 158 100 170 Q90 182 80 170 Q70 158 60 170 Q49 182 38 170Z" fill="${c}"/>`,
      feet: false, face: 0
    },
    gatinho: {
      body: (c, d) => `<path d="M46 80 L52 30 L86 58Z" fill="${c}"/><path d="M154 80 L148 30 L114 58Z" fill="${c}"/>
        <path d="M56 70 L58 44 L76 60Z" fill="${shade(c, 0.35)}"/><path d="M144 70 L142 44 L124 60Z" fill="${shade(c, 0.35)}"/>
        <ellipse class="b-shape" cx="100" cy="118" rx="68" ry="60" fill="${c}"/>
        <path class="b-tail" d="M160 150 C186 146 190 120 176 108" stroke="${c}" stroke-width="12" fill="none" stroke-linecap="round"/>`,
      feet: true, face: 4, whiskers: true
    }
  };

  const EYES = {
    normal: (ink) => `<ellipse class="b-pupil" cx="0" cy="0" rx="8" ry="11" fill="${ink}"/><circle cx="2.5" cy="-4" r="3" fill="#fff"/>`,
    brilhante: (ink) => `<ellipse class="b-pupil" cx="0" cy="0" rx="10" ry="13" fill="${ink}"/><circle cx="3" cy="-5" r="4" fill="#fff"/><circle cx="-3.5" cy="4" r="2" fill="#fff"/>`,
    pontinho: (ink) => `<circle class="b-pupil" cx="0" cy="0" r="5.5" fill="${ink}"/>`,
    sonolento: (ink, c) => `<ellipse class="b-pupil" cx="0" cy="1" rx="8" ry="10" fill="${ink}"/><circle cx="2.5" cy="-1" r="2.5" fill="#fff"/><path d="M-11 -2 Q0 -14 11 -2 L11 -13 L-11 -13Z" fill="${c}"/>`
  };

  const ACCESSORIES = {
    none: () => '',
    fone: (c, d) => `<path d="M42 104 C42 52 158 52 158 104" stroke="#2B2522" stroke-width="7" fill="none" stroke-linecap="round"/>
      <rect x="28" y="94" width="20" height="34" rx="9" fill="#2B2522"/><rect x="152" y="94" width="20" height="34" rx="9" fill="#2B2522"/>
      <rect x="32" y="100" width="8" height="22" rx="4" fill="#FF5A6E"/><rect x="160" y="100" width="8" height="22" rx="4" fill="#FF5A6E"/>`,
    bone: () => `<path d="M58 72 C60 42 140 42 142 72Z" fill="#2E6BFF"/><path d="M128 70 Q170 68 172 78 Q150 82 126 78Z" fill="#1E4FCC"/><circle cx="100" cy="46" r="4" fill="#1E4FCC"/>`,
    oculos: () => `<g fill="none" stroke="#2B2522" stroke-width="4"><circle cx="78" cy="102" r="16"/><circle cx="122" cy="102" r="16"/><path d="M94 100 Q100 95 106 100"/></g>`,
    gravata: () => `<path d="M100 160 L80 150 L80 172 Z M100 160 L120 150 L120 172 Z" fill="#E63946"/><circle cx="100" cy="161" r="5" fill="#B71C2C"/>`,
    cachecol: () => `<path d="M48 150 Q100 170 152 150 L152 162 Q100 182 48 162Z" fill="#2A9D8F"/><rect x="124" y="156" width="14" height="28" rx="4" fill="#2A9D8F"/><path d="M126 176 h10 M126 182 h10" stroke="#1F776C" stroke-width="2"/>`,
    coroa: () => `<path d="M70 58 L74 34 L88 48 L100 28 L112 48 L126 34 L130 58Z" fill="#FFC93C" stroke="#E0A800" stroke-width="2"/><circle cx="100" cy="44" r="3.5" fill="#E63946"/>`,
    flor: () => `<g transform="translate(140 64)"><circle r="6" cx="0" cy="-9" fill="#FF8FB1"/><circle r="6" cx="9" cy="0" fill="#FF8FB1"/><circle r="6" cx="0" cy="9" fill="#FF8FB1"/><circle r="6" cx="-9" cy="0" fill="#FF8FB1"/><circle r="5" fill="#FFD166"/></g>`
  };

  function svg(cfg) {
    const c = cfg.color || '#FF8A3D';
    const d = shade(c, -0.22);
    const ink = '#2B2522';
    const shape = SHAPES[cfg.shape] || SHAPES.gota;
    const eye = EYES[cfg.eyes] || EYES.normal;
    const acc = ACCESSORIES[cfg.accessory] || ACCESSORIES.none;
    const fy = 102 + (shape.face || 0);

    return `<svg class="bitu-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse class="b-shadow" cx="100" cy="186" rx="52" ry="7" fill="#000" opacity=".18"/>
  <g class="b-all">
    ${shape.feet ? `<ellipse class="b-foot b-foot-l" cx="76" cy="178" rx="16" ry="9" fill="${d}"/><ellipse class="b-foot b-foot-r" cx="124" cy="178" rx="16" ry="9" fill="${d}"/>` : ''}
    <g class="b-body">
      ${shape.body(c, d)}
      <ellipse cx="74" cy="78" rx="18" ry="10" fill="#fff" opacity=".22" transform="rotate(-24 74 78)"/>
      ${shape.feet !== false ? `<ellipse class="b-arm b-arm-l" cx="36" cy="132" rx="10" ry="15" fill="${d}"/><ellipse class="b-arm b-arm-r" cx="164" cy="132" rx="10" ry="15" fill="${d}"/>` : ''}
      <g class="b-face" transform="translate(0 ${fy - 102})">
        ${cfg.cheeks !== false ? `<ellipse class="b-cheek" cx="62" cy="122" rx="11" ry="7" fill="#FF6B81" opacity=".35"/><ellipse class="b-cheek" cx="138" cy="122" rx="11" ry="7" fill="#FF6B81" opacity=".35"/>` : ''}
        ${shape.whiskers ? `<g stroke="${ink}" stroke-width="2" stroke-linecap="round" opacity=".5"><path d="M44 116 h-16 M46 124 l-15 4"/><path d="M156 116 h16 M154 124 l15 4"/></g>` : ''}
        <g class="b-brows" stroke="${ink}" stroke-width="4" stroke-linecap="round" fill="none">
          <path class="brow-angry" d="M66 80 L88 88 M134 80 L112 88"/>
          <path class="brow-sad" d="M66 88 L86 82 M134 88 L114 82"/>
        </g>
        <g class="b-eyes">
          <g class="b-eye b-eye-l" transform="translate(78 102)"><g class="b-eye-in">${eye(ink, c)}</g></g>
          <g class="b-eye b-eye-r" transform="translate(122 102)"><g class="b-eye-in">${eye(ink, c)}</g></g>
        </g>
        <g class="b-eyes-alt" stroke="${ink}" stroke-width="4.5" stroke-linecap="round" fill="none">
          <path class="eyes-closed" d="M68 104 Q78 110 88 104 M112 104 Q122 110 132 104"/>
          <path class="eyes-happy" d="M68 106 Q78 94 88 106 M112 106 Q122 94 132 106"/>
          <path class="eyes-spiral" d="M78 102 m-1 0 a2 2 0 1 1 3 1 a5 5 0 1 1 -7 -3 a8 8 0 1 1 12 6 M122 102 m-1 0 a2 2 0 1 1 3 1 a5 5 0 1 1 -7 -3 a8 8 0 1 1 12 6" stroke-width="3"/>
          <g class="eyes-heart" stroke="none" fill="#FF3B5C"><path d="M78 112 l-11 -11 a6.5 6.5 0 0 1 11 -7 a6.5 6.5 0 0 1 11 7z"/><path d="M122 112 l-11 -11 a6.5 6.5 0 0 1 11 -7 a6.5 6.5 0 0 1 11 7z"/></g>
          <g class="eyes-shades" stroke="none"><path d="M60 94 h80 v6 q-2 18 -18 18 q-16 0 -18 -14 h-8 q-2 14 -18 14 q-16 0 -18 -18z" fill="#141010"/><path d="M68 98 l8 0 l-6 8z" fill="#fff" opacity=".5"/></g>
        </g>
        <g class="b-mouth" fill="${ink}" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round">
          <path class="m-smile" d="M88 126 Q100 137 112 126" fill="none" stroke-width="4.5"/>
          <path class="m-open" d="M86 124 Q100 124 114 124 Q112 142 100 142 Q88 142 86 124Z" stroke-width="2"/>
          <path class="m-open-tongue" d="M92 136 Q100 131 108 136 Q106 141 100 141 Q94 141 92 136Z" fill="#FF6B81" stroke="none"/>
          <ellipse class="m-o" cx="100" cy="131" rx="7" ry="9" stroke-width="1"/>
          <path class="m-sad" d="M88 134 Q100 124 112 134" fill="none" stroke-width="4.5"/>
          <path class="m-flat" d="M90 130 L110 130" fill="none" stroke-width="4.5"/>
          <path class="m-cat" d="M86 126 Q93 134 100 126 Q107 134 114 126" fill="none" stroke-width="4"/>
        </g>
        <path class="b-tear" d="M134 112 q-5 9 0 12 q5 -3 0 -12z" fill="#5BC0EB"/>
      </g>
      <g class="b-acc">${acc(c, d)}</g>
      <g class="b-props">
        <g class="prop-coffee" transform="translate(150 128)"><rect x="-12" y="-6" width="22" height="22" rx="4" fill="#fff" stroke="${ink}" stroke-width="3"/><path d="M10 0 q9 0 9 7 q0 7 -9 7" fill="none" stroke="${ink}" stroke-width="3"/><path d="M-6 -12 q-3 -6 2 -10 M2 -12 q-3 -6 2 -10" stroke="#bbb" stroke-width="2.5" fill="none" class="steam"/></g>
        <g class="prop-party" transform="translate(100 36)"><path d="M-16 14 L0 -26 L16 14Z" fill="#7B61FF"/><circle cx="0" cy="-28" r="5" fill="#FFD166"/><path d="M-10 0 L10 0 M-6 -10 L6 -10" stroke="#FFD166" stroke-width="3"/></g>
      </g>
    </g>
  </g>
</svg>`;
  }

  const OPTIONS = {
    shapes: ['gota', 'bolinha', 'robo', 'fantasminha', 'gatinho'],
    eyes: ['normal', 'brilhante', 'pontinho', 'sonolento'],
    accessories: ['none', 'fone', 'bone', 'oculos', 'gravata', 'cachecol', 'coroa', 'flor'],
    colors: ['#FF8A3D', '#FFC93C', '#7BD389', '#2EC4B6', '#5BA8FF', '#8E7CFF', '#FF7EB6', '#F25F5C', '#B8B8C6', '#3D3A4B']
  };

  const LABELS = {
    'pt-BR': { gota: 'Gotinha', bolinha: 'Bolinha', robo: 'Robozinho', fantasminha: 'Fantasminha', gatinho: 'Gatinho', normal: 'Normal', brilhante: 'Brilhantes', pontinho: 'Pontinho', sonolento: 'Sonolento', none: 'Nenhum', fone: 'Fone', bone: 'Boné', oculos: 'Óculos', gravata: 'Gravatinha', cachecol: 'Cachecol', coroa: 'Coroa', flor: 'Florzinha' },
    en: { gota: 'Droplet', bolinha: 'Ball', robo: 'Robot', fantasminha: 'Ghost', gatinho: 'Kitty', normal: 'Normal', brilhante: 'Sparkly', pontinho: 'Dots', sonolento: 'Sleepy', none: 'None', fone: 'Headphones', bone: 'Cap', oculos: 'Glasses', gravata: 'Bow tie', cachecol: 'Scarf', coroa: 'Crown', flor: 'Flower' },
    es: { gota: 'Gotita', bolinha: 'Bolita', robo: 'Robotito', fantasminha: 'Fantasmita', gatinho: 'Gatito', normal: 'Normal', brilhante: 'Brillantes', pontinho: 'Puntitos', sonolento: 'Dormilón', none: 'Ninguno', fone: 'Audífonos', bone: 'Gorra', oculos: 'Lentes', gravata: 'Moñito', cachecol: 'Bufanda', coroa: 'Corona', flor: 'Florcita' }
  };

  function label(lang, key) { return (LABELS[lang] || LABELS['pt-BR'])[key] || key; }

  /** Monta o avatar dentro de um elemento. Retorna função para trocar de "estado" (para pacotes animados). */
  function mount(el, avatarCfg) {
    const cfg = avatarCfg || {};
    el.classList.add('bitu-avatar');
    el.dataset.kind = cfg.kind || 'builtin';
    if (cfg.kind === 'image' && cfg.file) {
      el.innerHTML = `<img class="bitu-img" draggable="false" alt="" src="bitu-asset://avatar/${encodeURIComponent(cfg.file)}">`;
      return () => {};
    }
    if (cfg.kind === 'pack' && cfg.packDir && cfg.manifest) {
      const states = cfg.manifest.states || {};
      const src = (state) => {
        const f = states[state] || states.idle || Object.values(states)[0];
        return `bitu-asset://avatar/${encodeURIComponent(cfg.packDir)}/${encodeURIComponent(f)}`;
      };
      el.innerHTML = `<img class="bitu-img" draggable="false" alt="" src="${src('idle')}">`;
      const img = el.querySelector('img');
      let current = 'idle';
      return (state) => {
        const s = states[state] ? state : 'idle';
        if (s !== current) { current = s; img.src = src(s); }
      };
    }
    el.innerHTML = svg(cfg);
    return () => {};
  }

  root.BituAvatar = { svg, mount, OPTIONS, label, shade };
})(typeof self !== 'undefined' ? self : this);
