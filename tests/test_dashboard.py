"""Valida o dashboard do Grafana contra o template do Zabbix e contra o próprio script do painel."""
import json
import re
import sys

from common import ROOT, export

DASH = json.loads((ROOT / "grafana" / "dashboard_semob_df.json").read_text(encoding="utf-8"))
PANEL_JS = (ROOT / "grafana" / "src" / "panel.js").read_text(encoding="utf-8")
ok = 0


def check(cond, msg):
    global ok
    if not cond:
        print("FALHA", msg)
        sys.exit(1)
    ok += 1
    print("OK  ", msg)


def js_regex(literal):
    """Converte /padrão/flags de JavaScript em re do Python (os padrões usados são compatíveis)."""
    body, flags = re.match(r"^/(.*)/([a-z]*)$", literal, re.S).groups()
    return re.compile(body, re.I if "i" in flags else 0)


# nomes que os itens do template terão num host, com valores realistas nas macros LLD
t = export()["templates"][0]
OPERADORAS = [("3437", "VIAÇÃO PIRACICABANA - BACIA 01"), ("3449", "VIAÇÃO PIONEIRA BACIA - 02"),
              ("3441", "URBI - MOBILID. URBANA - BACIA 03"), ("3444", "AUTO VIAÇÃO MARECHAL - BACIA 04"),
              ("3450", "EXPRESSO SÃO JOSÉ BACIA - 05"), ("3262", "COOBRATAETE - BACIA 02"),
              ("0", "STPCR (permissionário)")]
names = [i["name"] for i in t["items"]]
for rule in t["discovery_rules"]:
    for proto in rule["item_prototypes"]:
        for oid, nome in OPERADORAS:
            names.append(proto["name"].replace("{#OPERADORA.ID}", oid).replace("{#OPERADORA.NOME}", nome)
                         .replace("{#CAMADA}", "semob:ultima_posicao"))
web = t["httptests"][0]
for step in web["steps"]:
    names.append('Response time for step "%s" of scenario "%s".' % (step["name"], web["name"]))

# estrutura
panels = DASH["panels"]
check(len(panels) == 1 and panels[0]["type"] == "marcusolsson-dynamictext-panel", "um único painel Business Text, sem rows")
panel = panels[0]
check(panel["options"]["renderMode"] == "data", "renderMode data (sem seletor de quadro)")
check({i["name"] for i in DASH["__inputs"]} == {"DS_ZABBIX", "DS_INFINITY"}, "entradas de importação DS_ZABBIX e DS_INFINITY")
check(DASH["uid"] and DASH["title"], "uid e título definidos")

# data sources
uids = {panel["datasource"]["uid"]} | {tg["datasource"]["uid"] for tg in panel["targets"]}
dash_uids = {v["datasource"]["uid"] for v in DASH["templating"]["list"] if isinstance(v.get("datasource"), dict)}
check((uids | dash_uids) <= {"${DS_ZABBIX}", "${DS_INFINITY}", "-- Mixed --"}, "data sources usam só as entradas de importação")

# variáveis do Grafana: só as consultas e as chamadas rv('...') do script são interpoladas pelo Grafana
declared = {v["name"] for v in DASH["templating"]["list"]}
scope = json.dumps(panel["targets"]) + " ".join(re.findall(r"\brv\(\s*'([^']*)'", PANEL_JS))
used = set(re.findall(r"\$\{(\w+)", scope)) | set(re.findall(r"\$(\w+)", scope))
used -= {"DS_ZABBIX", "DS_INFINITY"}
check(used <= declared, "variáveis usadas %s estão declaradas %s" % (sorted(used), sorted(declared)))

# consultas do Zabbix contra os nomes do template
refs = [tg["refId"] for tg in panel["targets"]]
check(refs == list("ABCDEFG"), "consultas A a G na ordem esperada")
for tg in panel["targets"]:
    if tg.get("queryType") == "0":
        rx = js_regex(tg["item"]["filter"])
        hits = [n for n in names if rx.search(n)]
        check(hits, "consulta %s: filtro %s casa %d nomes de item" % (tg["refId"], tg["item"]["filter"], len(hits)))
check(any(tg.get("queryType") == "5" for tg in panel["targets"]), "consulta G de problemas do Zabbix")

# expressões regulares que o script do painel aplica aos nomes das séries
literal = re.compile(r"\b(?:zall|zone|zlast|zser)\((/(?:\\/|[^/\n])+/[a-z]*)\)")
found = sorted(set(literal.findall(PANEL_JS)))
check(found, "o script do painel lê séries do Zabbix por %d expressões" % len(found))
for lit in found:
    rx = js_regex(lit)
    hits = [n for n in names if rx.search(n)]
    check(hits, "painel: %s casa %d nomes de item do template" % (lit, len(hits)))
print("\n%d verificações aprovadas" % ok)
