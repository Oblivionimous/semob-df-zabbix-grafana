"""Consistência interna do template: UUIDs, referências, macros, dashboard e JSONPath contra a saída real dos scripts."""
import json, re, sys, dukpy
from common import TEMPLATE, export
d = export()
t = d['templates'][0]; T = t['template']; ok = 0
def check(c, m):
    global ok
    if not c: print('FALHA', m); sys.exit(1)
    ok += 1; print('OK  ', m)

uuids = re.findall(r"uuid: ([0-9a-f]+)", TEMPLATE.read_text(encoding='utf-8'))
v4 = [u for u in uuids if len(u) == 32 and int(u[12], 16) == 4 and int(u[16], 16) in (8, 9, 10, 11)]
check(len(uuids) == len(set(uuids)) and len(v4) == len(uuids), '%d UUIDs únicos e UUIDv4' % len(uuids))

items = {i['key']: i for i in t['items']}
protos = {p['key']: (p, r) for r in t['discovery_rules'] for p in r.get('item_prototypes', [])}
web = t['httptests'][0]
webkeys = {'web.test.fail[%s]' % web['name'], 'web.test.error[%s]' % web['name'], 'web.test.in[%s,,bps]' % web['name']}
for s in web['steps']:
    for k in ('resp', 'rspcode', 'in'):
        webkeys.add('web.test.%s[%s,%s,%s]' % ('time' if k == 'resp' else k, web['name'], s['name'], k))
allkeys = set(items) | set(protos) | webkeys
check(len(items) + len(protos) == len(set(items) | set(protos)), 'chaves de itens e protótipos sem duplicidade')

def depth(k):
    n = 0
    while True:
        i = items.get(k) or (protos.get(k) or [None])[0]
        if i is None or i['type'] != 'DEPENDENT': return n
        k = i['master_item']['key']; n += 1
deps_ok = all(i['master_item']['key'] in items for i in list(items.values()) + [p for p, _ in protos.values()] + t['discovery_rules'] if i['type'] == 'DEPENDENT')
check(deps_ok, 'todos os mestres de itens dependentes existem')
check(max(depth(k) for k in allkeys - webkeys) <= 3, 'profundidade de dependência <= 3 (máx. %d)' % max(depth(k) for k in allkeys - webkeys))

trigs = [tr for i in t['items'] for tr in i.get('triggers', [])] + d['triggers'] + \
        [tr for p, _ in protos.values() for tr in p.get('trigger_prototypes', [])]
names = {(tr['name'], tr['expression']) for tr in trigs}
check(all((x['name'], x['expression']) in names for tr in trigs for x in tr.get('dependencies', [])), 'dependências de triggers apontam para triggers existentes')
refkeys = [k for tr in trigs for k in re.findall(r'/%s/(.+?\])?(?=[,)])' % re.escape(T), tr['expression'])]
exprkeys = [m for tr in trigs for m in re.findall(r'/' + re.escape(T) + r'/((?:[^,()\[]|\[[^\]]*\])+)', tr['expression'])]
check(all(k in allkeys for k in exprkeys), 'triggers referenciam %d chaves existentes' % len(exprkeys))

gks = [gi['item']['key'] for g in d['graphs'] for gi in g['graph_items']] + \
      [gi['item']['key'] for r in t['discovery_rules'] for g in r.get('graph_prototypes', []) for gi in g['graph_items']]
check(all(k in allkeys for k in gks), 'gráficos referenciam %d chaves existentes' % len(gks))

gnames = {g['name'] for g in d['graphs']}
REAL = [('3437', 'VIAÇÃO PIRACICABANA - BACIA 01'), ('3449', 'VIAÇÃO PIONEIRA BACIA - 02'), ('3441', 'URBI - MOBILID. URBANA - BACIA 03'),
        ('3444', 'AUTO VIAÇÃO MARECHAL - BACIA 04'), ('3450', 'EXPRESSO SÃO JOSÉ BACIA - 05'), ('3262', 'COOBRATAETE - BACIA 02'),
        ('x', 'STPCR (permissionários)')]
inames = [i['name'] for i in t['items']]
for p_, _ in protos.values():
    for oid, on in REAL:
        inames.append(p_['name'].replace('{#OPERADORA.ID}', oid).replace('{#OPERADORA.NOME}', on).replace('{#CAMADA}', 'semob:ultima_posicao'))
