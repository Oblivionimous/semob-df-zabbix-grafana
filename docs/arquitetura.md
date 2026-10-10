# Arquitetura

Este documento explica como o template e o dashboard funcionam e por que foram desenhados assim. A lista completa de itens, triggers e macros está em [referencia-template.md](referencia-template.md).

## Fonte de dados e forma de coleta

O GeoServer da SEMOB publica os dados por WFS 2.0 e WMS 1.3.0, com leitura anônima. Não há agente nem credencial. Por isso o template usa HTTP agent e cenário web, executados pelo Zabbix server ou proxy. A única exigência de rede é HTTPS de saída e DNS.

Um agente ativo ou uma coleta por SSH exigiria um script no Linux e não traria dados a mais.

## Hierarquia dos itens

Cada consulta ao GeoServer gera um item mestre e vários itens dependentes.

```text
Posições: resposta WFS            HTTP agent, 1 vez por minuto, sem histórico
  └─ Posições: resumo calculado   Dependente, JavaScript, histórico de 1 hora
       ├─ coleta válida, resposta completa, registros retornados
       ├─ veículos recentes, em movimento, sem linha, linhas e operadoras ativas
       ├─ idade do registro mais recente, velocidade média
       └─ coordenadas inválidas, datas inválidas, duplicidades, velocidades não numéricas
```

A frota e o catálogo de camadas seguem o mesmo desenho. O template tem no máximo dois níveis de dependência.

A resposta completa de posições tem cerca de 1 MB. O histórico do tipo Text do Zabbix aceita 65536 bytes no MySQL e 65536 caracteres no PostgreSQL. Por isso o item mestre não guarda histórico. O JavaScript resume a resposta em um JSON pequeno, e os itens dependentes extraem números dele com JSONPath.

### Falha de coleta

Uma falha HTTP não torna o item não suportado. Um passo de pré-processamento troca o erro pelo valor `SEMOB_HTTP_ERROR`. O script de resumo reconhece o valor e devolve `ok` igual a 0 com a mensagem de erro. O item `coleta válida` registra 0, e a trigger de falha dispara depois de três coletas seguidas inválidas.

O mesmo cuidado vale para a descoberta. Se a coleta falhar, o script de descoberta lança um erro. O Zabbix mantém os recursos já descobertos em vez de apagá-los.

## Descoberta

| Regra | Origem | O que cria |
|---|---|---|
| Descoberta de operadoras nas posições | Regra do tipo Script, a cada hora | Quatro itens e um gráfico por empresa, com contagens de veículos |
| Descoberta de operadoras na frota | Resumo da frota | Dois itens por empresa, com veículos cadastrados e idade média |
| Descoberta de camadas WFS | GetCapabilities | Um contador de registros por camada, com duas triggers |

### Nomes e classificação das empresas

A camada de posições traz só o código `id_operadora`. O nome vem da camada Horários das Linhas, que publica `id_operadora` e `nm_operadora`. A regra Script lê as duas camadas e traduz os códigos. Nenhum nome fica fixo no template.

A classificação usa o nome publicado pela SEMOB.

| O nome contém | Etiqueta `servico` | Etiqueta `bacia` |
|---|---|---|
| `BACIA` | `concessão` | Número da bacia, de 01 a 05 |
| `COOBRATAETE` | `cooperativa` | `02` |
| Qualquer outro nome | `STPCR` | `sem bacia` |
| Código sem nome na camada | `não identificado` | `sem bacia` |

### Pessoas físicas

Os permissionários do STPCR são pessoas físicas. O script troca o nome por `STPCR (permissionário)` antes de devolver a lista. A macro `{$SEMOB.OPERADORA.SERVICO.EXCLUIR}` tem como padrão `^(STPCR|não identificado)$`, e o filtro da regra descarta esses valores. Eles não geram itens.

Na frota, os permissionários viram uma única entrada, `STPCR (permissionários)`, com o total de veículos e a idade média. Os totais gerais continuam contando todos os veículos.

## Triggers

As triggers de coleta dependem da trigger de falha do cenário web. Quando o GeoServer cai, o operador recebe um alerta e não uma cascata. Os limiares ficam em macros, como `{$SEMOB.POS.AGE.MAX}` para o atraso do feed.

A trigger de atraso do feed tem severidade Alta. As de falha da coleta de posições e de falha do cenário web têm severidade Média. As demais têm severidade Atenção ou Informação.

