# Referência do template

Este arquivo é gerado por `tools/gerar_referencia.py` a partir de `zabbix/template_semob_df_geoserver_http.yaml`. Não edite à mão.

Template `SEMOB DF GeoServer by HTTP`, formato de exportação do Zabbix 7.0.

| Componente | Quantidade |
|---|---|
| Itens | 29 |
| Regras de descoberta | 3 |
| Protótipos de item | 7 |
| Triggers e protótipos de trigger | 14 |
| Gráficos | 6 |
| Protótipos de gráfico | 1 |
| Cenários web | 1 |
| Macros | 21 |
| Dashboards | 1 |
| Mapeamentos de valor | 2 |

## Macros

Redefina as macros no host para ajustar intervalos e limiares sem editar o template.

| Macro | Padrão | Função |
|---|---|---|
| `{$SEMOB.URL}` | `https://geoserver.semob.df.gov.br/geoserver/ows` | Endpoint OGC (WFS/WMS) do GeoServer da SEMOB/DF. |
| `{$SEMOB.TIMEOUT}` | `30s` | Timeout dos HTTP agents e das etapas do cenário web. Máximo 10m no Zabbix 7.0. |
| `{$SEMOB.POS.INTERVAL}` | `1m` | Intervalo da coleta de posições. Ponto de partida, não publicado pela SEMOB. |
| `{$SEMOB.POS.COUNT}` | `10000` | Parâmetro count do GetFeature de posições. Em 09/10/2026 a camada tinha 3619 registros. |
| `{$SEMOB.POS.FRESH.MAX}` | `300` | Idade máxima de dataregistro, em segundos, para considerar o registro recente. |
| `{$SEMOB.POS.STALE.MIN}` | `86400` | Idade, em segundos, a partir da qual o registro é considerado antigo. |
| `{$SEMOB.POS.AGE.MAX}` | `600` | Atraso máximo, em segundos, do registro mais recente antes do alerta. |
| `{$SEMOB.POS.NODATA}` | `10m` | Janela sem valores de coleta antes do alerta de nodata. |
| `{$SEMOB.POS.INVALID.MAX}` | `0` | Quantidade tolerada de coordenadas inválidas. |
| `{$SEMOB.FLEET.INTERVAL}` | `1h` | Intervalo da coleta da camada de frota. A descoberta só é reprocessada quando a lista muda. |
| `{$SEMOB.FLEET.COUNT}` | `50000` | Parâmetro count do GetFeature de frota. Em 09/10/2026 eram 3172 registros. |
| `{$SEMOB.FLEET.REF.MAX}` | `3d` | Idade máxima aceita para a maior data_referencia da frota. |
| `{$SEMOB.OPERADORAS.INTERVAL}` | `1h` | Intervalo da descoberta de operadoras. Cada execução baixa as posições e a camada Horários das Linhas, com dois campos. |
| `{$SEMOB.OPERADORA.SERVICO.EXCLUIR}` | `^(STPCR\|não identificado)$` | Regex de serviços excluídos da descoberta de operadoras. Padrão: permissionários pessoas físicas e códigos sem nome. |
| `{$SEMOB.CAPS.INTERVAL}` | `1h` | Intervalo do GetCapabilities. A descoberta de camadas só é reprocessada quando a lista muda. |
| `{$SEMOB.LAYER.INTERVAL}` | `1h` | Intervalo dos contadores resultType=hits por camada (resposta de poucos bytes). |
| `{$SEMOB.LAYER.NODATA}` | `1d` | Janela sem contagem de uma camada antes do alerta. |
| `{$SEMOB.LAYER.MATCHES}` | `.*` | Regex de camadas incluídas na descoberta. |
| `{$SEMOB.LAYER.NOT_MATCHES}` | `passageiros` | Regex de camadas excluídas da descoberta. |
| `{$SEMOB.WEB.INTERVAL}` | `5m` | Intervalo do cenário web de disponibilidade. |
| `{$SEMOB.RESP.MAX}` | `5` | Tempo médio máximo, em segundos, da etapa WFS GetFeature. |

## Itens

