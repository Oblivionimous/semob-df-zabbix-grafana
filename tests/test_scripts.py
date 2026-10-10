"""Testa no Duktape (dukpy) os scripts JavaScript embutidos no template, com dados sintéticos no formato do GeoServer."""
import json, re, time, random, datetime as dt, dukpy, pathlib

from common import scripts
SCRIPTS = scripts()
MACROS = {'{$SEMOB.POS.FRESH.MAX}': '300', '{$SEMOB.POS.STALE.MIN}': '86400'}

def run(script, value):
    code = SCRIPTS[script]
    for k, v in MACROS.items():
        code = code.replace(k, v)
    return dukpy.evaljs('(function(value){\n' + code + '\n})(dukpy.value)', value=value)

def iso(sec_ago):
    t = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=sec_ago)
    return t.strftime('%Y-%m-%dT%H:%M:%S.') + '%03dZ' % (t.microsecond // 1000)

ok = 0
def check(cond, msg):
    global ok
    assert cond, msg
    ok += 1
    print('OK  ', msg)

# 1) posições: amostra sintética com os casos citados no relatório
feats = []
def add(op, pref, age, linha='0.111', vel='35', lat=-15.79, lon=-47.88, direcao='12,5'):
    feats.append({'type': 'Feature', 'id': 'ultima_posicao.%d' % len(feats), 'geometry': None,
                  'properties': {'id_operadora': op, 'prefixo': pref, 'velocidade': vel, 'cd_linha': linha,
                                 'latitude': lat, 'longitude': lon, 'dataregistro': iso(age) if isinstance(age, (int, float)) else age,
                                 'sentido': 'IDA', 'direcao': direcao}})
add(1, '0001', 30)                       # recente, em movimento
add(1, '0002', 60, vel='0')              # recente, parado
add(1, '0003', 90, linha='')             # recente sem linha
add(2, '1001', 120, vel='12,5')          # vírgula decimal
add(2, '1002', 200, vel='abc')           # velocidade inválida
add(2, '1003', 4000)                     # entre 5 min e 24 h
add(3, '2001', 90000)                    # > 24 h
add(3, '2002\x07', 30, lat=None)         # caractere de controle + coordenada nula
add(3, '2003', 30, lat=0, lon=0)         # coordenada (0,0)
add(3, '2003', 30)                       # duplicado operadora+prefixo
add(None, 'X1', 30)                      # operadora nula
add(4, 'F1', -3600)                      # data futura
add(4, 'B1', 'lixo')                     # data inválida
fc = {'type': 'FeatureCollection', 'features': feats, 'totalFeatures': len(feats),
      'numberMatched': len(feats), 'numberReturned': len(feats), 'timeStamp': iso(0)}
r = json.loads(run('positions_stats.js', json.dumps(fc)))
check(r['ok'] == 1 and r['complete'] == 1 and r['matched'] == 13 and r['returned'] == 13, 'posições: coleta completa')
check(r['total'] == 13, 'posições: total de registros')
check(r['fresh'] == 9, 'posições: 9 registros recentes (<=300 s), sem futuro e inválido')
check(abs(r['fresh_pct'] - 69.23) < 0.01, 'posições: percentual de registros recentes (9 de 13)')
check(r['moving'] == 7, 'posições: 7 em movimento, vírgula decimal convertida')
check(r['stale'] == 1, 'posições: 1 registro com mais de 24 h')
check(r['no_line'] == 1, 'posições: 1 recente sem linha')
check(r['invalid_coords'] == 2, 'posições: coordenada nula e (0,0) contadas')
check(r['invalid_timestamps'] == 2, 'posições: data futura e data inválida contadas')
check(r['duplicates'] == 1, 'posições: duplicidade operadora+prefixo')
check(r['speed_errors'] == 1, 'posições: velocidade não numérica contada')
check(r['operators_active'] == 4 and r['lines_active'] == 1, 'posições: operadoras e linhas ativas')
check(r['newest_age'] <= 31 and r['newest_age'] >= 29, 'posições: idade do registro mais recente em segundos')
check(abs(r['speed_avg'] - (35*6 + 12.5) / 7) < 0.01, 'posições: velocidade média dos veículos em movimento')
check([x['{#OPERADORA.ID}'] for x in r['lld']] == ['1', '2', '3', '4', 'desconhecida'], 'posições: LLD ordenada e estável')
check(r['operators']['2'] == {'total': 3, 'fresh': 2, 'moving': 1, 'no_line': 0}, 'posições: contadores por operadora')

# 2) resposta truncada e sem numberMatched
fc2 = dict(fc, numberMatched=20)
check(json.loads(run('positions_stats.js', json.dumps(fc2)))['complete'] == 0, 'posições: truncamento detectado')
fc3 = {k: v for k, v in fc.items() if k not in ('numberMatched', 'totalFeatures')}
r3 = json.loads(run('positions_stats.js', json.dumps(fc3)))
check(r3['complete'] == 0 and 'matched' not in r3, 'posições: total desconhecido não vira completo')

# 3) erros de coleta
for raw, label in (('SEMOB_HTTP_ERROR', 'valor de falha HTTP'),
                   ('<ows:ExceptionReport><ows:Exception><ows:ExceptionText>x</ows:ExceptionText></ows:Exception></ows:ExceptionReport>', 'ExceptionReport XML'),
                   ('{"type":"Feature"}', 'JSON sem FeatureCollection')):
    e = json.loads(run('positions_stats.js', raw))
    check(e['ok'] == 0 and 'error' in e and 'fresh' not in e, 'posições: ' + label + ' gera ok=0')

# 4) LLD só repassa coleta válida
check(json.loads(run('lld_from_stats.js', json.dumps(r))) == r['lld'], 'LLD: lista repassada com coleta válida')
try:
    run('lld_from_stats.js', json.dumps({'ok': 0, 'error': 'x'}))
    check(False, 'LLD deveria falhar')
except dukpy.JSRuntimeError as ex:
    check('Coleta inválida' in str(ex), 'LLD: coleta inválida lança erro e preserva descobertas')

# 5) colecao vazia
e = json.loads(run('positions_stats.js', json.dumps({'type': 'FeatureCollection', 'features': [], 'numberMatched': 0, 'numberReturned': 0})))
check(e['ok'] == 1 and e['total'] == 0 and e['fresh_pct'] == 0 and e['lld'] == [] and 'newest_age' not in e, 'posições: coleção vazia')

# 6) frota: concessionárias, cooperativa e permissionários (pessoas físicas) agregados sem nome
year = dt.datetime.now(dt.timezone.utc).year
fr = [{'type': 'Feature', 'geometry': None, 'properties': p} for p in (
    {'operadora': 'VIAÇÃO PIONEIRA BACIA - 02', 'ano_fabrica': year - 4, 'data_referencia': '2026-10-08Z'},
    {'operadora': 'VIAÇÃO PIONEIRA BACIA - 02', 'ano_fabrica': year - 2, 'data_referencia': '2026-10-08Z'},
    {'operadora': 'COOBRATAETE - BACIA 02', 'ano_fabrica': 1800, 'data_referencia': '2026-10-07Z'},
    {'operadora': 'FULANO DE TAL', 'ano_fabrica': None, 'data_referencia': None},
    {'operadora': 'BELTRANO DA SILVA', 'ano_fabrica': year - 10, 'data_referencia': None},
    {'operadora': None, 'ano_fabrica': year, 'data_referencia': 'x'})]
raw = run('fleet_stats.js', json.dumps({'type': 'FeatureCollection', 'features': fr}))
r = json.loads(raw)
check(r['ok'] == 1 and r['total'] == 6 and r['operators_count'] == 4, 'frota: total preservado, 4 grupos (2 PF viram 1 grupo)')
check('FULANO' not in raw and 'BELTRANO' not in raw, 'frota: nenhum nome de pessoa física na saída')
lld = {x['{#OPERADORA.KEY}']: x for x in r['lld']}
check(lld['STPCR_PERMISSIONARIOS']['{#OPERADORA.SERVICO}'] == 'STPCR' and r['operators']['STPCR_PERMISSIONARIOS']['total'] == 2,
      'frota: permissionários agregados (2 veículos)')
check(lld['VIACAO_PIONEIRA_BACIA_02']['{#OPERADORA.BACIA}'] == '02' and lld['VIACAO_PIONEIRA_BACIA_02']['{#OPERADORA.SERVICO}'] == 'concessão',
      'frota: concessionária com bacia 02')
check(lld['COOBRATAETE_BACIA_02']['{#OPERADORA.SERVICO}'] == 'cooperativa', 'frota: Coobrataete como cooperativa')
check(lld['SEM_OPERADORA']['{#OPERADORA.SERVICO}'] == 'não identificado', 'frota: operadora vazia como não identificado')
check(r['invalid_year'] == 2 and abs(r['avg_age'] - 4) < 0.01, 'frota: anos impossíveis/nulos fora da média')

# 6b) descoberta de operadoras com HttpRequest simulado: tabela id;nome real (camada Horários, 09/10/2026)
HORARIOS = """32441;KAIO HENRIQUE SANTOS NUNES
3262;COOBRATAETE - BACIA 02
3332;WEVERSON MARQUES VELOSO
3437;VIAÇÃO PIRACICABANA - BACIA 01
3441;URBI - MOBILID. URBANA - BACIA 03
3444;AUTO VIAÇÃO MARECHAL - BACIA 04
3449;VIAÇÃO PIONEIRA BACIA - 02
3450;EXPRESSO SÃO JOSÉ BACIA - 05"""
hor = {'type': 'FeatureCollection', 'features': [{'properties': {'id_operadora': int(a), 'nm_operadora': b}}
       for a, b in (l.split(';') for l in HORARIOS.splitlines())] * 3}
posids = [3262, 3332, 3317, 3437, 3441, 3444, 3449, 3450, None]
pos = {'type': 'FeatureCollection', 'features': [{'properties': {'id_operadora': i}} for i in posids]}
mock = """
var __urls = [];
function HttpRequest() { this.s = 200; }
HttpRequest.prototype.get = function (u) {
    __urls.push(u);
    return u.indexOf('ultima_posicao') >= 0 ? dukpy.pos : dukpy.hor;
};
HttpRequest.prototype.getStatus = function () { return this.s; };
"""
code = SCRIPTS['operators_discovery.js']
outraw = dukpy.evaljs(mock + '(function(value){\n' + code + '\n})(dukpy.value)',
                      value=json.dumps({'url': 'https://geoserver.semob.df.gov.br/geoserver/ows', 'count': '10000'}),
                      pos=json.dumps(pos), hor=json.dumps(hor))
o = {x['{#OPERADORA.ID}']: x for x in json.loads(outraw)}
check('WEVERSON' not in outraw and 'KAIO' not in outraw, 'descoberta: nenhum nome de pessoa física na saída')
check(o['3332']['{#OPERADORA.SERVICO}'] == 'STPCR' and o['3332']['{#OPERADORA.NOME}'] == 'STPCR (permissionário)',
      'descoberta: permissionário classificado e anonimizado')
check(o['3449']['{#OPERADORA.NOME}'] == 'VIAÇÃO PIONEIRA BACIA - 02' and o['3449']['{#OPERADORA.BACIA}'] == '02'
      and o['3449']['{#OPERADORA.SERVICO}'] == 'concessão', 'descoberta: 3449 = Pioneira, bacia 02, concessão')
check(o['3262']['{#OPERADORA.SERVICO}'] == 'cooperativa', 'descoberta: 3262 = Coobrataete, cooperativa')
check(o['3317']['{#OPERADORA.SERVICO}'] == 'não identificado' and o['desconhecida']['{#OPERADORA.NOME}'] == 'sem id_operadora',
      'descoberta: código sem nome e id nulo marcados como não identificados')
check('32441' not in o, 'descoberta: só códigos presentes nas posições')
filt = re.compile('^(STPCR|não identificado)$')
kept = sorted(k for k, v in o.items() if not filt.search(v['{#OPERADORA.SERVICO}']))
check(kept == ['3262', '3437', '3441', '3444', '3449', '3450'], 'descoberta: filtro padrão mantém 5 concessionárias + cooperativa')
urls = json.loads(dukpy.evaljs(mock + '(function(value){\n' + code + '\n})(dukpy.value); JSON.stringify(__urls)',
       value=json.dumps({'url': 'https://x/ows', 'count': '10000'}), pos=json.dumps(pos), hor=json.dumps(hor)))
check('typeNames=semob%3AHor%C3%A1rios%20das%20Linhas' in urls[0] and 'count=10000' in urls[1], 'descoberta: URLs codificadas (acento, espaço, dois-pontos)')

# 7) camadas a partir do GetCapabilities (com e sem prefixo de namespace, entidades XML)
caps = ('<wfs:WFS_Capabilities xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns="http://www.opengis.net/wfs/2.0">'
        '<FeatureTypeList><FeatureType xmlns:semob="x"><Name>semob:ultima_posicao</Name><Title>ultima_posicao</Title></FeatureType>'
        '<wfs:FeatureType><wfs:Name>semob:Horários das Linhas</wfs:Name><wfs:Title>Horários &amp; linhas</wfs:Title></wfs:FeatureType>'
        '<FeatureType><Name>semob:Dados de movimento de passageiros (Quantitativo e Financeiro)</Name></FeatureType>'
        '</FeatureTypeList></wfs:WFS_Capabilities>')
l = json.loads(run('layers_lld.js', caps))
check([x['{#CAMADA}'] for x in l] == ['semob:Dados de movimento de passageiros (Quantitativo e Financeiro)', 'semob:Horários das Linhas', 'semob:ultima_posicao'], 'camadas: nomes com acento, espaço e prefixo')
check(l[1]['{#CAMADA.TITULO}'] == 'Horários & linhas' and l[0]['{#CAMADA.TITULO}'] == l[0]['{#CAMADA}'], 'camadas: título decodificado e fallback para Name')
for bad in ('<html>erro</html>', '<wfs:WFS_Capabilities></wfs:WFS_Capabilities>'):
    try:
        run('layers_lld.js', bad); check(False, 'camadas deveria falhar')
    except dukpy.JSRuntimeError:
        check(True, 'camadas: documento inválido ou vazio lança erro')

# 8) volume: 50 000 registros de posição
big = {'type': 'FeatureCollection', 'numberMatched': 50000, 'numberReturned': 50000,
       'features': [{'type': 'Feature', 'geometry': None, 'properties': {'id_operadora': i % 12, 'prefixo': str(i), 'velocidade': str(i % 60),
                     'cd_linha': str(i % 900), 'latitude': -15.8, 'longitude': -47.9, 'dataregistro': iso(i % 600)}} for i in range(50000)]}
payload = json.dumps(big)
t0 = time.time(); r = json.loads(run('positions_stats.js', payload)); el = time.time() - t0
check(r['total'] == 50000, 'volume: 50 000 registros (%.1f MB) em %.2f s no Duktape' % (len(payload) / 1e6, el))
print('\n%d verificações aprovadas' % ok)
