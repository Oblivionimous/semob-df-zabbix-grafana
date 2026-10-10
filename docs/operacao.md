# Operação e solução de problemas

## Ajustar o comportamento por macros

Redefina as macros no host `SEMOB DF` para mudar intervalos e limiares sem editar o template. A lista completa está em [referencia-template.md](referencia-template.md). As mais usadas são estas.

| Macro | Padrão | Quando mudar |
|---|---|---|
| `{$SEMOB.POS.INTERVAL}` | `1m` | Para reduzir a carga sobre o GeoServer ou a frequência do mapa no Zabbix |
| `{$SEMOB.POS.COUNT}` | `10000` | Se a trigger de resposta truncada disparar, o que indica mais de 10 mil veículos |
| `{$SEMOB.POS.FRESH.MAX}` | `300` | Para mudar a idade máxima do sinal que conta como recente, em segundos |
| `{$SEMOB.POS.AGE.MAX}` | `600` | Para tornar o alerta de atraso do feed mais sensível ou mais tolerante |
| `{$SEMOB.OPERADORA.SERVICO.EXCLUIR}` | `^(STPCR\|não identificado)$` | Para incluir ou excluir grupos de empresas da descoberta |
| `{$SEMOB.LAYER.NOT_MATCHES}` | `passageiros` | Para incluir a camada de passageiros ou excluir outras |
| `{$SEMOB.RESP.MAX}` | `5` | Para ajustar o limiar de lentidão do GeoServer, em segundos |

A SEMOB não publica limite de requisições. Se o serviço começar a recusar consultas, aumente `{$SEMOB.POS.INTERVAL}`.

## Problemas no Zabbix

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Host novo sem dados | Os itens de 1 hora ainda não coletaram | Use Execute now nos itens mestres e na descoberta, como no passo 4 de [instalacao.md](instalacao.md) |
| `Posições: coleta válida` igual a Falha | O GeoServer não devolveu uma FeatureCollection | Abra o item `Posições: resumo calculado` e leia o campo `error` do JSON |
| Item `Posições: resposta WFS` sem valor ou não suportado | Sem rota, DNS ou proxy para o GeoServer | Repita os testes de `curl` do passo 1 a partir do servidor Zabbix |
| Trigger `resposta de posições truncada` | A camada passou do valor de `{$SEMOB.POS.COUNT}` | Aumente a macro. Os indicadores refletem só a parte recebida |
| Trigger `feed de posições atrasado` | O GeoServer responde, mas os registros estão velhos | Compare com o relógio do servidor. O relógio precisa de NTP, porque a idade usa o horário local |
| Itens por empresa não aparecem | A regra de descoberta ainda não rodou ou o filtro os excluiu | Execute a regra e confira `{$SEMOB.OPERADORA.SERVICO.EXCLUIR}` |
| Itens por camada não aparecem | A descoberta depende do `WFS: GetCapabilities` | Execute o item `WFS: GetCapabilities` e depois a regra |
| Descoberta de operadoras com erro | O item Script não alcançou o GeoServer ou a resposta mudou | Leia a mensagem de erro da regra. O Zabbix mantém os recursos já descobertos |
| Muitos itens com nome `STPCR` ou `não identificado` | A SEMOB publicou códigos novos sem nome na camada Horários | Confira o filtro. O comportamento padrão é descartar esses grupos |
| Alerta `catálogo WFS mudou de quantidade de camadas` | A SEMOB publicou ou removeu uma camada | Revise as camadas descobertas e feche o alerta manualmente |

## Problemas no Grafana

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Importação diz `No data sources of type yesoreyeram-infinity-datasource found` | O plugin Infinity não está instalado ou não há data source dele | Instale o plugin e crie o data source, como no passo 5 de [instalacao.md](instalacao.md) |
| Painel com uma caixa vermelha e uma mensagem | O script falhou ao montar a tela | Leia a mensagem. O erro completo vai para o console do navegador, com o prefixo `[SEMOB]` |
| Mapa sem pontos | A janela de tempo é curta ou as consultas não retornaram dados | Aumente `Registro nos últimos` para 1 hora. Abra o painel em Edit, Query inspector, e confira as consultas A a G |
| Consulta A com erro de host não permitido | `https://geoserver.semob.df.gov.br` falta em Allowed hosts | Inclua o endereço no data source Infinity e reinicie o Grafana se ele foi provisionado |
| Pontos sem mapa de ruas, com a dispersão das coordenadas | O navegador não carregou o Leaflet do `cdnjs.cloudflare.com` | Libere o endereço na rede do navegador |
| Pontos sobre fundo vazio | O navegador não alcança `tile.openstreetmap.org` | Libere o endereço, ou troque o provedor de tiles em `grafana/src/panel.js` |
| Nomes das empresas aparecem como Outros | A consulta B não retornou itens do Zabbix | Confirme que o host tem os itens `Operadora [...]` e que o usuário do data source tem permissão de leitura |
| Aba Problemas sem linhas apesar de haver triggers | A consulta G não enxerga o host | Confirme a variável Host e a permissão do usuário no Zabbix |
| Fonte do painel diferente do esperado | O navegador não alcançou o Google Fonts | O painel usa a fonte do sistema. Libere `fonts.googleapis.com` para usar a Inter |

Para qualquer erro de script, abra o console do navegador com F12 e procure linhas com `[SEMOB]`.

## Carga e limites

O item de posições baixa até cerca de 1 MB por minuto. Cada dashboard aberto no Grafana baixa cerca de 1 MB a cada atualização, com o padrão de 1 minuto. Com dez usuários com o painel aberto, a soma chega a cerca de 10 MB por minuto, além da coleta do Zabbix.

O mapa base do OpenStreetMap atende uso leve, como um painel interno. Para telão ou muitos usuários, use um provedor de tiles com chave própria e altere a URL no script do painel.

## Privacidade

Os permissionários do STPCR são pessoas físicas. O template não publica os nomes deles nos itens, nas etiquetas ou nos dashboards. Veja [arquitetura.md](arquitetura.md) para o mecanismo.

O template não coleta o IMEI do rastreador, a placa dos veículos nem a geometria dos pontos. A consulta de posições pede só os campos `id_operadora`, `prefixo`, `cd_linha`, `velocidade`, `latitude`, `longitude` e `dataregistro`. O painel do Grafana pede também `direcao`.

O prefixo identifica um veículo, não uma pessoa. Ele aparece no popup do mapa e na busca.

## Atualizações da SEMOB

Os nomes das camadas e dos campos vêm do catálogo da SEMOB em 09/10/2026. Se a SEMOB renomear uma camada, o item mestre correspondente deixa de funcionar e a coleta falha. A trigger de coleta inválida avisa, e o campo `error` do resumo indica falha HTTP ou ExceptionReport. Repita a consulta com `curl` para ler a mensagem do GeoServer.
