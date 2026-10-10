# Desenvolvimento

## Estrutura do repositório

```text
.
├── README.md
├── .gitignore
├── .github/workflows/ci.yml
├── zabbix/
│   └── template_semob_df_geoserver_http.yaml
├── grafana/
│   ├── dashboard_semob_df.json
│   └── src/
│       ├── panel.js
│       ├── panel.css
│       └── logo-gdf.png
├── docs/
│   ├── instalacao.md
│   ├── arquitetura.md
│   ├── dados-semob.md
│   ├── operacao.md
│   ├── desenvolvimento.md
│   └── referencia-template.md
├── tools/
│   ├── sync_panel.py
│   └── gerar_referencia.py
└── tests/
    ├── common.py
    ├── test_template.py
    ├── test_scripts.py
    ├── test_dashboard.py
    ├── panel.test.js
    ├── package.json
    ├── package-lock.json
    └── requirements.txt
```

O arquivo `docs/referencia-template.md` é gerado. Os arquivos `zabbix/*.yaml` e `grafana/dashboard_semob_df.json` são os artefatos importáveis, e os testes leem direto deles.

## Editar o template

O YAML é a fonte da verdade. Os scripts JavaScript ficam embutidos nele.

1. Importe o YAML no Zabbix de testes.
2. Faça a alteração no frontend.
3. Exporte o template em YAML, em Data collection, Templates, Export.
4. Substitua `zabbix/template_semob_df_geoserver_http.yaml` pelo arquivo exportado.
5. Rode `python tools/gerar_referencia.py` e os testes.

O Zabbix reordena chaves e omite valores padrão ao exportar. Por isso, uma exportação pode gerar um diff maior que a alteração feita. Revise o diff antes do commit.

Mantenha os UUIDs. Eles garantem que reimportar o template atualize os mesmos objetos em vez de criar cópias.

### Convenções

| Item | Convenção |
|---|---|
| Macros | Prefixo `SEMOB.`, como `{$SEMOB.POS.INTERVAL}` |
| Chaves de item | `semob.<assunto>.<métrica>`, como `semob.positions.fresh` |
| Itens mestres | Histórico 0, resumo calculado por JavaScript no item dependente |
| Triggers | Dependem da trigger de falha do cenário web |
| Etiqueta `component` | `posicoes`, `frota`, `camadas`, `disponibilidade`, `qualidade` |
| Etiqueta `scope` nas triggers | `availability`, `quality`, `performance`, `inventory` |
| Etiquetas de empresa | `operadora`, `operadora_id`, `bacia`, `servico` nos protótipos |
| Descrições | Em português, sem unidade inventada. Campos sem unidade documentada ficam sem unidade |

## Editar o painel do Grafana

O JavaScript, o CSS e o logo do painel ficam em `grafana/src/`. O JSON importável contém uma cópia deles.

```bash
python tools/sync_panel.py build      # grafana/src -> grafana/dashboard_semob_df.json
python tools/sync_panel.py --check    # falha se o JSON e grafana/src divergirem
python tools/sync_panel.py extract    # JSON -> grafana/src
```

Edite `panel.js` e `panel.css` e rode `build`. Se alguém editar o painel no Grafana e exportar o JSON, copie o arquivo para `grafana/dashboard_semob_df.json` e rode `extract`.

O logo entra no JavaScript como data URI. Em `panel.js` ele aparece como o marcador `__LOGO_GDF_DATA_URI__`, e o `build` o troca pelo conteúdo de `logo-gdf.png`.

O script do painel é o corpo de uma função, sem `import` nem `export`. O Business Text o executa com o objeto `context`. Ele precisa devolver, no fim, a função que desmonta o painel.

## Testes

```bash
pip install -r tests/requirements.txt
npm ci --prefix tests
```

| Comando | O que verifica |
|---|---|
| `python tools/sync_panel.py --check` | O JSON do dashboard e `grafana/src` estão sincronizados |
| `python tools/gerar_referencia.py --check` | `docs/referencia-template.md` reflete o YAML |
| `python tests/test_template.py` | UUIDv4 únicos, chaves sem duplicidade, mestres existentes, no máximo três níveis de dependência, dependências de triggers, referências de gráficos e widgets, macros usadas e definidas, widgets sem sobreposição e JSONPath contra a saída real dos scripts |
| `python tests/test_scripts.py` | Os scripts JavaScript do template no motor Duktape, com casos de vírgula decimal, datas inválidas, duplicidades, coordenadas inválidas, resposta truncada, ExceptionReport, coleção vazia, nomes de pessoas físicas e 50 mil registros |
| `python tests/test_dashboard.py` | Um painel, data sources por entrada de importação, variáveis declaradas e filtros das consultas e do script batendo com os nomes dos itens do template |
| `npm test --prefix tests` | O painel em jsdom com Leaflet real, com abas, cartões, busca, problemas, queda para a dispersão sem Leaflet e caixa de erro |

### Limites dos testes

- O pacote `dukpy` usa o Duktape, o mesmo motor de JavaScript do Zabbix. A versão embutida pode diferir da do seu Zabbix.
- O jsdom não renderiza visualmente. Os testes não confirmam a aparência, o CSS aplicado nem o desempenho com 3,6 mil pontos num navegador real.
- Nenhum teste fala com o GeoServer da SEMOB. Os dados são sintéticos e seguem o formato observado.
- Nenhum teste importa o template num Zabbix. A importação no frontend é a validação final.

### Validação do esquema do Zabbix

O repositório não inclui um validador do esquema de importação. Durante o desenvolvimento, o YAML foi validado com o validador do próprio frontend do Zabbix. A classe foi a `C70XmlValidator`, do ramo `release/7.0` do repositório `zabbix/zabbix`, com `CYamlImportReader` e o pacote `symfony/yaml` 5.1.3. As expressões de trigger passaram por `CExpressionParser` e `CExpressionValidator`.

Para repetir a validação, clone o ramo `release/7.0` do Zabbix e execute essas classes em PHP. Alterações no template devem ser conferidas também pela importação num Zabbix de testes.

## Integração contínua

O workflow `.github/workflows/ci.yml` roda os mesmos comandos da tabela de testes a cada push e pull request, em `ubuntu-latest`, com Python 3.12 e Node 22.

Ele foi escrito junto com o repositório e os comandos foram executados localmente. Na preparação do repositório, o workflow ainda não rodou no GitHub. Confira a primeira execução na aba Actions.

## Publicar no GitHub

Os comandos criam o repositório local e enviam para um remoto vazio. Substitua `URL_DO_REPOSITORIO` pelo endereço do repositório.

```bash
git init -b main
git add .
git commit -m "Template Zabbix e dashboard Grafana da frota da SEMOB DF"
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

Antes de publicar, confira três pontos.

1. O repositório não tem licença. Escolha uma e adicione o arquivo `LICENSE`.
2. O arquivo `grafana/src/logo-gdf.png` é o logo do Governo do Distrito Federal. Confirme a autorização de uso.
3. Nenhum arquivo do repositório contém credenciais. Os exemplos usam `COLE_O_TOKEN_AQUI` e `SEU_FRONTEND` como marcadores.

Para marcar uma versão, use uma etiqueta.

```bash
git tag -a v1.0.0 -m "Primeira versão"
git push origin v1.0.0
```
