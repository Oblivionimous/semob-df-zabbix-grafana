#!/usr/bin/env python3
"""Gera docs/referencia-template.md a partir do YAML do template, para a documentação nunca divergir do código.

    python tools/gerar_referencia.py            grava o arquivo
    python tools/gerar_referencia.py --check    falha se o arquivo gravado estiver desatualizado
"""
import pathlib
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "zabbix" / "template_semob_df_geoserver_http.yaml"
OUT = ROOT / "docs" / "referencia-template.md"

SEVERIDADE = {"NOT_CLASSIFIED": "Não classificada", "INFO": "Informação", "WARNING": "Atenção",
              "AVERAGE": "Média", "HIGH": "Alta", "DISASTER": "Desastre"}
TIPO = {"HTTP_AGENT": "HTTP agent", "DEPENDENT": "Dependente", "SCRIPT": "Script", "TRAP": "Trapper"}


def cel(texto):
    """Escapa para célula de tabela Markdown."""
    return str(texto if texto is not None else "").replace("\\", "\\\\").replace("|", "\\|").replace("\n", " ").strip()


def code(texto):
    return "`" + cel(texto) + "`"


def tabela(cabecalho, linhas):
    out = ["| " + " | ".join(cabecalho) + " |", "|" + "|".join("---" for _ in cabecalho) + "|"]
    out += ["| " + " | ".join(l) + " |" for l in linhas]
    return "\n".join(out)


def intervalo(obj):
    if obj.get("type") == "DEPENDENT":
        return "dependente"
    return code(obj.get("delay", "1m"))


def gerar():
    data = yaml.safe_load(TEMPLATE.read_text(encoding="utf-8"))["zabbix_export"]
    t = data["templates"][0]
    itens, regras = t["items"], t["discovery_rules"]
    protos = [(r, p) for r in regras for p in r.get("item_prototypes", [])]
    triggers = [("Item", i["key"], tr) for i in itens for tr in i.get("triggers", [])]
    triggers += [("Protótipo", p["key"], tr) for _, p in protos for tr in p.get("trigger_prototypes", [])]
    triggers += [("Web", "", tr) for tr in data.get("triggers", [])]

    o = []
    o.append("# Referência do template\n")
    o.append("Este arquivo é gerado por `tools/gerar_referencia.py` a partir de `zabbix/template_semob_df_geoserver_http.yaml`. "
             "Não edite à mão.\n")
    o.append("Template `%s`, formato de exportação do Zabbix %s.\n" % (t["template"], data["version"]))
    o.append(tabela(["Componente", "Quantidade"], [
        ["Itens", str(len(itens))], ["Regras de descoberta", str(len(regras))], ["Protótipos de item", str(len(protos))],
        ["Triggers e protótipos de trigger", str(len(triggers))],
        ["Gráficos", str(len(data.get("graphs", [])))],
        ["Protótipos de gráfico", str(sum(len(r.get("graph_prototypes", [])) for r in regras))],
        ["Cenários web", str(len(t.get("httptests", [])))], ["Macros", str(len(t["macros"]))],
        ["Dashboards", str(len(t.get("dashboards", [])))], ["Mapeamentos de valor", str(len(t.get("valuemaps", [])))]]))

    o.append("\n## Macros\n")
    o.append("Redefina as macros no host para ajustar intervalos e limiares sem editar o template.\n")
    o.append(tabela(["Macro", "Padrão", "Função"], [[code(m["macro"]), code(m["value"]), cel(m.get("description"))] for m in t["macros"]]))

    o.append("\n## Itens\n")
    o.append(tabela(["Nome", "Chave", "Tipo", "Intervalo", "Unidade", "Descrição"], [
        [cel(i["name"]), code(i["key"]), TIPO.get(i["type"], i["type"]), intervalo(i), cel(i.get("units")), cel(i.get("description"))]
        for i in itens]))

    o.append("\n## Regras de descoberta\n")
    linhas = []
    for r in regras:
        flt = r.get("filter", {}).get("conditions", [])
        filtro = "; ".join("%s %s %s" % (c["macro"], "não casa" if c.get("operator") == "NOT_MATCHES_REGEX" else "casa", c["value"])
                           for c in flt)
        linhas.append([cel(r["name"]), code(r["key"]), TIPO.get(r["type"], r["type"]), intervalo(r), cel(filtro) or "nenhum",
                       cel(r.get("description"))])
    o.append(tabela(["Nome", "Chave", "Tipo", "Intervalo", "Filtro", "Descrição"], linhas))

    o.append("\n### Protótipos de item\n")
    o.append(tabela(["Regra", "Nome", "Chave", "Tipo", "Intervalo", "Unidade"], [
        [code(r["key"]), cel(p["name"]), code(p["key"]), TIPO.get(p["type"], p["type"]), intervalo(p), cel(p.get("units"))]
        for r, p in protos]))

    o.append("\n## Triggers\n")
    o.append(tabela(["Origem", "Nome", "Severidade", "Expressão", "Descrição"], [
        [orig, cel(tr["name"]), SEVERIDADE.get(tr.get("priority", "NOT_CLASSIFIED"), tr.get("priority")),
         code(tr["expression"]), cel(tr.get("description"))] for orig, _, tr in triggers]))
    o.append("\nAs triggers de coleta dependem da trigger de falha do cenário web, para que uma queda do GeoServer gere um único alerta.\n")

    o.append("\n## Gráficos\n")
    graficos = [(g["name"], [gi["item"]["key"] for gi in g["graph_items"]]) for g in data.get("graphs", [])]
    graficos += [(g["name"] + " (protótipo)", [gi["item"]["key"] for gi in g["graph_items"]])
                 for r in regras for g in r.get("graph_prototypes", [])]
    o.append(tabela(["Gráfico", "Itens"], [[cel(n), ", ".join(code(k) for k in ks)] for n, ks in graficos]))

    o.append("\n## Cenário web\n")
    for w in t.get("httptests", []):
        o.append("Cenário `%s`, intervalo %s, %s tentativas.\n" % (w["name"], code(w["delay"]), w.get("attempts", "1")))
        o.append(tabela(["Etapa", "Consulta", "Texto exigido"], [
            [cel(s["name"]), cel("&".join("%s=%s" % (q["name"], q["value"]) for q in s.get("query_fields", []))),
             code(s.get("required", ""))] for s in w["steps"]]))

    o.append("\n## Dashboard do template\n")
    for d in t.get("dashboards", []):
        o.append("Dashboard `%s`.\n" % d["name"])
        for pg in d["pages"]:
            nomes = [w.get("name") or w["type"] for w in pg["widgets"]]
            o.append("- Página %s com %d widgets: %s." % (code(pg.get("name", "")), len(nomes), ", ".join(cel(n) for n in nomes)))
        o.append("")

    o.append("\n## Mapeamentos de valor\n")
    o.append(tabela(["Nome", "Valores"], [
        [cel(v["name"]), ", ".join("%s = %s" % (m["value"], m["newvalue"]) for m in v["mappings"])] for v in t.get("valuemaps", [])]))
    return "\n".join(o).rstrip() + "\n"


def main(argv):
    texto = gerar()
    if "--check" in argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != texto:
            sys.exit("docs/referencia-template.md está desatualizado. Rode: python tools/gerar_referencia.py")
        print("OK: docs/referencia-template.md está atualizado")
        return
    OUT.write_text(texto, encoding="utf-8")
    print("gerado:", OUT.relative_to(ROOT), "(%d linhas)" % texto.count("\n"))


if __name__ == "__main__":
    main(sys.argv)
