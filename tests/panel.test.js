/*
 * Executa o afterRender do painel (o que está dentro do JSON do dashboard) em jsdom, com Leaflet real,
 * dados sintéticos no formato dos quadros do Infinity e do Zabbix, e confere a interface.
 * Uso: cd tests && npm install && npm test
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const dashboard = JSON.parse(fs.readFileSync(path.join(ROOT, 'grafana', 'dashboard_semob_df.json'), 'utf8'));
const CODE = dashboard.panels[0].options.afterRender;
const LEAFLET = fs.readFileSync(path.join(__dirname, 'node_modules', 'leaflet', 'dist', 'leaflet-src.js'), 'utf8');

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log('OK  ', msg); };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); passed++; console.log('OK  ', msg); };

/* ------------------------------------------------------------------ dados sintéticos */
const NOW = Date.now();
const field = (name, type, values, config) => ({ name, type, values, config: config || {} });
const zseries = (name, values) => ({
  refId: 'Z', name,
  fields: [field('time', 'time', values.map((_, i) => NOW - (values.length - i) * 6e4)),
    field('value', 'number', values, { displayNameFromDS: name })],
});

function build() {
  const N = 3619, ids = [], pre = [], lin = [], vel = [], dir = [], lat = [], lon = [], ts = [];
  const codes = ['3437', '3441', '3444', '3449', '3450', '3262', '3332', '3317', null];
  for (let i = 0; i < N; i++) {
    ids.push(codes[i % codes.length]);
    pre.push(String(10000 + i) + (i === 5 ? '\u0007' : ''));           // caractere de controle no prefixo
    lin.push(i % 5 === 0 ? '' : '0.' + (100 + (i % 120)));
    vel.push(i % 3 === 0 ? '0' : String(i % 70) + (i % 7 === 0 ? ',5' : '')); // vírgula decimal
    dir.push(String((i * 37) % 360) + ',25');
    lat.push(i === 7 ? 0 : -15.6 - (i % 50) / 100);                    // (0,0) deve ser descartado
    lon.push(i === 7 ? 0 : -47.7 - (i % 60) / 100);
    ts.push(NOW - (i % 10 === 0 ? 90000 : (i % 400)) * 1000);
  }
  const gps = {
    refId: 'A', name: 'A', fields: [field('prefixo', 'string', pre), field('id_operadora', 'string', ids),
      field('cd_linha', 'string', lin), field('velocidade', 'string', vel), field('direcao', 'string', dir),
      field('latitude', 'number', lat), field('longitude', 'number', lon), field('dataregistro', 'time', ts)],
  };
  const NOMES = { 3437: 'VIAÇÃO PIRACICABANA - BACIA 01', 3441: 'URBI - MOBILID. URBANA - BACIA 03',
    3444: 'AUTO VIAÇÃO MARECHAL - BACIA 04', 3449: 'VIAÇÃO PIONEIRA BACIA - 02',
    3450: 'EXPRESSO SÃO JOSÉ BACIA - 05', 3262: 'COOBRATAETE - BACIA 02' };
  const series = [gps];
  Object.keys(NOMES).forEach((k) => series.push(zseries(`Operadora [${k} - ${NOMES[k]}]: registros`, [1])));
  series.push(zseries('Posições: veículos com registro recente', [3000, 3100, 3187, 3150]));
  series.push(zseries('Posições: idade do registro mais recente', [2, 5, 3]));
  [['Posições: coordenadas inválidas', [8]], ['Posições: duplicidades operadora e prefixo', [1]],
    ['Posições: datas inválidas ou futuras', [0]], ['Posições: velocidades não numéricas', [0]],
    ['Frota: veículos cadastrados', [3172]], ['Frota: operadoras cadastradas', [7]], ['Frota: idade média', [3.69]],
    ['Frota: idade da data de referência', [164531]], ['WFS: camadas publicadas', [14]],
    ['Frota [VIAÇÃO PIONEIRA BACIA - 02]: veículos cadastrados', [754]],
    ['Frota [STPCR (permissionários)]: veículos cadastrados', [43]],
    ['Camada [semob:ultima_posicao]: registros', [3619]], ['Camada [semob:faixas_exclusivas]: registros', [15]],
    ['Response time for step "WFS GetFeature" of scenario "SEMOB GeoServer".', [0.046, 0.05, 0.04]],
  ].forEach(([n, v]) => series.push(zseries(n, v)));
  series.push({
    refId: 'G', name: 'problems',
    fields: [{
      name: 'Problems', type: 'other', config: { custom: { type: 'problems' } },
      values: [
        { name: 'SEMOB: coordenadas inválidas acima do limite', severity: '1', opdata: 'Registros: 8', timestamp: Math.floor(NOW / 1000) - 7200 },
        { name: 'SEMOB: veículos duplicados no feed de posições', severity: '4', opdata: 'Duplicados: 1', timestamp: Math.floor(NOW / 1000) - 600 },
      ],
    }],
  });
  return series;
}