## Cenário web

O cenário `SEMOB GeoServer` roda a cada cinco minutos, com três etapas. Cada etapa exige um texto na resposta, o que detecta uma página de erro com código 200.

| Etapa | Texto exigido |
|---|---|
| WFS GetCapabilities | `WFS_Capabilities` |
| WFS GetFeature, com `count=1` | `FeatureCollection` |
| WMS GetCapabilities | `WMS_Capabilities` |

Os itens `web.test.*` alimentam o gráfico de tempo de resposta e a trigger de lentidão.

## Dashboard do template

O template inclui um dashboard com duas páginas, Operação e Qualidade e cadastros. Ele usa só widgets que o Zabbix 7.0 aceita em dashboards de template. Os widgets que listam itens descobertos usam padrões de nome, como `Operadora [*]: veículos com registro recente`, e por isso ficam vazios até a primeira descoberta.

Os itens de frota e de camadas coletam de hora em hora. A pizza da frota por empresa usa a janela dos últimos 2 dias, para sempre encontrar um valor.

## Painel do Grafana

O dashboard do Grafana tem um único painel Business Text. O JavaScript do painel monta toda a interface a partir de sete consultas.

| Consulta | Fonte | Uso |
|---|---|---|
| A | Infinity, camada `semob:ultima_posicao` | Posições, velocidade, rumo, linha e horário do sinal |
| B | Zabbix, itens `Operadora [...]` | Nomes das empresas e séries por empresa |
| C | Zabbix, itens `Posições: ...` | Tendência dos indicadores e qualidade do feed |
| D | Zabbix, itens `Frota...` e `WFS: camadas publicadas` | Cadastro de veículos |
| E | Zabbix, itens `Camada [...]: registros` | Catálogo de camadas |
| F | Zabbix, itens do cenário web | Tempo de resposta do GeoServer |
| G | Zabbix, problemas | Triggers ativas do host |

O painel usa o modo de renderização `data`, que esconde o seletor de quadros do Business Text. O script lê os quadros por `context.panelData`.

### Mapa

O mapa usa Leaflet 1.9.4, carregado do cdnjs, com o mapa base do OpenStreetMap. O script esconde `window.define` durante o carregamento, porque o Grafana expõe um carregador AMD que impediria o Leaflet de criar `window.L`.

Cada veículo é um círculo na cor da empresa. Círculos maiores estão em movimento e têm um traço no rumo, com comprimento proporcional à velocidade. A opacidade cai conforme a idade do sinal. A busca por linha ou prefixo funciona antes de o mapa carregar, e o mapa só acrescenta o destaque.

Se o Leaflet não carregar em 8 segundos, o painel desenha a dispersão das coordenadas em um canvas e avisa na tela. Se só o mapa base do OpenStreetMap estiver bloqueado, o Leaflet funciona e os pontos aparecem sobre um fundo vazio.

### Filtros

Os filtros de empresa e de linha rodam no servidor Grafana, na expressão `filterExpression` da consulta A.

```text
(id_operadora ?? 'desconhecida') =~ '^${operadora:regex}$' && startswith(cd_linha ?? '', '${linha}')
```

A janela de tempo roda no navegador. Os indicadores de idade do sinal usam toda a base, inclusive os registros antigos.

### Erros de montagem

Todo o script roda dentro de um `try`. Se algo falhar, o painel mostra uma caixa vermelha com a mensagem e grava o erro no console do navegador com o prefixo `[SEMOB]`. Um erro nunca deixa o painel em branco.

### Estado entre atualizações

O dashboard atualiza a cada minuto. O painel guarda em `window` a aba ativa, o zoom do mapa e as empresas ocultas, para a atualização não reiniciar a tela.

## Carga sobre o GeoServer

| Origem | Frequência | Tamanho aproximado |
|---|---|---|
| Item de posições no Zabbix | A cada minuto | Até cerca de 1 MB |
| Regra Script de operadoras | A cada hora | Posições e camada Horários das Linhas |
| Frota | A cada hora | Cadastro de cerca de 3 mil veículos |
| Cada dashboard aberto no Grafana | A cada atualização, 1 minuto | Cerca de 1 MB |
| Cenário web | A cada 5 minutos | Dezenas de KB, com `count=1` na etapa de posições |

A SEMOB não publica limite de uso. Os intervalos são pontos de partida e podem ser ampliados por macros.