for page in t['dashboards'][0]['pages']:
    for w in page['widgets']:
        for f in w['fields']:
            if f['type'] == 'ITEM': check(f['value']['key'] in items, 'widget "%s" -> item %s' % (w.get('name', w['type']), f['value']['key']))
            if f['type'] == 'GRAPH': check(f['value']['name'] in gnames, 'widget graph -> %s' % f['value']['name'])
            if f['name'] in ('ds.0.items.0', 'items.0'):
                rx = re.compile('^' + re.escape(f['value']).replace(r'\*', '.*') + '$')
                check(any(rx.match(n) for n in inames), 'widget "%s" -> padrão "%s" casa com item/protótipo' % (w['name'], f['value']))
            if f['name'].startswith('ds.') and f['name'].endswith('.items.0'):
                rx = re.compile('^' + re.escape(f['value']).replace(r'\*', '.*') + '$')
                check(sum(bool(rx.match(n)) for n in inames) == 1, 'widget "%s" -> "%s" casa exatamente 1 operadora' % (w['name'], f['value']))
            if f['name'] == 'primary_label':
                m = re.match(r'\{\{ITEM.NAME\}\.regsub\("(.*)", "\\1"\)\}$', f['value'])
                lbl = [re.search(m.group(1), n).group(1) for n in inames if re.search(m.group(1), n) and (('Operadora [' in n and 'Operadora' in w['name'] + 'Operadora') if 'operadora' in w['name'] else n.startswith('Camada ['))]
                check(bool(lbl), 'rótulo "%s": %s' % (w['name'], sorted(set(lbl))))
    xs = [(int(w.get('x', 0)), int(w.get('y', 0)), int(w['width']), int(w['height'])) for w in page['widgets']]
    over = any(a != b and a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3] for a in xs for b in xs)
    check(not over and all(x + w <= 72 for x, _, w, _ in xs), 'página "%s": widgets sem sobreposição e dentro de 72 colunas' % page['name'])

text = TEMPLATE.read_text(encoding='utf-8')
used = set(re.findall(r'\{\$[A-Z0-9_.]+\}', text)); defined = {m['macro'] for m in t['macros']}
check(used <= defined, '%d macros usadas e todas definidas' % len(used))
check(defined <= used, 'nenhuma macro definida sem uso')

# JSONPath simples x saída real do JS sobre amostra sintética
def run(code, value):
    code = code.replace('{$SEMOB.POS.FRESH.MAX}', '300').replace('{$SEMOB.POS.STALE.MIN}', '86400')
    return json.loads(dukpy.evaljs('(function(value){\n' + code + '\n})(dukpy.value)', value=value))
import datetime as dt
now = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
pos = run(items['semob.positions.stats']['preprocessing'][0]['parameters'][0], json.dumps({'type': 'FeatureCollection', 'numberMatched': 1, 'numberReturned': 1,
      'features': [{'properties': {'id_operadora': 7, 'prefixo': 'A', 'velocidade': '10,5', 'cd_linha': '0.1', 'latitude': -15.8, 'longitude': -47.9, 'dataregistro': now}}]}))
fl = run(items['semob.fleet.stats']['preprocessing'][0]['parameters'][0], json.dumps({'type': 'FeatureCollection',
      'features': [{'properties': {'operadora': 'Viação Teste - BACIA 01', 'ano_fabrica': 2020, 'data_referencia': '2026-10-08Z'}}]}))
outs = {'semob.positions.stats': pos, 'semob.fleet.stats': fl}
macro = {'{#OPERADORA.ID}': '7', '{#OPERADORA.KEY}': 'VIACAO_TESTE_BACIA_01'}
for i in list(items.values()) + [p for p, _ in protos.values()]:
    m = i.get('master_item', {}).get('key')
    if m in outs:
        path = i['preprocessing'][0]['parameters'][0]
        for a, b in macro.items(): path = path.replace(a, b)
        cur = outs[m]
        for part in re.findall(r"\.(\w+)|\['([^']+)'\]", path):
            k = part[0] or part[1]; cur = cur.get(k) if isinstance(cur, dict) else None
        check(isinstance(cur, (int, float)), 'JSONPath %-45s -> %s' % (path, cur))
print('\n%d verificações aprovadas' % ok)
