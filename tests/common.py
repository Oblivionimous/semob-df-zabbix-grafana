"""Utilitários dos testes: leitura do template e extração dos scripts JavaScript embutidos nele."""
import pathlib

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "zabbix" / "template_semob_df_geoserver_http.yaml"


def export():
    return yaml.safe_load(TEMPLATE.read_text(encoding="utf-8"))["zabbix_export"]


def scripts():
    """Mapa nome -> código JavaScript, lido do próprio YAML que será importado."""
    t = export()["templates"][0]
    items = {i["key"]: i for i in t["items"]}
    rules = {r["key"]: r for r in t["discovery_rules"]}

    def js(obj):
        return next(s["parameters"][0] for s in obj["preprocessing"] if s["type"] == "JAVASCRIPT")

    return {
        "positions_stats.js": js(items["semob.positions.stats"]),
        "fleet_stats.js": js(items["semob.fleet.stats"]),
        "layers_lld.js": js(rules["semob.wfs.layers.discovery"]),
        "lld_from_stats.js": js(rules["semob.fleet.operators.discovery"]),
        "operators_discovery.js": rules["semob.positions.operators.discovery"]["params"],
    }
