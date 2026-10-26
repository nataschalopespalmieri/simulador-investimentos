# Simulador de Investimentos

Aplicação web para simular a rentabilidade de **CDB**, **Tesouro Selic**, **Tesouro Direto** (Prefixado e IPCA+) e planejar a **aposentadoria**.

Feita com HTML, CSS e JavaScript puro: não precisa de servidor, instalação ou dependências.

## Como usar

1. Abra o arquivo `index.html` no navegador (Chrome, Safari, Firefox ou Edge).
2. Escolha a aba da simulação desejada.
3. Preencha os campos. Os resultados são recalculados automaticamente enquanto você digita, ou ao clicar em **Simular**.

## Funcionalidades

### Campos comuns

- **Valor inicial** e **aporte mensal** (R$).
- **Taxa de juros ao ano (% a.a.) e ao mês (% a.m.)**: preencha um dos campos e o outro é convertido automaticamente por juros compostos. Exemplo: 12% a.a. equivale a 0,9489% a.m.
- **Prazo para resgate em meses e em anos**: os campos são vinculados. Exemplo: 30 meses equivalem a 2,5 anos.

### CDB

- Taxa informada diretamente ou calculada como **percentual do CDI** (ex.: 110% do CDI).
- Desconto opcional do **Imposto de Renda** pela tabela regressiva.

### Tesouro Selic

- Taxa calculada a partir da **Selic** mais o **ágio/deságio** do título.
- **Taxa de custódia da B3** (padrão de 0,20% a.a.) e Imposto de Renda.

### Tesouro Direto

- **Tesouro Prefixado**: taxa informada diretamente.
- **Tesouro IPCA+**: taxa nominal calculada a partir do **IPCA projetado** e da **taxa real** contratada.
- Taxa de custódia da B3 e Imposto de Renda.

### Aposentadoria

- Idade atual, inflação esperada, valor já investido, aporte mensal e tempo até a aposentadoria.
- Mostra a **idade ao se aposentar**, o **patrimônio acumulado** (nominal e em valores de hoje) e a **renda mensal estimada**.
- Calcula o **aporte mensal necessário** para atingir a renda desejada.
- Renda vitalícia (vivendo só dos rendimentos) ou por um número definido de anos.

### Resultados

- Cartões com total investido, valor bruto, rendimento, custódia, IR e valor líquido.
- Gráfico da evolução do patrimônio.
- Tabela de evolução ano a ano.

## Regras de cálculo

- **Juros compostos** com capitalização mensal.
- **Aportes** feitos ao final de cada mês.
- **IR regressivo**, aplicado separadamente a cada aporte conforme o próprio tempo de aplicação:

  | Prazo da aplicação | Alíquota |
  |---|---|
  | Até 6 meses (180 dias) | 22,5% |
  | De 7 a 12 meses (181 a 360 dias) | 20% |
  | De 13 a 24 meses (361 a 720 dias) | 17,5% |
  | Acima de 24 meses (720 dias) | 15% |

- **Percentual do CDI** com capitalização diária em 252 dias úteis.
- **Custódia da B3** cobrada mensalmente sobre o saldo e deduzida da base de cálculo do IR.
- O prazo é contado em meses de 30 dias, sem IOF (aplicável apenas a resgates em menos de 30 dias).
- Na aposentadoria, os valores são brutos (sem IR ou taxas) e a renda é corrigida pela inflação.

## Estrutura dos arquivos

```
index.html   Estrutura da página e formulários
styles.css   Estilos (tema claro e escuro, layout responsivo)
app.js       Cálculos financeiros e interação com a página
```

## Publicação no GitHub Pages

1. Crie um repositório público no GitHub e envie os arquivos `index.html`, `styles.css`, `app.js` e `README.md`.
2. Acesse **Settings → Pages**.
3. Em **Source**, escolha **Deploy from a branch**, selecione a branch `main` e a pasta `/ (root)` e clique em **Save**.
4. Após alguns minutos, o site estará disponível em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Aviso

As simulações têm caráter educativo e **não constituem recomendação de investimento**. As taxas preenchidas por padrão são ilustrativas; atualize-as com os valores vigentes. Os resultados são aproximados e podem diferir dos valores reais dos produtos.

