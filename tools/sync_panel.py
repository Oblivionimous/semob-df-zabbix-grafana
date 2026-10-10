#!/usr/bin/env python3
"""Mantém o painel do Grafana (JavaScript, CSS e logo) em arquivos editáveis e dentro do JSON importável.

    python tools/sync_panel.py extract   JSON -> grafana/src/panel.js, panel.css, logo-gdf.png
    python tools/sync_panel.py build     grafana/src/* -> JSON
    python tools/sync_panel.py --check   falha se o JSON e os arquivos de src divergirem

O logo fica em src/logo-gdf.png e entra no JavaScript como data URI no lugar do marcador LOGO_PLACEHOLDER.
"""
import base64
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DASH = ROOT / "grafana" / "dashboard_semob_df.json"
SRC = ROOT / "grafana" / "src"
JS, CSS, LOGO = SRC / "panel.js", SRC / "panel.css", SRC / "logo-gdf.png"
LOGO_PLACEHOLDER = "__LOGO_GDF_DATA_URI__"
DATA_URI = re.compile(r"data:image/png;base64,([A-Za-z0-9+/=]+)")


def load():
    return json.loads(DASH.read_text(encoding="utf-8"))


def panel(dash):
    panels = [p for p in dash["panels"] if p["type"] == "marcusolsson-dynamictext-panel"]
    if len(panels) != 1:
        sys.exit("O dashboard deve ter exatamente um painel Business Text, achei %d." % len(panels))
    return panels[0]


def canon(text):
    """Um único \\n no fim, como o Grafana exporta e como os editores gravam."""
    return text.rstrip("\n") + "\n"


def extract():
    dash = load()
    opts = panel(dash)["options"]
    uris = DATA_URI.findall(opts["afterRender"])
    if len(uris) != 1:
        sys.exit("Esperava 1 logo em data URI no JavaScript, achei %d." % len(uris))
    SRC.mkdir(parents=True, exist_ok=True)
    LOGO.write_bytes(base64.b64decode(uris[0]))
    JS.write_text(canon(DATA_URI.sub(LOGO_PLACEHOLDER, opts["afterRender"])), encoding="utf-8")
    CSS.write_text(canon(opts["styles"]), encoding="utf-8")
    print("extraído:", JS.relative_to(ROOT), CSS.relative_to(ROOT), LOGO.relative_to(ROOT))


def compose():
    dash = load()
    opts = panel(dash)["options"]
    uri = "data:image/png;base64," + base64.b64encode(LOGO.read_bytes()).decode("ascii")
    js = canon(JS.read_text(encoding="utf-8"))
    if js.count(LOGO_PLACEHOLDER) != 1:
        sys.exit("panel.js deve conter o marcador %s exatamente uma vez." % LOGO_PLACEHOLDER)
    opts["afterRender"] = js.replace(LOGO_PLACEHOLDER, uri)
    opts["styles"] = canon(CSS.read_text(encoding="utf-8"))
    return dash


def dump(dash):
    return json.dumps(dash, ensure_ascii=False, indent=2) + "\n"


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "extract":
        extract()
    elif cmd == "build":
        DASH.write_text(dump(compose()), encoding="utf-8")
        print("gerado:", DASH.relative_to(ROOT))
    elif cmd == "--check":
        if compose() != load():
            sys.exit("grafana/src diverge do JSON. Rode: python tools/sync_panel.py build")
        print("OK: grafana/src e dashboard_semob_df.json estão sincronizados")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