/* ------------------------------------------------------------------ ambiente de navegador */
function render({ withLeaflet, series, context }) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="p" style="width:1400px;height:900px"></div></body></html>',
    { pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); // sem eco de avisos do jsdom
  const { window } = dom;
  const expose = (k, v) => Object.defineProperty(global, k, { value: v, configurable: true, writable: true });
  Object.entries({
    window, document: window.document, navigator: window.navigator, Event: window.Event, devicePixelRatio: 1,
    getComputedStyle: window.getComputedStyle.bind(window), ResizeObserver: undefined,
  }).forEach(([k, v]) => expose(k, v));            // no Node 22, navigator é só leitura em globalThis
  window.HTMLCanvasElement.prototype.getContext = () =>
    new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  window.define = function () {};
  window.define.amd = true;                           // o Grafana expõe AMD, o painel precisa contornar
  if (withLeaflet) {
    const amd = window.define;
    window.define = undefined;
    window.eval(LEAFLET);
    window.define = amd;
  }
  const element = window.document.getElementById('p');
  const ctx = context || {
    element, panelData: { series },
    grafana: {
      theme: { isDark: false, colors: { background: { primary: '#fff', secondary: '#f4f6f4' }, text: { primary: '#111', secondary: '#666' }, border: { weak: '#ddd' } } },
      replaceVariables: (s) => s.replace('${janela}', '300'),
    },
  };
  if (context) ctx.element = element;
  const cleanup = new Function('context', CODE)(ctx);
  return { window, element, cleanup };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (el, sel) => [...el.querySelectorAll(sel)];