| Nome | Chave | Tipo | Intervalo | Unidade | Descrição |
|---|---|---|---|---|---|
| Posições: resposta WFS | `semob.positions.raw` | HTTP agent | `{$SEMOB.POS.INTERVAL}` |  | GetFeature da camada semob:ultima_posicao sem geometria e sem IMEI. Resposta mantida só em memória (histórico 0) porque o JSON completo (~1 MB) excede o limite de 64 KB do histórico Text. Falha HTTP é convertida em SEMOB_HTTP_ERROR para que o item "coleta válida" registre 0. |
| Posições: resumo calculado | `semob.positions.stats` | Dependente | dependente |  | JSON intermediário calculado por JavaScript. Mestre dos indicadores e da descoberta de operadoras. Histórico de 1h apenas para diagnóstico. |
| Posições: coleta válida | `semob.positions.ok` | Dependente | dependente |  | 1 quando a resposta é uma FeatureCollection GeoJSON. 0 em falha HTTP, ExceptionReport ou JSON inválido. |
| Posições: resposta completa | `semob.positions.complete` | Dependente | dependente |  | 1 quando numberReturned alcança numberMatched. 0 indica truncamento por count ou total desconhecido. |
| Posições: registros na camada | `semob.positions.matched` | Dependente | dependente |  | numberMatched publicado pelo GeoServer. É contagem de registros, não de veículos em operação. |
| Posições: registros retornados | `semob.positions.returned` | Dependente | dependente |  | Quantidade de feições recebidas nesta coleta. |
| Posições: veículos com registro recente | `semob.positions.fresh` | Dependente | dependente |  | Registros com dataregistro de até {$SEMOB.POS.FRESH.MAX} segundos. Idade de dataregistro não comprova idade da posição GPS. |
| Posições: percentual de registros recentes | `semob.positions.fresh_pct` | Dependente | dependente | % | Registros recentes divididos pelo total da camada. Varia ao longo do dia conforme a frota em operação. |
| Posições: veículos recentes em movimento | `semob.positions.moving` | Dependente | dependente |  | Registros recentes com velocidade maior que zero. |
| Posições: registros com mais de 24 horas | `semob.positions.stale` | Dependente | dependente |  | Registros com dataregistro acima de {$SEMOB.POS.STALE.MIN} segundos. Indicam veículos sem transmissão. |
| Posições: veículos recentes sem linha | `semob.positions.no_line` | Dependente | dependente |  | Registros recentes com cd_linha vazio. |
| Posições: linhas com veículo recente | `semob.positions.lines_active` | Dependente | dependente |  | Valores distintos de cd_linha entre os registros recentes. |
| Posições: operadoras com veículo recente | `semob.positions.operators_active` | Dependente | dependente |  | Valores distintos de id_operadora entre os registros recentes. |
| Posições: idade do registro mais recente | `semob.positions.newest_age` | Dependente | dependente | s | Segundos entre o horário do servidor Zabbix e o maior dataregistro válido. Mede atraso do feed. Depende do relógio do server/proxy sincronizado (NTP). |
| Posições: velocidade média reportada | `semob.positions.speed_avg` | Dependente | dependente | km/h | Média do campo velocidade dos veículos recentes em movimento. Unidade km/h, conforme o Anexo Único da Portaria SEMOB nº 89/2019. Vírgula decimal é convertida. |
| Posições: coordenadas inválidas | `semob.positions.invalid_coords` | Dependente | dependente |  | Latitude/longitude nulas, fora dos limites globais ou iguais a (0,0). Não verifica se o ponto está no DF. |
| Posições: datas inválidas ou futuras | `semob.positions.invalid_timestamps` | Dependente | dependente |  | dataregistro ausente, fora do formato ISO 8601 ou mais de 120 s no futuro. |
| Posições: duplicidades operadora e prefixo | `semob.positions.duplicates` | Dependente | dependente |  | Registros que repetem o par id_operadora + prefixo no mesmo snapshot. |
| Posições: velocidades não numéricas | `semob.positions.speed_errors` | Dependente | dependente |  | Valores de velocidade preenchidos que não convertem para número. |
| Frota: resposta WFS | `semob.fleet.raw` | HTTP agent | `{$SEMOB.FLEET.INTERVAL}` |  | GetFeature da camada semob:Frota por Operadora sem placa. Resposta mantida só em memória. |
| Frota: resumo calculado | `semob.fleet.stats` | Dependente | dependente |  | JSON intermediário com totais, idade média e frota por operadora. |
| Frota: coleta válida | `semob.fleet.ok` | Dependente | dependente |  | 1 quando a resposta é uma FeatureCollection GeoJSON. |
| Frota: veículos cadastrados | `semob.fleet.total` | Dependente | dependente |  | Registros da camada de frota. Cadastro, não veículos em operação. |
| Frota: operadoras cadastradas | `semob.fleet.operators` | Dependente | dependente |  | Valores distintos do campo operadora. |
| Frota: idade média | `semob.fleet.avg_age` | Dependente | dependente | anos | Ano corrente menos ano_fabrica. Anos nulos, anteriores a 1950 ou futuros ficam fora da média. |
| Frota: ano de fabricação inválido | `semob.fleet.invalid_year` | Dependente | dependente |  | Registros sem ano_fabrica utilizável. |
| Frota: idade da data de referência | `semob.fleet.ref_age` | Dependente | dependente | s | Tempo desde a maior data_referencia publicada. |
| WFS: GetCapabilities | `semob.wfs.capabilities` | HTTP agent | `{$SEMOB.CAPS.INTERVAL}` |  | Documento de capacidades do WFS. Mestre da descoberta de camadas. |
| WFS: camadas publicadas | `semob.wfs.layers` | Dependente | dependente |  | Quantidade de FeatureType no GetCapabilities. Em 09/10/2026 eram 14. |

