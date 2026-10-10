# Galeria de telas

As imagens da pasta `galeria/` são capturas históricas dos painéis do Zabbix e do Grafana, não consultas em tempo real. Use os documentos de [instalação](instalacao.md), [arquitetura](arquitetura.md), [dados](dados-semob.md) e [operação](operacao.md) para interpretar os resultados.

## Grafana

### Mapa da frota

![Figura 1. Visão inicial do mapa e indicadores.](../galeria/Screenshot_1.png)

*Figura 1. Painel de mapa, indicadores e filtros operacionais.*

![Figura 2. Continuação do mapa da frota.](../galeria/Screenshot_2.png)

*Figura 2. Captura complementar do mapa. O arquivo é mantido no repositório original.*

### Empresas

![Figura 3. Participação e perfil operacional.](../galeria/Screenshot_3.png)

*Figura 3. Distribuição por empresa e gráfico de perfil normalizado.*

![Figura 4. Tabela operacional por empresa.](../galeria/Screenshot_4.png)

*Figura 4. Detalhe do quadro operacional com médias e contagens.*

### Linhas

![Figura 5. Indicadores e tabela das linhas.](../galeria/Screenshot_5.png)

*Figura 5. Ranking, dispersão de velocidades e quadro de linhas.*

### Qualidade e disponibilidade

![Figura 6. Qualidade da posição e disponibilidade do serviço.](../galeria/Screenshot_6.png)

*Figura 6. Indicadores de velocidade, idade do sinal, direção e latência.*

### Cadastros

![Figura 7. Cadastro de frota e catálogo WFS.](../galeria/Screenshot_7.png)

*Figura 7. Frota cadastrada, circulação e distribuição de registros por camada.*

## Zabbix

### Dados recentes

![Figura 8. Filtragem do host.](../galeria/Screenshot_8.png)

*Figura 8. Filtros e etiquetas dos itens do host.*

![Figura 9. Contagem por camada.](../galeria/Screenshot_9.png)

*Figura 9. Itens descobertos e indicadores de frota.*

![Figura 10. Métricas de posições e disponibilidade.](../galeria/Screenshot_10.png)

*Figura 10. Itens de qualidade, dados recentes e cenário web.*

### Dashboard do template

![Figura 11. Operação: indicadores e gráficos.](../galeria/Screenshot_11.png)

*Figura 11. Página Operação com indicadores e séries temporais.*

![Figura 12. Operação: gráficos complementares.](../galeria/Screenshot_12.png)

*Figura 12. Séries por operadora e tempos de resposta.*

![Figura 13. Qualidade e cadastros.](../galeria/Screenshot_13.png)

*Figura 13. Indicadores e gráficos da segunda página do dashboard.*

![Figura 14. Qualidade e cadastros: continuação.](../galeria/Screenshot_14.png)

*Figura 14. Distribuição da frota e catálogo das camadas.*

## Observações da revisão

- As capturas representam instantes de coleta diferentes. Não se deve inferir divergência operacional apenas pela diferença entre valores.
- Na Figura 7, o cartão de camadas publicadas aparece sem valor, enquanto a Figura 10 apresenta 14 camadas no Zabbix. Investigue a consulta D no Grafana, sem pressupor a causa.
- Capturas em resoluções elevadas podem exigir ampliação no GitHub. Não foram alteradas, comprimidas nem recortadas.
- O arquivo `Screenshot_2.png` foi incorporado como referência Markdown, mas sua inspeção visual integral não foi possível nesta revisão. A imagem permanece no repositório sem alteração.