(async () => {
  /* --------------------------------------------------------- com Leaflet */
  const { window, element, cleanup } = render({ withLeaflet: true, series: build() });
  await wait(600);

  eq(q(element, '.sm-tab').map((t) => t.textContent),
    ['Mapa da frota', 'Empresas', 'Linhas', 'Qualidade e disponibilidade', 'Cadastros', 'Problemas (2)'], 'seis abas, com a contagem de problemas');
  ok(q(element, '.sm-tab')[0].classList.contains('on'), 'a aba Mapa da frota abre ativa');
  ok(q(element, '.sm-kpis')[0].querySelectorAll('.sm-kpi').length === 6, 'seis indicadores fixos no topo');
  ok(!!element.querySelector('.leaflet-container'), 'mapa Leaflet criado');
  ok(!element.textContent.includes('\u0007'), 'caractere de controle do prefixo não chega à tela');

  const nomes = q(element, '.sm-emp .sm-emp-n').map((n) => n.textContent).sort();
  eq(nomes, ['COOBRATAETE', 'MARECHAL', 'Outros', 'PIONEIRA', 'PIRACICABANA', 'SÃO JOSÉ', 'URBI'], 'cartões das seis empresas e do grupo Outros');
  const cores = {};
  q(element, '.sm-emp').forEach((c) => { cores[c.querySelector('.sm-emp-n').textContent] = c.style.getPropertyValue('--a').trim().toUpperCase(); });
  eq(cores, { COOBRATAETE: '#9E9E9E', MARECHAL: '#FF7F11', Outros: '#D62828', PIONEIRA: '#F2C200', PIRACICABANA: '#2E9E44', 'SÃO JOSÉ': '#5C3317', URBI: '#1F6FD1' },
    'cores oficiais de cada empresa');

  const input = element.querySelector('.sm-search input');
  const msg = element.querySelector('.sm-msg');
  const digita = (v) => { input.value = v; input.dispatchEvent(new window.Event('input')); };
  digita('0.101');
  ok(/25 veículos/.test(msg.textContent) && /0\.101/.test(msg.textContent), 'busca por linha informa a contagem e a linha: "' + msg.textContent + '"');
  digita('zzz');
  eq(msg.textContent, 'Nada encontrado com sinal recente', 'busca sem resultado');
  digita('');
  eq(msg.textContent, '', 'limpar a busca zera a mensagem');

  const card = element.querySelector('.sm-emp');
  card.click();
  ok(card.classList.contains('off'), 'clicar no cartão oculta a empresa');
  card.click();
  ok(!card.classList.contains('off'), 'clicar de novo mostra a empresa');

  q(element, '.sm-tab')[2].click();
  eq(q(element, '.sm-pane').map((p) => p.hidden), [true, true, false, true, true, true], 'trocar de aba mostra só o painel escolhido');

  const linhasPane = q(element, '.sm-pane')[2];
  ok(linhasPane.querySelectorAll('tbody tr').length > 0, 'aba Linhas lista as linhas em operação');

  const prob = q(element, '.sm-pane')[5];
  const linhasProb = q(prob, 'tbody tr').map((r) => [...r.children].map((c) => c.textContent)[0]);
  eq(linhasProb, ['Alta', 'Informação'], 'problemas ordenados por severidade');

  const cad = q(element, '.sm-pane')[4];
  ok(/754/.test(cad.textContent) && /3\.172/.test(cad.textContent), 'aba Cadastros mostra a frota da Pioneira e o total de 3.172');
  ok(/STPCR/.test(cad.textContent) && !/Benicio|Kaio|Milena|Weverson|Iroilto|Ivanilson|Kawan|Osorio|Bruno/i.test(cad.textContent),
    'permissionários aparecem só como grupo, sem nomes de pessoas');
  if (typeof cleanup === 'function') cleanup();

  /* ------------------------------------------------- sem Leaflet: dispersão */
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms >= 1000 ? 30 : ms, ...a); // não espera os 8 s do carregamento
  const fb = render({ withLeaflet: false, series: build() });
  await wait(200);
  global.setTimeout = realSetTimeout;
  ok(!!fb.element.querySelector('.sm-canvas') && !fb.element.querySelector('.leaflet-container'), 'sem Leaflet, o painel cai para a dispersão das coordenadas');
  ok(/Mapa base indisponível/.test(fb.element.querySelector('.sm-mapmsg').textContent), 'aviso de mapa base indisponível');
  const inp2 = fb.element.querySelector('.sm-search input');
  inp2.value = '0.101';
  inp2.dispatchEvent(new fb.window.Event('input'));
  ok(/25 veículos/.test(fb.element.querySelector('.sm-msg').textContent), 'a busca funciona mesmo sem o mapa');

  /* ------------------------------------------------- falha de montagem visível */
  const logged = [];
  const realError = console.error;
  console.error = (...a) => logged.push(a.join(' '));
  const err = render({ withLeaflet: false, context: { panelData: { series: [] }, grafana: { theme: null, replaceVariables: null } } });
  console.error = realError;
  ok(!!err.element.querySelector('.sm-error') && /não conseguiu montar/.test(err.element.textContent),
    'erro de montagem aparece em caixa vermelha, não em painel vazio');
  ok(logged.some((l) => l.includes('[SEMOB]')), 'o erro também vai para o console com o prefixo [SEMOB]');

  console.log('\n%d verificações aprovadas', passed);
  process.exit(0);
})().catch((e) => { console.error('FALHA', e.message); process.exit(1); });
