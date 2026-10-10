/* =============================================================================
 * SEMOB/DF · Painel operacional (Business Text, afterRender)
 *
 * Consultas:
 *   A  Infinity  camada semob:ultima_posicao (GeoJSON WFS 2.0)
 *   B  Zabbix    itens "Operadora [id - nome]: ..." (tradução dos códigos e séries por empresa)
 *   C  Zabbix    itens "Posições: ..." (tendência e qualidade do feed)
 *   D  Zabbix    itens "Frota..." (cadastro de veículos)
 *   E  Zabbix    itens "Camada [...]: registros" (catálogo WFS)
 *   F  Zabbix    itens do cenário web (disponibilidade do GeoServer)
 *   G  Zabbix    problemas ativos do host
 *
 * Abas: Mapa, Empresas, Linhas, Qualidade, Cadastros e Problemas. Troca por JS, sem recarregar.
 * Tema claro fixo. Cores das empresas conforme identidade visual das bacias do DF.
 * Pessoas físicas (permissionários do STPCR) não são identificadas: entram em "Outros".
 * ===========================================================================*/
const root = context.element;
const rv = context.grafana.replaceVariables;
const series = (context.panelData && context.panelData.series) || [];
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
const OTHERS = 'Outros';

/* Todo o corpo roda dentro de try: uma falha mostra a causa no painel, nunca uma área vazia. */
try {

  /* ---------------------------------------------------------------- utilitários */
  const vals = (f) => (f ? (f.values && f.values.toArray ? f.values.toArray() : Array.from(f.values || [])) : []);
  const num = (v) => {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    const s = String(v === null || v === undefined ? '' : v).trim().replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  };
  const txt = (v) => String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const fmt = (n, d = 0) => (isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
  const pct = (a, b) => (b > 0 ? (a * 100) / b : 0);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const quant = (a, q) => {
    if (!a.length) return NaN;
    const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  const age = (s) => {
    if (!isFinite(s)) return '–';
    if (s < 60) return Math.round(s) + ' s';
    if (s < 3600) return Math.round(s / 60) + ' min';
    if (s < 86400) return (s / 3600).toFixed(1).replace('.', ',') + ' h';
    return Math.round(s / 86400) + ' d';
  };
  const ROSE = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const rose = (d) => ROSE[Math.round((((d % 360) + 360) % 360) / 45) % 8];
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const svg = (tag, attrs, parent) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
  };
  const svgText = (parent, x, y, s, cls, anchor) => {
    const t = svg('text', { x, y, class: cls || 'v-lab', 'text-anchor': anchor || 'middle' }, parent);
    t.textContent = s;
    return t;
  };
  /* ícones de linha única, desenhados com path (sem fonte de ícone nem emoji) */
  const ICON = {
    bus: 'M5 17V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11M5 17h14M5 17v2M19 17v2M6 9h12M8 13h.01M16 13h.01',
    route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM16 7H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H8',
    speed: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm1.5-2.5L17 8M4 19a9 9 0 1 1 16 0',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
    signal: 'M4 18v-4M9 18v-8M14 18V6M19 18v-11',
    alert: 'M12 9v4M12 17h.01M10.3 4l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z',
    pin: 'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11ZM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    grid: 'M4 6h16M4 12h16M4 18h16M8 4v16M16 4v16',
  };
  const icon = (name, cls) => {
    const s = svg('svg', { viewBox: '0 0 24 24', class: 'ic ' + (cls || ''), 'aria-hidden': 'true' });
    svg('path', { d: ICON[name], fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s);
    return s;
  };

  /* ------------------------------------------------- empresas e cores oficiais */
  const C = { PIRACICABANA: '#2E9E44', PIONEIRA: '#F2C200', URBI: '#1F6FD1', MARECHAL: '#FF7F11', 'SÃO JOSÉ': '#5C3317', COOBRATAETE: '#9E9E9E' };
  const C_OTHERS = '#D62828';
  const names = {};
  series.forEach((s) => {
    const c = [s.name];
    (s.fields || []).forEach((f) => {
      c.push(f.name, f.config && f.config.displayNameFromDS, f.config && f.config.displayName);
      if (f.labels) c.push(Object.values(f.labels).join(' '));
    });
    c.forEach((v) => {
      const m = /Operadora \[(\S+) - ([^\]]+)\]/.exec(v || '');
      if (m) names[m[1]] = m[2].trim();
    });
  });
  const short = (n) => (n.replace(/^(AUTO VIAÇÃO|VIAÇÃO|EXPRESSO)\s+/i, '').split(/\s+-\s+|\s+BACIA/i)[0] || n).trim();
  const groupOf = (id) => {
    const full = names[id];
    if (!full) return { key: OTHERS, name: OTHERS, full: 'Permissionários do STPCR e códigos sem nome', color: C_OTHERS, bacia: '' };
    const b = /BACIA\s*-?\s*0?(\d)/i.exec(full);
    const label = short(full);
    const color = Object.keys(C).find((k) => full.toUpperCase().indexOf(k) >= 0);
    return { key: id, name: label, full, color: color ? C[color] : '#6B47B8', bacia: b ? b[1] : '' };
  };

  /* ------------------------------------------------------------- dados de GPS */
  const gps = series.find((s) => (s.fields || []).some((f) => f.name === 'latitude'));
  const col = (n) => vals(gps && gps.fields.find((f) => f.name === n));
  const now = Date.now();
  const janela = parseInt(rv('${janela}'), 10) || 300;
  const rows = [];
  if (gps) {
    const id = col('id_operadora'), pf = col('prefixo'), ln = col('cd_linha'), vl = col('velocidade'),
      dr = col('direcao'), la = col('latitude'), lo = col('longitude'), ts = col('dataregistro');
    for (let i = 0; i < la.length; i++) {
      const t = ts[i] instanceof Date ? ts[i].getTime() : (typeof ts[i] === 'number' ? ts[i] : Date.parse(ts[i]));
      const y = num(la[i]), x = num(lo[i]);
      const key = id[i] === null || id[i] === undefined || id[i] === '' ? 'desconhecida' : String(id[i]);
      rows.push({
        g: groupOf(key), prefixo: txt(pf[i]), linha: txt(ln[i]), vel: num(vl[i]), dir: num(dr[i]), lat: y, lon: x,
        t, idade: isFinite(t) ? (now - t) / 1000 : NaN,
        okc: isFinite(y) && isFinite(x) && Math.abs(y) <= 90 && Math.abs(x) <= 180 && !(y === 0 && x === 0),
      });
    }
  }
  const live = rows.filter((r) => r.okc && r.idade <= janela && r.idade >= -120);
  const mov = live.filter((r) => r.vel > 0);
  const speeds = mov.map((r) => r.vel);
  const semLinha = live.filter((r) => !r.linha).length;
  const mudos = rows.filter((r) => r.idade > 86400).length;
  const semCoord = rows.filter((r) => !r.okc).length;

  /* agrupamentos */
  const G = {};
  live.forEach((r) => {
    const g = G[r.g.key] || (G[r.g.key] = Object.assign({}, r.g, { n: 0, mov: 0, sp: [], linhas: {}, semLinha: 0, idades: [] }));
    g.n++; g.idades.push(r.idade);
    if (r.vel > 0) { g.mov++; g.sp.push(r.vel); }
    if (r.linha) g.linhas[r.linha] = 1; else g.semLinha++;
  });
  const empresas = Object.values(G).sort((a, b) => (a.key === OTHERS) - (b.key === OTHERS) || b.n - a.n);
  const L = {};
  live.forEach((r) => {
    if (!r.linha) return;
    const l = L[r.linha] || (L[r.linha] = { k: r.linha, n: 0, mov: 0, sp: [], ops: {}, idades: [] });
    l.n++; l.idades.push(r.idade); l.ops[r.g.key] = (l.ops[r.g.key] || 0) + 1;
    if (r.vel > 0) { l.mov++; l.sp.push(r.vel); }
  });
  const linhas = Object.values(L).sort((a, b) => b.n - a.n);

  /* ------------------------------------------------------------------ layout */
  root.innerHTML = '';
  const app = el('div', 'sm');
  root.appendChild(app);

  const head = el('div', 'sm-head');
  const brand = el('div', 'sm-brand');
  const logo = el('img', 'sm-logo');
  logo.src = "__LOGO_GDF_DATA_URI__";
  logo.alt = 'Governo do Distrito Federal';
  logo.width = 56; logo.height = 56;
  brand.appendChild(logo);
  const h = el('div');
  h.appendChild(el('p', 'sm-org', 'SEMOB-DF'));
  h.appendChild(el('h1', '', 'Frota em circulação'));
  h.appendChild(el('p', '', gps
    ? `${fmt(rows.length)} veículos na base da SEMOB · ${fmt(live.length)} com sinal nos últimos ${age(janela)}`
    : 'Sem dados de posição. Verifique a consulta A (Infinity) no inspetor de consultas.'));
  brand.appendChild(h);
  head.appendChild(brand);
  const stamp = el('div', 'sm-stamp');
  stamp.appendChild(icon('clock'));
  stamp.appendChild(el('span', '', 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR')));
  head.appendChild(stamp);
  app.appendChild(head);

  /* ---------------------------------------------- séries numéricas do Zabbix */
  const zbx = [];
  series.forEach((fr) => {
    (fr.fields || []).forEach((f) => {
      if (f.type !== 'number') return;
      const nm = (f.config && (f.config.displayNameFromDS || f.config.displayName)) || fr.name || f.name;
      const v = vals(f).filter((x) => typeof x === 'number');
      if (nm && v.length) zbx.push({ name: String(nm), v, last: v[v.length - 1] });
    });
  });
  const zall = (re) => zbx.filter((s) => re.test(s.name));
  const zone = (re) => zall(re)[0] || null;
  const zlast = (re) => { const s = zone(re); return s ? s.last : NaN; };
  const zser = (re) => { const s = zone(re); return s ? s.v : []; };

  /* problemas ativos (frame com um campo de objetos) */
  let problems = [];
  series.forEach((fr) => (fr.fields || []).forEach((f) => {
    if (f.type === 'other' || (f.config && f.config.custom && f.config.custom.type === 'problems')) {
      vals(f).forEach((p) => { if (p && typeof p === 'object' && (p.name || p.description)) problems.push(p); });
    }
  }));
  const sparkline = (arr, color) => {
    if (arr.length < 2) return null;
    const w = 150, hh = 30, mn = Math.min(...arr), mx = Math.max(...arr), r = mx - mn || 1;
    const pt = arr.map((v, i) => [(i * w) / (arr.length - 1), hh - ((v - mn) / r) * (hh - 5) - 2]);
    const s = svg('svg', { viewBox: `0 0 ${w} ${hh}`, class: 'sm-spark', preserveAspectRatio: 'none' });
    svg('polygon', { points: `0,${hh} ${pt.map((p) => p.join(',')).join(' ')} ${w},${hh}`, fill: color, 'fill-opacity': .12 }, s);
    svg('polyline', { points: pt.map((p) => p.join(',')).join(' '), fill: 'none', stroke: color, 'stroke-width': 1.8 }, s);
    return s;
  };
  const kpis = el('div', 'sm-kpis');
  app.appendChild(kpis);
  const kpi = (ic, label, value, hint, color, arr) => {
    const k = el('article', 'sm-kpi');
    k.style.setProperty('--a', color);
    const top = el('div', 'sm-kpi-top');
    top.appendChild(icon(ic));
    top.appendChild(el('span', '', label));
    k.appendChild(top);
    k.appendChild(el('strong', '', value));
    k.appendChild(el('span', 'sm-kpi-h', hint));
    const sp = arr && sparkline(arr, color);
    if (sp) k.appendChild(sp);
    kpis.appendChild(k);
  };
  kpi('pin', 'Veículos com sinal', fmt(live.length), `${fmt(pct(live.length, rows.length), 1)}% da base`, '#1F6FD1', zser(/veículos com registro recente$/));
  kpi('bus', 'Em movimento', fmt(mov.length), `${fmt(live.length - mov.length)} parados`, '#2E9E44', zser(/recentes em movimento$/));
  kpi('speed', 'Velocidade média', `${fmt(mean(speeds), 1)} km/h`, `mediana ${fmt(quant(speeds, .5), 1)} · p90 ${fmt(quant(speeds, .9), 1)}`, '#FF7F11');
  kpi('route', 'Linhas em operação', fmt(linhas.length), `${fmt(semLinha)} veículos sem linha`, '#6B47B8');
  kpi('signal', 'Atraso do sinal', age(quant(live.map((r) => r.idade), .5)), `p90 ${age(quant(live.map((r) => r.idade), .9))}`, '#0E7C7B', zser(/idade do registro mais recente$/));
  kpi('alert', 'Sem transmitir 24 h', fmt(mudos), `${fmt(pct(mudos, rows.length), 1)}% da base`, '#D62828');

  /* abas */
  const TABS = [['mapa', 'Mapa da frota', 'pin'], ['empresas', 'Empresas', 'bus'], ['linhas', 'Linhas', 'route'],
    ['qualidade', 'Qualidade e disponibilidade', 'signal'], ['cadastros', 'Cadastros', 'grid'],
    ['problemas', 'Problemas' + (problems.length ? ' (' + problems.length + ')' : ''), 'alert']];
  const tabbar = el('div', 'sm-tabs');
  tabbar.setAttribute('role', 'tablist');
  app.appendChild(tabbar);
  const panes = {};
  const btns = {};
  const stage = el('div', 'sm-stage');
  app.appendChild(stage);
  let active = window.__smTab && TABS.some((t) => t[0] === window.__smTab) ? window.__smTab : 'mapa';
  const show = (id) => {
    active = window.__smTab = id;
    TABS.forEach(([k]) => {
      btns[k].classList.toggle('on', k === id);
      btns[k].setAttribute('aria-selected', k === id ? 'true' : 'false');
      btns[k].tabIndex = k === id ? 0 : -1;
      panes[k].hidden = k !== id;
    });
    if (id === 'mapa' && window.__smMap) setTimeout(() => window.__smMap.invalidateSize(), 30);
  };
  TABS.forEach(([k, label, ic]) => {
    const b = el('button', 'sm-tab');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.appendChild(icon(ic));
    b.appendChild(el('span', '', label));
    b.onclick = () => show(k);
    b.onkeydown = (e) => {
      const i = TABS.findIndex(([x]) => x === active);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
        show(n); btns[n].focus(); e.preventDefault();
      }
    };
    btns[k] = b;
    tabbar.appendChild(b);
    const pane = el('section', 'sm-pane');
    pane.setAttribute('role', 'tabpanel');
    panes[k] = pane;
    stage.appendChild(pane);
  });

  /* ----------------------------------------------------------- aba 1: o mapa */
  const mapPane = panes.mapa;
  const mapWrap = el('div', 'sm-mapwrap');
  mapPane.appendChild(mapWrap);
  const mapBox = el('div', 'sm-map');
  mapWrap.appendChild(mapBox);
  const aside = el('aside', 'sm-aside');
  mapWrap.appendChild(aside);

  const searchRow = el('div', 'sm-search');
  searchRow.appendChild(icon('route'));
  const input = el('input');
  input.type = 'search';
  input.placeholder = 'Linha ou prefixo do veículo';
  input.setAttribute('aria-label', 'Buscar linha ou prefixo do veículo');
  searchRow.appendChild(input);
  aside.appendChild(searchRow);
  const searchMsg = el('p', 'sm-msg');
  aside.appendChild(searchMsg);

  /* busca ligada no primeiro render: funciona mesmo antes de o mapa carregar */
  const matches = (q) => live.filter((r) => r.linha.toLowerCase().indexOf(q) === 0 || r.prefixo.toLowerCase() === q);
  let onSearch = null;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const hit = q ? matches(q) : [];
    const ls = [...new Set(hit.map((r) => r.linha).filter(Boolean))].sort();
    searchMsg.textContent = q
      ? (hit.length
        ? `${hit.length} veículo${hit.length > 1 ? 's' : ''}`
          + (ls.length === 1 ? ` na linha ${ls[0]}` : ls.length > 1 ? ` em ${ls.length} linhas: ${ls.slice(0, 4).join(', ')}${ls.length > 4 ? ' e outras ' + (ls.length - 4) : ''}` : '')
          + '. Só eles aparecem no mapa até limpar a busca.'
        : 'Nada encontrado com sinal recente')
      : '';
    searchRow.classList.toggle('on', !!q);
    if (onSearch) onSearch(hit);
  });

  const legend = el('div', 'sm-legend');
  const legendHead = el('div', 'sm-legend-h');
  legendHead.appendChild(el('h2', '', 'Empresas no mapa'));
  legendHead.appendChild(el('p', 'sm-hint', 'Clique para mostrar ou ocultar. Duplo clique enquadra.'));
  legend.appendChild(legendHead);
  const legendList = el('div', 'sm-legend-list');
  legend.appendChild(legendList);
  aside.appendChild(legend);
  const hidden = window.__smHidden || (window.__smHidden = {});
  const maxN = Math.max(1, ...empresas.map((e) => e.n));
  const cards = {};
  empresas.forEach((e) => {
    const c = el('button', 'sm-emp' + (hidden[e.key] ? ' off' : ''));
    c.type = 'button';
    c.style.setProperty('--a', e.color);
    c.title = e.full;
    const t = el('div', 'sm-emp-t');
    t.appendChild(el('i', 'sm-chip'));
    t.appendChild(el('span', 'sm-emp-n', e.name));
    if (e.bacia) t.appendChild(el('span', 'sm-bacia', 'Bacia ' + e.bacia));
    t.appendChild(el('b', 'sm-emp-v', fmt(e.n)));
    c.appendChild(t);
    const bar = el('div', 'sm-track');
    const f1 = el('i', 'sm-fill');
    f1.style.width = pct(e.n, maxN) + '%';
    const f2 = el('i', 'sm-fill-m');
    f2.style.width = pct(e.mov, maxN) + '%';
    bar.appendChild(f1); bar.appendChild(f2);
    c.appendChild(bar);
    const st = el('div', 'sm-emp-s');
    [[fmt(pct(e.mov, e.n), 0) + '%', 'rodando'], [fmt(mean(e.sp), 0) + ' km/h', 'média'],
     [fmt(Object.keys(e.linhas).length), 'linhas'], [age(quant(e.idades, .5)), 'sinal']].forEach(([v, l]) => {
      const d = el('div');
      d.appendChild(el('b', '', v));
      d.appendChild(el('span', '', l));
      st.appendChild(d);
    });
    c.appendChild(st);
    cards[e.key] = c;
    legendList.appendChild(c);
  });

  /* ------------------------------------------------------- aba 2: empresas */
  const empPane = panes.empresas;
  const empGrid = el('div', 'sm-grid2');
  empPane.appendChild(empGrid);

  const card = (host, title, sub) => {
    const c = el('section', 'sm-card');
    const hd = el('header');
    hd.appendChild(el('h2', '', title));
    if (sub) hd.appendChild(el('p', '', sub));
    c.appendChild(hd);
    host.appendChild(c);
    return c;
  };

  /* rosca: participação de cada empresa nos veículos em circulação */
  (() => {
    const c = card(empGrid, 'Participação na frota em circulação', 'Veículos com sinal recente, por empresa');
    const wrap = el('div', 'sm-donut-wrap');
    c.appendChild(wrap);
    const S = 240, cx = S / 2, cy = S / 2, R = 104, r0 = 64;
    const s = svg('svg', { viewBox: `0 0 ${S} ${S}`, class: 'sm-donut' });
    const total = live.length || 1;
    let a0 = -Math.PI / 2;
    const center = svg('g', {}, s);
    const big = svgText(center, cx, cy - 2, fmt(live.length), 'd-big');
    const small = svgText(center, cx, cy + 18, 'veículos', 'd-small');
    empresas.forEach((e) => {
      const ang = (e.n / total) * Math.PI * 2, a1 = a0 + ang;
      const p = (rr, a) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
      const [x1, y1] = p(R, a0), [x2, y2] = p(R, a1), [x3, y3] = p(r0, a1), [x4, y4] = p(r0, a0);
      const path = svg('path', {
        d: `M${x1},${y1}A${R},${R} 0 ${ang > Math.PI ? 1 : 0} 1 ${x2},${y2}L${x3},${y3}A${r0},${r0} 0 ${ang > Math.PI ? 1 : 0} 0 ${x4},${y4}Z`,
        fill: e.color, class: 'd-arc',
      }, s);
      path.addEventListener('mouseenter', () => { big.textContent = fmt(e.n); small.textContent = e.name; });
      path.addEventListener('mouseleave', () => { big.textContent = fmt(live.length); small.textContent = 'veículos'; });
      svg('title', {}, path).textContent = `${e.full}: ${fmt(e.n)} veículos (${fmt(pct(e.n, total), 1)}%)`;
      a0 = a1;
    });
    s.appendChild(center);
    wrap.appendChild(s);
    const lg = el('ul', 'sm-dlg');
    empresas.forEach((e) => {
      const li = el('li');
      const i = el('i');
      i.style.background = e.color;
      li.appendChild(i);
      li.appendChild(el('span', 'n', e.name));
      li.appendChild(el('b', '', fmt(pct(e.n, total), 1) + '%'));
      lg.appendChild(li);
    });
    wrap.appendChild(lg);
  })();

  /* radar: perfil operacional comparado, normalizado de 0 a 100 */
  (() => {
    const c = card(empGrid, 'Perfil operacional comparado', 'Cada eixo normalizado pelo melhor valor entre as empresas');
    const AX = [
      ['Frota ativa', (e) => e.n],
      ['Em movimento', (e) => pct(e.mov, e.n)],
      ['Velocidade', (e) => mean(e.sp) || 0],
      ['Cobertura de linhas', (e) => Object.keys(e.linhas).length],
      ['Sinal recente', (e) => 100 - pct(quant(e.idades, .5), janela)],
      ['Linha informada', (e) => 100 - pct(e.semLinha, e.n)],
    ];
    const show3 = empresas.filter((e) => e.key !== OTHERS).slice(0, 5);
    const S = 300, cx = S / 2, cy = S / 2 + 6, R = 104;
    const s = svg('svg', { viewBox: `0 0 ${S} ${S}`, class: 'sm-radar' });
    const maxv = AX.map(([, f]) => Math.max(...show3.map((e) => f(e) || 0), 1));
    [.25, .5, .75, 1].forEach((k) => {
      svg('polygon', {
        points: AX.map((_, i) => {
          const a = (i / AX.length) * Math.PI * 2 - Math.PI / 2;
          return `${cx + R * k * Math.cos(a)},${cy + R * k * Math.sin(a)}`;
        }).join(' '), class: 'r-grid',
      }, s);
    });
    AX.forEach(([label], i) => {
      const a = (i / AX.length) * Math.PI * 2 - Math.PI / 2;
      svg('line', { x1: cx, y1: cy, x2: cx + R * Math.cos(a), y2: cy + R * Math.sin(a), class: 'r-grid' }, s);
      const lx = cx + (R + 24) * Math.cos(a), ly = cy + (R + 24) * Math.sin(a);
      svgText(s, lx, ly + 4, label, 'r-lab', Math.abs(Math.cos(a)) < .3 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end'));
    });
    show3.forEach((e) => {
      const pts = AX.map(([, f], i) => {
        const a = (i / AX.length) * Math.PI * 2 - Math.PI / 2, k = Math.max(0, Math.min(1, (f(e) || 0) / maxv[i]));
        return `${cx + R * k * Math.cos(a)},${cy + R * k * Math.sin(a)}`;
      }).join(' ');
      svg('polygon', { points: pts, fill: e.color, 'fill-opacity': .1, stroke: e.color, 'stroke-width': 2, class: 'r-area' }, s);
    });
    c.appendChild(s);
    const lg = el('ul', 'sm-rlg');
    show3.forEach((e) => {
      const li = el('li');
      const i = el('i');
      i.style.background = e.color;
      li.appendChild(i);
      li.appendChild(el('span', '', e.name));
      lg.appendChild(li);
    });
    c.appendChild(lg);
  })();

  /* tabela operacional por empresa */
  (() => {
    const c = card(empPane, 'Quadro operacional por empresa', 'Ordenado por veículos em circulação. Clique no cabeçalho para reordenar.');
    c.classList.add('sm-wide');
    const COLS = [
      ['Empresa', (e) => e, 'emp'], ['Bacia', (e) => e.bacia || '–', 'c'], ['No mapa', (e) => e.n, 'n'],
      ['Rodando', (e) => e.mov, 'n'], ['% rodando', (e) => pct(e.mov, e.n), 'n1'], ['Km/h médio', (e) => mean(e.sp) || 0, 'n1'],
      ['Km/h p90', (e) => quant(e.sp, .9) || 0, 'n1'], ['Linhas', (e) => Object.keys(e.linhas).length, 'n'],
      ['Sem linha', (e) => e.semLinha, 'n'], ['Sinal mediano', (e) => quant(e.idades, .5), 'age'],
    ];
    const tb = el('table', 'sm-table');
    const thead = el('thead');
    const trh = el('tr');
    COLS.forEach(([name, , kind], i) => {
      const th = el('th', kind === 'emp' || kind === 'c' ? '' : 'num');
      const b = el('button', '', name);
      b.type = 'button';
      b.onclick = () => sort(i);
      th.appendChild(b);
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    tb.appendChild(thead);
    const tbody = el('tbody');
    tb.appendChild(tbody);
    c.appendChild(tb);
    let sortIdx = 2, desc = true;
    const render = () => {
      tbody.innerHTML = '';
      const data = empresas.slice().sort((a, b) => {
        const va = COLS[sortIdx][1](a), vb = COLS[sortIdx][1](b);
        const x = typeof va === 'object' ? va.name.localeCompare(vb.name) : (num(va) - num(vb) || 0);
        return desc ? -x : x;
      });
      data.forEach((e) => {
        const tr = el('tr');
        COLS.forEach(([, f, kind]) => {
          const v = f(e);
          const td = el('td', kind === 'emp' || kind === 'c' ? '' : 'num');
          if (kind === 'emp') {
            const i = el('i', 'sm-chip');
            i.style.setProperty('--a', e.color);
            td.appendChild(i);
            td.appendChild(el('span', '', e.name));
            td.title = e.full;
          } else td.textContent = kind === 'age' ? age(v) : (kind === 'n1' ? fmt(v, 1) : (typeof v === 'number' ? fmt(v) : v));
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      [...thead.querySelectorAll('th')].forEach((th, i) => th.setAttribute('aria-sort', i === sortIdx ? (desc ? 'descending' : 'ascending') : 'none'));
    };
    const sort = (i) => { desc = i === sortIdx ? !desc : true; sortIdx = i; render(); };
    render();
  })();

  /* ---------------------------------------------------------- aba 3: linhas */
  (() => {
    const pane = panes.linhas;
    const grid = el('div', 'sm-grid2');
    pane.appendChild(grid);
    /* barras: linhas com mais veículos */
    const c1 = card(grid, 'Linhas com mais veículos', 'Top 14 entre os veículos com sinal recente');
    const list = el('div', 'sm-bars');
    const top = linhas.slice(0, 14);
    const mx = Math.max(1, ...top.map((l) => l.n));
    top.forEach((l) => {
      const dom = Object.keys(l.ops).sort((a, b) => l.ops[b] - l.ops[a])[0];
      const g = G[dom] || { color: C_OTHERS, name: OTHERS };
      const b = el('button', 'sm-barrow');
      b.type = 'button';
      b.title = `${l.n} veículos · ${l.mov} rodando · ${g.name}`;
      b.appendChild(el('span', 'k', l.k));
      const tr = el('span', 'tr');
      const f = el('i');
      f.style.width = pct(l.n, mx) + '%';
      f.style.background = g.color;
      tr.appendChild(f);
      b.appendChild(tr);
      b.appendChild(el('span', 'v', fmt(l.n)));
      b.onclick = () => { show('mapa'); input.value = l.k; input.dispatchEvent(new Event('input')); };
      list.appendChild(b);
    });
    c1.appendChild(list);

    /* dispersão: veículos x velocidade média da linha */
    const c2 = card(grid, 'Velocidade por tamanho da linha', 'Cada ponto é uma linha. Cor da empresa com mais veículos nela.');
    const W = 320, H = 240, pad = 38;
    const s = svg('viewBox' in {} ? 'svg' : 'svg', { viewBox: `0 0 ${W} ${H}`, class: 'sm-scatter' });
    const pts = linhas.filter((l) => l.sp.length);
    const mxn = Math.max(1, ...pts.map((l) => l.n)), mxv = Math.max(10, ...pts.map((l) => mean(l.sp)));
    [0, .25, .5, .75, 1].forEach((k) => {
      const y = H - pad - k * (H - pad - 14);
      svg('line', { x1: pad, y1: y, x2: W - 6, y2: y, class: 'r-grid' }, s);
      svgText(s, pad - 6, y + 3, fmt(mxv * k, 0), 'v-lab', 'end');
    });
    pts.forEach((l) => {
      const dom = Object.keys(l.ops).sort((a, b) => l.ops[b] - l.ops[a])[0];
      const g = G[dom] || { color: C_OTHERS, name: OTHERS };
      const cxp = pad + (l.n / mxn) * (W - pad - 10), cyp = H - pad - (mean(l.sp) / mxv) * (H - pad - 14);
      const cc = svg('circle', { cx: cxp, cy: cyp, r: 4, fill: g.color, 'fill-opacity': .65, class: 'sc-dot' }, s);
      svg('title', {}, cc).textContent = `Linha ${l.k}: ${l.n} veículos, ${fmt(mean(l.sp), 1)} km/h · ${g.name}`;
    });
    svgText(s, (W + pad) / 2, H - 6, 'veículos na linha', 'v-lab');
    svgText(s, pad + 4, 9, 'km/h', 'v-lab', 'start');
    c2.appendChild(s);

    /* tabela de linhas */
    const c3 = card(pane, 'Linhas em operação', `${fmt(linhas.length)} linhas com veículo transmitindo. Clique numa linha para vê-la no mapa.`);
    c3.classList.add('sm-wide');
    const tb = el('table', 'sm-table');
    const thr = el('tr');
    ['Linha', 'Empresa predominante', 'Veículos', 'Rodando', 'Km/h médio', 'Sinal mediano'].forEach((n, i) => {
      const th = el('th', i >= 2 ? 'num' : '', n);
      thr.appendChild(th);
    });
    const thead = el('thead');
    thead.appendChild(thr);
    tb.appendChild(thead);
    const tbody = el('tbody');
    linhas.slice(0, 60).forEach((l) => {
      const dom = Object.keys(l.ops).sort((a, b) => l.ops[b] - l.ops[a])[0];
      const g = G[dom] || { color: C_OTHERS, name: OTHERS, full: OTHERS };
      const tr = el('tr', 'click');
      tr.tabIndex = 0;
      const open = () => { show('mapa'); input.value = l.k; input.dispatchEvent(new Event('input')); };
      tr.onclick = open;
      tr.onkeydown = (ev) => { if (ev.key === 'Enter') open(); };
      const td0 = el('td');
      td0.appendChild(el('b', '', l.k));
      tr.appendChild(td0);
      const td1 = el('td');
      const chip = el('i', 'sm-chip');
      chip.style.setProperty('--a', g.color);
      td1.appendChild(chip);
      td1.appendChild(el('span', '', g.name));
      td1.title = g.full;
      tr.appendChild(td1);
      [fmt(l.n), fmt(l.mov), fmt(mean(l.sp) || 0, 1), age(quant(l.idades, .5))].forEach((v) => tr.appendChild(el('td', 'num', v)));
      tbody.appendChild(tr);
    });
    tb.appendChild(tbody);
    c3.appendChild(tb);
    if (linhas.length > 60) c3.appendChild(el('p', 'sm-hint', `Mostrando as 60 linhas com mais veículos de ${fmt(linhas.length)}.`));
  })();

  /* ------------------------------------------------------- aba 4: qualidade */
  (() => {
    const pane = panes.qualidade;
    const grid = el('div', 'sm-grid3');
    pane.appendChild(grid);
    const bars = (host, items) => {
      const W = 320, H = 180, pad = 26, bw = (W - 12) / items.length;
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sm-cols' });
      const mx = Math.max(1, ...items.map((i) => i.v));
      items.forEach((it, i) => {
        const hh = ((H - pad - 20) * it.v) / mx, x = 6 + i * bw;
        const r = svg('rect', { x: x + 4, y: H - pad - hh, width: bw - 8, height: Math.max(hh, 1), rx: 4, fill: it.color }, s);
        svg('title', {}, r).textContent = `${it.l}: ${fmt(it.v)}`;
        svgText(s, x + bw / 2, H - pad - hh - 5, fmt(it.v), 'v-val');
        svgText(s, x + bw / 2, H - 8, it.l, 'v-lab');
      });
      host.appendChild(s);
    };
    const faixas = [[0, 0, 'parado', '#B9C2BD'], [0, 10, '1–10', '#8FD0A8'], [10, 20, '10–20', '#5BBF83'],
      [20, 30, '20–30', '#2E9E44'], [30, 40, '30–40', '#F2C200'], [40, 60, '40–60', '#FF7F11'], [60, 1e9, '60+', '#D62828']];
    bars(card(grid, 'Velocidade instantânea', 'Veículos com sinal recente, em km/h'),
      faixas.map(([a, b, l, color], i) => ({ l, color, v: live.filter((r) => (i === 0 ? !(r.vel > 0) : r.vel > a && r.vel <= b)).length })));

    const idades = [[-1e9, 60, '≤1 min', '#2E9E44'], [60, 300, '1–5 min', '#5BBF83'], [300, 900, '5–15 min', '#F2C200'],
      [900, 3600, '15–60 min', '#FF7F11'], [3600, 86400, '1–24 h', '#D62828'], [86400, 1e12, '>24 h', '#7A1F1F']];
    bars(card(grid, 'Idade do último sinal', 'Toda a base de veículos, não só os recentes'),
      idades.map(([a, b, l, color]) => ({ l, color, v: rows.filter((r) => r.idade > a && r.idade <= b).length })));

    /* rosa dos ventos */
    (() => {
      const c = card(grid, 'Rumo dos veículos', 'Campo direcao, em graus a partir do norte');
      const sect = new Array(8).fill(0);
      mov.forEach((r) => { if (r.dir >= 0 && r.dir <= 360) sect[Math.round(r.dir / 45) % 8]++; });
      const S = 210, cx = S / 2, cy = S / 2, R = 76, mx = Math.max(1, ...sect);
      const s = svg('svg', { viewBox: `0 0 ${S} ${S}`, class: 'sm-rose' });
      [.33, .66, 1].forEach((k) => svg('circle', { cx, cy, r: R * k, class: 'r-grid' }, s));
      sect.forEach((v, i) => {
        const a0 = ((i * 45 - 19) - 90) * Math.PI / 180, a1 = ((i * 45 + 19) - 90) * Math.PI / 180, rr = 8 + (R - 8) * v / mx;
        const p = svg('path', {
          d: `M${cx},${cy} L${cx + rr * Math.cos(a0)},${cy + rr * Math.sin(a0)} A${rr},${rr} 0 0 1 ${cx + rr * Math.cos(a1)},${cy + rr * Math.sin(a1)} Z`,
          fill: '#1F6FD1', 'fill-opacity': .25 + .6 * v / mx, stroke: '#1F6FD1',
        }, s);
        svg('title', {}, p).textContent = `${ROSE[i]}: ${fmt(v)} veículos`;
        const am = (i * 45 - 90) * Math.PI / 180;
        svgText(s, cx + (R + 14) * Math.cos(am), cy + (R + 14) * Math.sin(am) + 4, ROSE[i], 'v-lab');
      });
      c.appendChild(s);
    })();

    /* tempo de resposta do GeoServer, do cenário web do Zabbix */
    (() => {
      const etapas = [['WFS GetCapabilities', '#1F6FD1'], ['WFS GetFeature', '#2E9E44'], ['WMS GetCapabilities', '#FF7F11']];
      const sers = etapas.map(([n, color]) => ({ n, color, s: zone(new RegExp('Response time for step "' + n + '"')) })).filter((x) => x.s);
      if (!sers.length) return;
      const c = card(grid, 'Resposta do GeoServer', 'Tempo de cada etapa do cenário web, em segundos');
      const W = 320, H = 180, pl = 36, pb = 22;
      const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sm-lines' });
      const mx = Math.max(...sers.map((x) => Math.max(...x.s.v))) || 1;
      [0, .5, 1].forEach((k) => {
        const y = H - pb - k * (H - pb - 12);
        svg('line', { x1: pl, y1: y, x2: W - 6, y2: y, class: 'r-grid' }, g);
        svgText(g, pl - 6, y + 3, fmt(mx * k * 1000, 0) + ' ms', 'v-lab', 'end');
      });
      sers.forEach((x) => {
        const n = x.s.v.length;
        const pts = x.s.v.map((v, i) => `${pl + (i / Math.max(n - 1, 1)) * (W - pl - 6)},${H - pb - (v / mx) * (H - pb - 12)}`).join(' ');
        svg('polyline', { points: pts, fill: 'none', stroke: x.color, 'stroke-width': 1.8 }, g);
      });
      c.appendChild(g);
      const lg = el('ul', 'sm-rlg');
      sers.forEach((x) => {
        const li = el('li');
        const i = el('i');
        i.style.background = x.color;
        li.appendChild(i);
        li.appendChild(el('span', '', `${x.n} · ${fmt(x.s.last * 1000, 0)} ms`));
        lg.appendChild(li);
      });
      c.appendChild(lg);
    })();

    /* consistência do cadastro */
    const c = card(pane, 'Consistência do que a SEMOB publica', 'Contagens do último ciclo de coleta');
    c.classList.add('sm-wide');
    const ITEMS = [
      ['Veículos na base', rows.length, 'Registros da camada semob:ultima_posicao', 'ok'],
      ['Com sinal recente', live.length, `dataregistro de até ${age(janela)}`, live.length ? 'ok' : 'bad'],
      ['Sem transmitir há mais de 24 h', mudos, 'Prováveis veículos fora de operação', mudos > rows.length * .2 ? 'warn' : 'ok'],
      ['Sem coordenada utilizável', semCoord, 'Latitude e longitude nulas, fora de faixa ou (0,0)', semCoord ? 'warn' : 'ok'],
      ['Sem linha informada', semLinha, 'Campo cd_linha vazio entre os veículos com sinal', semLinha ? 'warn' : 'ok'],
      ['Velocidade não numérica', live.filter((r) => isNaN(r.vel) && r.vel !== null).length, 'Valor preenchido que não converte para número', 'ok'],
      ['Rumo fora de 0 a 360', mov.filter((r) => !(r.dir >= 0 && r.dir <= 360)).length, 'Campo direcao inválido entre os veículos em movimento', 'ok'],
    ];
    /* o Zabbix calcula os mesmos indicadores sobre a coleta dele, com histórico */
    [['Coordenadas inválidas (Zabbix)', /^Posições: coordenadas inválidas$/, 'Mesma verificação feita na coleta do Zabbix'],
     ['Duplicidades operadora e prefixo', /^Posições: duplicidades operadora e prefixo$/, 'Par id_operadora + prefixo repetido no mesmo ciclo'],
     ['Datas inválidas ou futuras', /^Posições: datas inválidas ou futuras$/, 'dataregistro ausente, fora do padrão ISO 8601 ou no futuro'],
     ['Velocidades não numéricas (Zabbix)', /^Posições: velocidades não numéricas$/, 'Valor de velocidade que não converte para número']
    ].forEach(([name, re, desc]) => {
      const v = zlast(re);
      if (isFinite(v)) ITEMS.push([name, v, desc, v > 0 ? 'warn' : 'ok']);
    });
    const tb = el('table', 'sm-table');
    const thead = el('thead');
    const trh = el('tr');
    ['Verificação', 'Registros', '% da base', 'O que significa', 'Situação'].forEach((n, i) => trh.appendChild(el('th', i === 1 || i === 2 ? 'num' : '', n)));
    thead.appendChild(trh);
    tb.appendChild(thead);
    const tbody = el('tbody');
    ITEMS.forEach(([name, v, desc, st]) => {
      const tr = el('tr');
      tr.appendChild(el('td', '', name));
      tr.appendChild(el('td', 'num', fmt(v)));
      tr.appendChild(el('td', 'num', fmt(pct(v, rows.length), 1) + '%'));
      tr.appendChild(el('td', 'desc', desc));
      const td = el('td');
      td.appendChild(el('span', 'sm-tag ' + (st === 'ok' ? 'ok' : st === 'warn' ? 'warn' : 'bad'),
        st === 'ok' ? 'Normal' : st === 'warn' ? 'Observar' : 'Sem dados'));
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    tb.appendChild(tbody);
    c.appendChild(tb);
  })();

  /* ------------------------------------------------------- aba 5: cadastros */
  (() => {
    const pane = panes.cadastros;
    const kpis2 = el('div', 'sm-kpis');
    pane.appendChild(kpis2);
    const mini = (ic, label, value, hint, color) => {
      const k = el('article', 'sm-kpi');
      k.style.setProperty('--a', color);
      const t = el('div', 'sm-kpi-top');
      t.appendChild(icon(ic));
      t.appendChild(el('span', '', label));
      k.appendChild(t);
      k.appendChild(el('strong', '', value));
      k.appendChild(el('span', 'sm-kpi-h', hint));
      kpis2.appendChild(k);
    };
    const frotaTotal = zlast(/^Frota: veículos cadastrados$/);
    const frotaOps = zlast(/^Frota: operadoras cadastradas$/);
    const frotaIdade = zlast(/^Frota: idade média$/);
    const frotaRef = zlast(/^Frota: idade da data de referência$/);
    const camadas = zlast(/^WFS: camadas publicadas$/);
    mini('bus', 'Frota cadastrada', fmt(frotaTotal), 'veículos no cadastro da SEMOB', '#1F6FD1');
    mini('grid', 'Empresas no cadastro', fmt(frotaOps), 'inclui permissionários agrupados', '#6B47B8');
    mini('clock', 'Idade média da frota', isFinite(frotaIdade) ? fmt(frotaIdade, 1) + ' anos' : '–', 'pelo ano de fabricação', '#FF7F11');
    mini('signal', 'Cadastro atualizado há', age(frotaRef), 'maior data_referencia publicada', frotaRef > 259200 ? '#D62828' : '#2E9E44');
    mini('pin', 'Camadas publicadas', fmt(camadas), 'FeatureType no catálogo WFS', '#0E7C7B');

    const grid = el('div', 'sm-grid2');
    pane.appendChild(grid);

    /* frota cadastrada por empresa, com cor da empresa */
    (() => {
      const itens = zall(/^Frota \[.*\]: veículos cadastrados$/).map((x) => {
        const nome = (/\[(.*)\]/.exec(x.name) || [, x.name])[1];
        const cor = Object.keys(C).find((k) => nome.toUpperCase().indexOf(k) >= 0);
        return { nome: /STPCR/i.test(nome) ? 'STPCR (permissionários)' : short(nome), full: nome, v: x.last, color: cor ? C[cor] : C_OTHERS };
      }).sort((a, b) => b.v - a.v);
      if (!itens.length) return;
      const c = card(grid, 'Frota cadastrada por empresa', 'Veículos no cadastro, não necessariamente em circulação');
      const list = el('div', 'sm-bars');
      const mx = Math.max(1, ...itens.map((i) => i.v));
      itens.forEach((i) => {
        const r = el('div', 'sm-barrow');
        r.title = i.full;
        r.appendChild(el('span', 'k', i.nome));
        const tr = el('span', 'tr');
        const f = el('i');
        f.style.width = pct(i.v, mx) + '%';
        f.style.background = i.color;
        tr.appendChild(f);
        r.appendChild(tr);
        r.appendChild(el('span', 'v', fmt(i.v)));
        list.appendChild(r);
      });
      c.appendChild(list);
      c.classList.add('sm-barlist-wide');
    })();

    /* frota cadastrada contra frota em circulação */
    (() => {
      const c = card(grid, 'Cadastro e circulação', 'Veículos cadastrados e veículos transmitindo agora, por empresa');
      const tb = el('table', 'sm-table');
      const thead = el('thead');
      const trh = el('tr');
      ['Empresa', 'Cadastrados', 'Com sinal', 'Em circulação'].forEach((n, i) => trh.appendChild(el('th', i ? 'num' : '', n)));
      thead.appendChild(trh);
      tb.appendChild(thead);
      const tbody = el('tbody');
      const cad = {};
      zall(/^Frota \[.*\]: veículos cadastrados$/).forEach((x) => {
        const nome = (/\[(.*)\]/.exec(x.name) || [, x.name])[1];
        cad[/STPCR/i.test(nome) ? OTHERS : short(nome)] = x.last;
      });
      empresas.forEach((e) => {
        const tr = el('tr');
        const td0 = el('td');
        const chip = el('i', 'sm-chip');
        chip.style.setProperty('--a', e.color);
        td0.appendChild(chip);
        td0.appendChild(el('span', '', e.name));
        td0.title = e.full;
        tr.appendChild(td0);
        const total = cad[e.name];
        tr.appendChild(el('td', 'num', isFinite(total) ? fmt(total) : '–'));
        tr.appendChild(el('td', 'num', fmt(e.n)));
        tr.appendChild(el('td', 'num', isFinite(total) && total > 0 ? fmt(pct(e.n, total), 1) + '%' : '–'));
        tbody.appendChild(tr);
      });
      tb.appendChild(tbody);
      c.appendChild(tb);
      c.appendChild(el('p', 'sm-hint', 'O cadastro é publicado uma vez por dia. A circulação acima de 100% indica veículo transmitindo fora do cadastro vigente.'));
    })();

    /* catálogo WFS */
    (() => {
      const itens = zall(/^Camada \[.*\]: registros$/).map((x) => ({
        nome: (/\[(?:semob:)?(.*)\]/.exec(x.name) || [, x.name])[1], v: x.last,
      })).sort((a, b) => b.v - a.v);
      if (!itens.length) return;
      const c = card(pane, 'Catálogo publicado pela SEMOB', 'Registros de cada camada do GeoServer. Escala logarítmica, porque as camadas variam de 15 a 50 mil registros.');
      c.classList.add('sm-wide');
      const list = el('div', 'sm-bars sm-bars-2');
      const lg = (v) => Math.log10(Math.max(v, 1) + 1);
      const mx = Math.max(...itens.map((i) => lg(i.v)));
      itens.forEach((i) => {
        const r = el('div', 'sm-barrow sm-barrow-w');
        r.appendChild(el('span', 'k', i.nome));
        const tr = el('span', 'tr');
        const f = el('i');
        f.style.width = pct(lg(i.v), mx) + '%';
        f.style.background = '#1F6FD1';
        tr.appendChild(f);
        r.appendChild(tr);
        r.appendChild(el('span', 'v', fmt(i.v)));
        list.appendChild(r);
      });
      c.appendChild(list);
    })();
  })();

  /* ------------------------------------------------------- aba 6: problemas */
  (() => {
    const pane = panes.problemas;
    const SEV = ['Não classificado', 'Informação', 'Atenção', 'Média', 'Alta', 'Desastre'];
    const CLS = ['n', 'i', 'w', 'm', 'h', 'd'];
    const c = card(pane, 'Problemas ativos no Zabbix', 'Triggers em estado de problema para o host monitorado');
    c.classList.add('sm-wide');
    if (!problems.length) {
      const ok = el('div', 'sm-empty');
      ok.appendChild(icon('signal'));
      ok.appendChild(el('p', '', 'Nenhum problema ativo. A coleta e a disponibilidade do GeoServer estão dentro dos limiares do template.'));
      c.appendChild(ok);
      return;
    }
    const tb = el('table', 'sm-table');
    const thead = el('thead');
    const trh = el('tr');
    ['Severidade', 'Problema', 'Dados', 'Desde', 'Duração'].forEach((n, i) => trh.appendChild(el('th', i === 4 ? 'num' : '', n)));
    thead.appendChild(trh);
    tb.appendChild(thead);
    const tbody = el('tbody');
    problems.slice().sort((a, b) => (+b.severity || 0) - (+a.severity || 0) || (b.timestamp || 0) - (a.timestamp || 0)).forEach((p) => {
      const tr = el('tr');
      const sev = Math.max(0, Math.min(5, parseInt(p.severity, 10) || 0));
      const td = el('td');
      td.appendChild(el('span', 'sm-sev s' + CLS[sev], SEV[sev]));
      tr.appendChild(td);
      tr.appendChild(el('td', '', p.name || p.description || '–'));
      tr.appendChild(el('td', 'desc', p.opdata || '–'));
      const ts = (p.timestamp || p.lastchangeUnix || 0) * 1000;
      tr.appendChild(el('td', '', ts ? new Date(ts).toLocaleString('pt-BR') : '–'));
      tr.appendChild(el('td', 'num', ts ? age((now - ts) / 1000) : '–'));
      tbody.appendChild(tr);
    });
    tb.appendChild(tbody);
    c.appendChild(tb);
  })();

  app.appendChild(el('p', 'sm-foot',
    'Posições da camada semob:ultima_posicao do GeoServer da SEMOB/DF, com nomes de empresa vindos do Zabbix. '
    + 'Velocidade em km/h e rumo em graus conforme o Anexo Único da Portaria SEMOB nº 89/2019. '
    + 'Permissionários do STPCR são pessoas físicas e aparecem apenas como Outros. Mapa base © OpenStreetMap.'));

  /* Tabelas longas rolam dentro do próprio cartão, com o cabeçalho fixo */
  app.querySelectorAll('table.sm-table').forEach((t) => {
    if (t.parentElement && t.parentElement.classList.contains('sm-tscroll')) return;
    const w = el('div', 'sm-tscroll' + (t.rows.length > 16 ? ' long' : ''));
    t.parentNode.insertBefore(w, t);
    w.appendChild(t);
  });

  /* O conteúdo ocupa toda a altura do painel: o mapa cresce e abas curtas não deixam faixa vazia */
  const alturaUtil = () => {
    for (let n = root, i = 0; n && i < 8; n = n.parentElement, i++) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll' || oy === 'hidden') && n.clientHeight > 240) return n.clientHeight;
    }
    return 0;
  };
  const ajustaAltura = () => {
    const h = alturaUtil();
    app.style.minHeight = h ? h + 'px' : '';
    if (window.__smMap) window.__smMap.invalidateSize();
  };
  ajustaAltura();
  if (window.ResizeObserver) {
    if (window.__smRO) window.__smRO.disconnect();
    window.__smRO = new ResizeObserver(() => ajustaAltura());
    window.__smRO.observe(root.parentElement || root);
  }

  show(active);

  /* ------------------------------------------------------------- o mapa real */
  const popup = (r) => `<div class="sm-pop"><header><b>${r.prefixo || 'sem prefixo'}</b>
    <i style="background:${r.g.color}"></i><span>${r.g.name}</span></header>
    <dl><dt>Linha</dt><dd>${r.linha || 'não informada'}</dd>
    <dt>Velocidade</dt><dd>${isFinite(r.vel) ? fmt(r.vel, 1) + ' km/h' : 'não informada'}</dd>
    <dt>Rumo</dt><dd>${r.dir >= 0 && r.dir <= 360 ? fmt(r.dir, 0) + '° ' + rose(r.dir) : 'não informado'}</dd>
    <dt>Último sinal</dt><dd>há ${age(r.idade)}</dd>
    <dt>Coordenada</dt><dd>${fmt(r.lat, 5)}, ${fmt(r.lon, 5)}</dd></dl></div>`;

  let destroy = () => {};
  const fallback = (msg) => {
    mapBox.innerHTML = '';
    const cv = el('canvas', 'sm-canvas');
    mapBox.appendChild(cv);
    mapBox.appendChild(el('p', 'sm-mapmsg', msg));
    const w = mapBox.clientWidth || 900, hh = mapBox.clientHeight || 560;
    cv.width = w * devicePixelRatio; cv.height = hh * devicePixelRatio;
    cv.style.width = w + 'px'; cv.style.height = hh + 'px';
    const g = cv.getContext('2d');
    g.scale(devicePixelRatio, devicePixelRatio);
    const pts = live.filter((r) => !hidden[r.g.key]);
    if (!pts.length) return;
    const la = pts.map((r) => r.lat), lo = pts.map((r) => r.lon);
    const a0 = quant(la, .01), a1 = quant(la, .99), o0 = quant(lo, .01), o1 = quant(lo, .99);
    const kx = Math.cos(-15.8 * Math.PI / 180);
    const k = Math.min((w - 48) / (((o1 - o0) * kx) || 1), (hh - 48) / ((a1 - a0) || 1));
    pts.forEach((r) => {
      g.fillStyle = r.g.color;
      g.globalAlpha = r.vel > 0 ? .9 : .45;
      g.beginPath();
      g.arc(24 + (r.lon - o0) * kx * k, hh - 24 - (r.lat - a0) * k, r.vel > 0 ? 3 : 2, 0, 7);
      g.fill();
    });
  };

  const loadLeaflet = () => {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (window.__smLeaflet) return window.__smLeaflet;
    window.__smLeaflet = new Promise((res, rej) => {
      const amd = window.define;
      window.define = undefined; // o Grafana expõe AMD e o Leaflet não criaria window.L
      const s = document.createElement('script');
      const fail = (m) => { window.define = amd; window.__smLeaflet = null; rej(new Error(m)); };
      s.src = LEAFLET;
      s.onload = () => { window.define = amd; window.L ? res(window.L) : fail('o Leaflet não expôs window.L'); };
      s.onerror = () => fail('falha ao baixar o Leaflet');
      setTimeout(() => { if (!window.L) fail('tempo esgotado ao baixar o Leaflet'); }, 8000);
      document.head.appendChild(s);
    });
    return window.__smLeaflet;
  };

  loadLeaflet().then((L) => {
    if (!root.isConnected) return;
    mapBox.innerHTML = '';
    const host = el('div', 'sm-leaflet');
    mapBox.appendChild(host);
    const view = window.__smView || { center: [-15.80, -47.92], zoom: 11 };
    const map = L.map(host, { preferCanvas: true, zoomControl: false, attributionControl: true }).setView(view.center, view.zoom);
    window.__smMap = map;
    L.control.zoom({ position: 'topleft' }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    host.classList.add('sm-tiles'); // dessatura o mapa base para os pontos ganharem destaque
    const rend = L.canvas({ padding: .3 });
    const layers = {}, marks = [];
    live.forEach((r) => {
      const lg = layers[r.g.key] || (layers[r.g.key] = L.layerGroup());
      const andando = r.vel > 0;
      const fresco = Math.max(.4, 1 - r.idade / Math.max(janela, 60));
      lg.addLayer(L.circleMarker([r.lat, r.lon], {
        renderer: rend, radius: andando ? 5 : 3.4, stroke: false, fillColor: r.g.color, fillOpacity: (andando ? .95 : .55) * fresco,
      }).bindPopup(popup(r)));
      marks.push(r);
      if (andando && r.dir >= 0 && r.dir <= 360) {
        const d = 70 + Math.min(r.vel, 80) * 6, a = r.dir * Math.PI / 180;
        lg.addLayer(L.polyline([[r.lat, r.lon], [
          r.lat + (d * Math.cos(a)) / 111320, r.lon + (d * Math.sin(a)) / (111320 * Math.cos(r.lat * Math.PI / 180)),
        ]], { renderer: rend, color: r.g.color, weight: 2, opacity: .8 * fresco, interactive: false }));
      }
    });
    Object.keys(layers).forEach((k) => { if (!hidden[k]) layers[k].addTo(map); });
    const hi = L.layerGroup().addTo(map);

    const Btn = (label, title, cb) => L.Control.extend({
      onAdd() {
        const b = L.DomUtil.create('button', 'sm-mapbtn');
        b.type = 'button'; b.textContent = label; b.title = title;
        L.DomEvent.disableClickPropagation(b);
        b.onclick = cb;
        return b;
      },
    });
    const fit = () => {
      const p = live.filter((r) => !hidden[r.g.key]).map((r) => [r.lat, r.lon]);
      if (p.length) map.fitBounds(L.latLngBounds(p).pad(.05));
    };
    new (Btn('Enquadrar frota', 'Ajusta o mapa à frota visível', fit))({ position: 'topright' }).addTo(map);

    const Legend = L.Control.extend({
      onAdd() {
        const d = L.DomUtil.create('div', 'sm-maplg');
        d.innerHTML = '<b>Como ler</b><p><i class="big"></i>círculo maior: veículo em movimento, com traço no rumo</p>'
          + '<p><i></i>círculo menor: veículo parado</p><p>Quanto mais apagado, mais antigo é o sinal.</p>';
        L.DomEvent.disableClickPropagation(d);
        return d;
      },
    });
    new Legend({ position: 'bottomleft' }).addTo(map);

    Object.keys(cards).forEach((k) => {
      cards[k].onclick = () => {
        hidden[k] = !hidden[k];
        cards[k].classList.toggle('off', !!hidden[k]);
        if (layers[k]) { if (hidden[k] || input.value.trim()) map.removeLayer(layers[k]); else layers[k].addTo(map); }
      };
      cards[k].ondblclick = () => {
        const p = live.filter((r) => r.g.key === k).map((r) => [r.lat, r.lon]);
        if (p.length) map.fitBounds(L.latLngBounds(p).pad(.05));
      };
    });

    /* com o mapa pronto, a busca também destaca e enquadra os veículos */
    onSearch = (hit) => {
      hi.clearLayers();
      const busca = !!input.value.trim();
      /* durante a busca o resto da frota sai do mapa; ao limpar, volta conforme as empresas ligadas */
      Object.keys(layers).forEach((k) => {
        const mostra = !busca && !hidden[k];
        if (mostra && !map.hasLayer(layers[k])) layers[k].addTo(map);
        if (!mostra && map.hasLayer(layers[k])) map.removeLayer(layers[k]);
      });
      hit.forEach((r) => {
        if (r.vel > 0 && r.dir >= 0 && r.dir <= 360) {
          const d = 120 + Math.min(r.vel, 80) * 8, a = r.dir * Math.PI / 180;
          hi.addLayer(L.polyline([[r.lat, r.lon], [r.lat + (d * Math.cos(a)) / 111320, r.lon + (d * Math.sin(a)) / (111320 * Math.cos(r.lat * Math.PI / 180))]],
            { renderer: rend, color: r.g.color, weight: 3, opacity: .9, interactive: false }));
        }
        hi.addLayer(L.circleMarker([r.lat, r.lon], { renderer: rend, radius: 14, color: r.g.color, weight: 2, opacity: .55, fill: false, interactive: false }));
        hi.addLayer(L.circleMarker([r.lat, r.lon], { renderer: rend, radius: 8, color: '#fff', weight: 2.5, fillColor: r.g.color, fillOpacity: 1 }).bindPopup(popup(r)));
      });
      if (hit.length) map.fitBounds(L.latLngBounds(hit.map((r) => [r.lat, r.lon])).pad(.2), { maxZoom: 15 });
    };
    if (input.value.trim()) input.dispatchEvent(new Event('input'));
    map.on('moveend', () => { window.__smView = { center: map.getCenter(), zoom: map.getZoom() }; });
    setTimeout(() => map.invalidateSize(), 60);
    destroy = () => { map.remove(); window.__smMap = null; };
  }).catch((e) => {
    fallback(`Mapa base indisponível (${e.message}). Mostrando a dispersão das coordenadas, sem ruas.`);
    Object.keys(cards).forEach((k) => {
      cards[k].onclick = () => {
        hidden[k] = !hidden[k];
        cards[k].classList.toggle('off', !!hidden[k]);
        fallback('Mapa base indisponível.');
      };
    });
  });

  return () => destroy();
} catch (err) {
  /* fallback visível: sem isto, um erro deixaria o painel em branco */
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'sm sm-error';
  const h = document.createElement('h2');
  h.textContent = 'O painel não conseguiu montar os dados';
  const p1 = document.createElement('p');
  p1.textContent = String((err && err.message) || err);
  const p2 = document.createElement('p');
  p2.className = 'sm-hint';
  p2.textContent = 'Abra o painel em Edit > Query inspector e confira se as consultas A a G retornaram dados.';
  box.appendChild(h); box.appendChild(p1); box.appendChild(p2);
  root.appendChild(box);
  console.error('[SEMOB]', err);
}