## Regras de descoberta

| Nome | Chave | Tipo | Intervalo | Filtro | Descrição |
|---|---|---|---|---|---|
| Descoberta de operadoras nas posições | `semob.positions.operators.discovery` | Script | `{$SEMOB.OPERADORAS.INTERVAL}` | {#OPERADORA.SERVICO} não casa {$SEMOB.OPERADORA.SERVICO.EXCLUIR} | Script: lê os id_operadora das posições e traduz para nome pela camada "Horários das Linhas". Classifica pelo nome publicado: BACIA = concessão, COOBRATAETE = cooperativa, demais = STPCR. Permissionários do STPCR são pessoas físicas: o nome é substituído no script e, pelo filtro padrão, eles e os códigos sem nome não geram itens. Os totais gerais continuam incluindo todos os veículos. |
| Descoberta de operadoras na frota | `semob.fleet.operators.discovery` | Dependente | dependente | nenhum | Uma entrada por operadora da camada de frota. {#OPERADORA.KEY} é o nome sem acentos. Permissionários do STPCR (pessoas físicas) são somados em uma única entrada, sem nomes. |
| Descoberta de camadas WFS | `semob.wfs.layers.discovery` | Dependente | dependente | {#CAMADA} casa {$SEMOB.LAYER.MATCHES}; {#CAMADA} não casa {$SEMOB.LAYER.NOT_MATCHES} | Cria um contador resultType=hits por camada. Passageiros fica excluída por padrão: consultas sem filtro excederam 20 s na investigação de 09/10/2026. |

### Protótipos de item

| Regra | Nome | Chave | Tipo | Intervalo | Unidade |
|---|---|---|---|---|---|
| `semob.positions.operators.discovery` | Operadora [{#OPERADORA.ID} - {#OPERADORA.NOME}]: registros | `semob.positions.operator.total[{#OPERADORA.ID}]` | Dependente | dependente |  |
| `semob.positions.operators.discovery` | Operadora [{#OPERADORA.ID} - {#OPERADORA.NOME}]: veículos com registro recente | `semob.positions.operator.fresh[{#OPERADORA.ID}]` | Dependente | dependente |  |
| `semob.positions.operators.discovery` | Operadora [{#OPERADORA.ID} - {#OPERADORA.NOME}]: veículos recentes em movimento | `semob.positions.operator.moving[{#OPERADORA.ID}]` | Dependente | dependente |  |
| `semob.positions.operators.discovery` | Operadora [{#OPERADORA.ID} - {#OPERADORA.NOME}]: veículos recentes sem linha | `semob.positions.operator.no_line[{#OPERADORA.ID}]` | Dependente | dependente |  |
| `semob.fleet.operators.discovery` | Frota [{#OPERADORA.NOME}]: veículos cadastrados | `semob.fleet.operator.total[{#OPERADORA.KEY}]` | Dependente | dependente |  |
| `semob.fleet.operators.discovery` | Frota [{#OPERADORA.NOME}]: idade média | `semob.fleet.operator.avg_age[{#OPERADORA.KEY}]` | Dependente | dependente | anos |
| `semob.wfs.layers.discovery` | Camada [{#CAMADA}]: registros | `semob.layer.count["{#CAMADA}"]` | HTTP agent | `{$SEMOB.LAYER.INTERVAL}` |  |

## Triggers

| Origem | Nome | Severidade | Expressão | Descrição |
|---|---|---|---|---|
| Item | SEMOB: coleta de posições inválida nas três últimas tentativas | Média | `max(/SEMOB DF GeoServer by HTTP/semob.positions.ok,#3)=0` | O GeoServer não entregou uma FeatureCollection válida em três coletas seguidas. Verifique em Dados mais recentes o item "Posições: resumo calculado" (campo error). |
| Item | SEMOB: posições sem coleta há {$SEMOB.POS.NODATA} | Atenção | `nodata(/SEMOB DF GeoServer by HTTP/semob.positions.ok,{$SEMOB.POS.NODATA})=1` | Nenhum valor recebido. Causas prováveis: host desativado, poller HTTP sobrecarregado ou proxy offline. |
| Item | SEMOB: resposta de posições truncada | Atenção | `last(/SEMOB DF GeoServer by HTTP/semob.positions.complete)=0` | numberReturned menor que numberMatched. Aumente {$SEMOB.POS.COUNT}. Os indicadores refletem só a parte recebida. |
| Item | SEMOB: nenhum veículo com registro recente há 15 minutos | Atenção | `max(/SEMOB DF GeoServer by HTTP/semob.positions.fresh,15m)=0` | A coleta funciona, mas nenhum registro tem dataregistro recente. O feed da SEMOB pode estar parado. |
| Item | SEMOB: feed de posições atrasado | Alta | `min(/SEMOB DF GeoServer by HTTP/semob.positions.newest_age,5m)>{$SEMOB.POS.AGE.MAX}` | O registro mais recente está mais velho que {$SEMOB.POS.AGE.MAX} segundos durante 5 minutos. |
| Item | SEMOB: coordenadas inválidas acima do limite | Informação | `min(/SEMOB DF GeoServer by HTTP/semob.positions.invalid_coords,30m)>{$SEMOB.POS.INVALID.MAX}` | Registros sem coordenada utilizável aparecem no feed há 30 minutos. |
| Item | SEMOB: veículos duplicados no feed de posições | Informação | `min(/SEMOB DF GeoServer by HTTP/semob.positions.duplicates,30m)>0` | O par id_operadora + prefixo aparece mais de uma vez há 30 minutos. |
| Item | SEMOB: coleta da frota inválida | Atenção | `last(/SEMOB DF GeoServer by HTTP/semob.fleet.ok)=0` | A última consulta da frota não retornou FeatureCollection. Veja o campo error em "Frota: resumo calculado". |
| Item | SEMOB: cadastro de frota desatualizado | Informação | `last(/SEMOB DF GeoServer by HTTP/semob.fleet.ref_age)>{$SEMOB.FLEET.REF.MAX}` | A maior data_referencia está mais antiga que {$SEMOB.FLEET.REF.MAX}. |
| Item | SEMOB: catálogo WFS mudou de quantidade de camadas | Informação | `change(/SEMOB DF GeoServer by HTTP/semob.wfs.layers)<>0` | Camadas foram publicadas ou removidas. Revise as camadas descobertas. |
| Protótipo | SEMOB: camada {#CAMADA} sem registros | Atenção | `last(/SEMOB DF GeoServer by HTTP/semob.layer.count["{#CAMADA}"])=0` | O GeoServer informou numberMatched=0 para a camada. |
| Protótipo | SEMOB: camada {#CAMADA} sem contagem há {$SEMOB.LAYER.NODATA} | Atenção | `nodata(/SEMOB DF GeoServer by HTTP/semob.layer.count["{#CAMADA}"],{$SEMOB.LAYER.NODATA})=1` | Falhas HTTP são descartadas no pré-processamento. A ausência prolongada de valores indica erro de coleta. |
| Web | SEMOB: GeoServer falhou no cenário web | Média | `last(/SEMOB DF GeoServer by HTTP/web.test.fail[SEMOB GeoServer])<>0` | Uma etapa do cenário web retornou código diferente de 200, timeout ou conteúdo sem a string esperada. A mensagem fica no item web.test.error. |
| Web | SEMOB: GeoServer lento | Atenção | `avg(/SEMOB DF GeoServer by HTTP/web.test.time[SEMOB GeoServer,WFS GetFeature,resp],15m)>{$SEMOB.RESP.MAX}` | Tempo médio de resposta da etapa WFS GetFeature acima de {$SEMOB.RESP.MAX} s em 15 minutos. |

As triggers de coleta dependem da trigger de falha do cenário web, para que uma queda do GeoServer gere um único alerta.


## Gráficos

| Gráfico | Itens |
|---|---|
| SEMOB: veículos por estado | `semob.positions.fresh`, `semob.positions.moving`, `semob.positions.stale`, `semob.positions.no_line` |
| SEMOB: idade do registro mais recente | `semob.positions.newest_age` |
| SEMOB: velocidade média reportada | `semob.positions.speed_avg` |
| SEMOB: qualidade do feed de posições | `semob.positions.no_line`, `semob.positions.invalid_coords`, `semob.positions.invalid_timestamps`, `semob.positions.duplicates`, `semob.positions.speed_errors` |
| SEMOB: tempo de resposta do GeoServer | `web.test.time[SEMOB GeoServer,WFS GetCapabilities,resp]`, `web.test.time[SEMOB GeoServer,WFS GetFeature,resp]`, `web.test.time[SEMOB GeoServer,WMS GetCapabilities,resp]` |
| SEMOB: frota cadastrada | `semob.fleet.total` |
| Operadora [{#OPERADORA.ID} - {#OPERADORA.NOME}]: veículos (protótipo) | `semob.positions.operator.fresh[{#OPERADORA.ID}]`, `semob.positions.operator.moving[{#OPERADORA.ID}]`, `semob.positions.operator.no_line[{#OPERADORA.ID}]`, `semob.positions.operator.total[{#OPERADORA.ID}]` |

## Cenário web

Cenário `SEMOB GeoServer`, intervalo `{$SEMOB.WEB.INTERVAL}`, 2 tentativas.

| Etapa | Consulta | Texto exigido |
|---|---|---|
| WFS GetCapabilities | service=WFS&version=2.0.0&request=GetCapabilities | `WFS_Capabilities` |
| WFS GetFeature | service=WFS&version=2.0.0&request=GetFeature&typeNames=semob:ultima_posicao&count=1&outputFormat=application/json&propertyName=dataregistro | `FeatureCollection` |
| WMS GetCapabilities | service=WMS&version=1.3.0&request=GetCapabilities | `WMS_Capabilities` |

## Dashboard do template

Dashboard `SEMOB DF: transporte público`.

- Página `Operação` com 11 widgets: Coleta de posições, Veículos recentes, Em movimento, Idade do registro mais recente, Linhas com veículo, Operadoras com veículo, graph, graph, Veículos recentes por operadora, Veículos recentes por operadora, graph.
- Página `Qualidade e cadastros` com 8 widgets: graph, graph, Frota cadastrada, Operadoras na frota, Idade média da frota, Idade da referência da frota, Frota cadastrada por operadora, Registros por camada WFS.


## Mapeamentos de valor

| Nome | Valores |
|---|---|
| SEMOB coleta | 0 = Falha, 1 = OK |
| SEMOB completude | 0 = Incompleta, 1 = Completa |
