# Qualificação de oportunidades — metodologia

Estado em 21/09/2026. Base implementada; conjunto de perguntas pendente.

## Por que o score atual não serve

`app_opportunities.score` é 0-100, e o prompt que o produz define as faixas por
**contagem de conversas** (`lib/ai/prompts/opportunity-batch.ts`: "90-100 = dor
em 4+ conversas, 70-89 = 3 conversas"). Ou seja, mede volume de dor mencionada.

Neil Rackham (Huthwaite, 35.000 chamadas, 12 anos) mediu exatamente isso e
concluiu que, **em vendas grandes, volume de dor implícita não prediz
fechamento**. O que prediz é a transição para dor explícita — o cliente
manifestando intenção de resolver. Consultoria de SST, com ticket médio-alto e
ciclo longo, está nesse regime.

O score não está mal calibrado. Mede a variável que a pesquisa mostrou não ser
preditiva.

Além disso: **nenhuma metodologia de qualificação define escala numérica.**
BANT, MEDDIC, SPIN e Sandler definem critérios binários ou qualitativos. Os
"scorecards 0-100" são invenção de fornecedores de CRM, não das metodologias.

## Decisões de desenho

**Categorias, não nota.** Rackham mediu tipo, não quantidade: nenhuma quantidade
de dor implícita vira dor explícita. E o JOLT Effect (Dixon & McKenna) mostra que
40-60% dos negócios perdidos terminam em "nenhuma decisão" — dor alta é
compatível com zero compra. Numa nota somada, esse caso vira "nota média",
indistinguível de um caso morno. É estado próprio, com tratamento próprio.

**Perguntas binárias sobre fatos verificáveis, composição em código.** É o padrão
que o produto já usa no filtro de recorrência (`opportunity-batch-analyzer.ts`,
regra das 2+ conversas): a IA propõe, o código decide. A política fica auditável.

**Toda resposta "sim" exige trecho literal citado.** Sem trecho, é "não".
Converte ambiguidade em falso negativo — conservador e conferível.

## As perguntas

Fonte entre parênteses. `true` sempre significa "o fato está presente".

### Bloco A — Dor

| # | Pergunta | Fonte |
|---|---|---|
| A1 | O cliente relatou problema atribuído à própria empresa? | SPIN — Implied Need |
| A2 | Nomeou consequência de negócio (multa, parada, retrabalho, perda)? | Sandler nível 2 |
| A3 | A consequência foi quantificada (valor, prazo, volume)? | MEDDIC — Metrics |
| A4 | Expressou impacto pessoal sobre si (responsabilidade, cobrança)? | Sandler nível 3 |
| A5 | A implicação foi verbalizada espontaneamente, sem ser extraída? | SPIN — Implication |

**A1 é condição necessária.** A3 aceita faixa e ordem de grandeza; adjetivos
("caro", "muito") não contam. A4 é sobre o que foi dito, nunca sobre tom
inferido.

### Bloco B — Gatilho

| # | Pergunta | Fonte |
|---|---|---|
| B1 | Foi citada data ou prazo específico? | MEDDPICC — deadline |
| B2 | A origem do prazo é externa e verificável? | qualificador de auditabilidade |
| B3 | Foi nomeada consequência do descumprimento? | MEDDPICC — consequence |

`gatilho = B1 ∧ B3` — a conjunção é obrigatória na definição de compelling
event. Perguntar a conjunção direto esconderia qual perna falhou.

**B2 não entra na conjunção.** A origem do prazo não faz parte da definição:
regulação é exemplo canônico, não requisito. "O CEO quer isso antes do ciclo de
metas, senão perdemos o orçamento" é gatilho completo.

⚠️ **B2 não pode entrar em ordenação como bônus.** Prazo regulatório é mais
checável, então treinamento de NR subiria sistematicamente sobre programa de
cultura — por propriedade do instrumento, não por mérito. Usar só como flag de
confiança.

Gatilhos não regulatórios reconhecidos: renovação contratual, fim de exercício
fiscal, iniciativa interna com prazo, acidente ocorrido, auditoria de cliente,
certificação voluntária, due diligence.

**Troca de liderança não é compelling event** — nenhuma fonte sustenta. É janela
de timing (campo separado), sem data-limite nem penalidade.

### Bloco C — Intenção

| # | Pergunta | Fonte |
|---|---|---|
| C1 | O cliente verbalizou desejo ou intenção de resolver? | SPIN — Explicit Need |
| C2 | Solicitou proposta, escopo ou orçamento? | SPIN — forma comportamental |
| C3 | Levantou preço por iniciativa própria? | conversation intelligence |
| C4 | Ficou definido próximo passo com data e participante? | next-step commitment |
| C5 | Perguntou sobre processo de contratação (não sobre conteúdo)? | conversation intelligence |

**C1 é a pergunta mais importante do conjunto** — o único preditor validado em
venda grande. C3 e C5 têm peso menor: são padrão observado por fornecedores
(Gong, Chorus), não pesquisa revisável. C4 se sustenta por ser a operacionalização
comportamental do Explicit Need — duas tradições independentes no mesmo sinal.

### Blocos D, E e guardas

D1-D4 (poder): autoridade, stakeholders, champion, processo de decisão — MEDDIC.
Qualificam, não entram na nota de dor.

E1-E3 (risco): concorrente mencionado, objeção de preço, adiamento sem data.
E3 é marcador de indecisão (JOLT).

**G1 — modalidade:** a demanda é pontual de escopo fechado (curso, laudo, EPI)
ou programa continuado (cultura, governança, sistema)? Classifica a demanda, não
a empresa. Na dúvida, consultivo.

**G2 — validade do corpus:** é diálogo com participação substantiva de mais de
um lado, ou exposição unilateral (palestra, aula)? Na dúvida, exposição — o
custo do falso positivo já se materializou com 27 palestras mineradas.

## Composição

```
dor_propria  = A1                        // condição necessária
dor_profunda = A2 ∨ A3 ∨ A4              // Sandler nível 2 ou 3
gatilho      = B1 ∧ B3                   // deadline ∧ consequência

// Rackham: em vendas pequenas, dor implícita TAMBÉM prediz — a barreira
// de decisão é baixa. Não é sobre obrigação legal (isso já está em B1/B3).
intencao = (G1 == consultivo)
         ? (C1 ∨ C2 ∨ C4)
         : (C1 ∨ C2 ∨ C4 ∨ (dor_propria ∧ gatilho))
```

Categorias avaliadas em ordem; a primeira que casar vence. `¬G2` sai do pipeline;
`¬A1` é menção sem dor. O quadrante **dor forte + gatilho + sem intenção** é
categoria própria, não posição baixa numa escala — pede abordagem diferente.

## Estado da atribuição de falante

Determinado **em código**, testando a presença de `Speaker N:`. Nunca perguntando
ao modelo quanto ele confia em si.

| Estado | Condição | Efeito |
|---|---|---|
| `marcado` | Tem marcação e lado resolvido | Conjunto completo |
| `inferido` | Sem marcação, lado decidível por conteúdo | Desativa A5 e D1 |
| `ausente` | Sem base para decidir lado | Só A2-A3, B1-B3, C4, E1-E3. **Não classifica dor** |

⚠️ **Não misturar `marcado` e `inferido` na mesma fila ordenada.** As taxas de
falso negativo diferem por construção, e gravação antiga pareceria pior por
causa do instrumento.

A flag fica **ao lado** da categoria, não dentro: a categoria diz o que a
evidência mostra; a flag diz o quanto se confia na leitura.

## O que já está implementado

- `lib/plaud/client.ts` — preserva `Speaker N:` na ingestão
- `scripts/reprocess-speakers.mts` — 248 transcrições do acervo recuperadas
- `lib/ai/services/speaker-side.ts` — classifica lado por falante
- `scripts/verify/measure-speaker-sides.mts` — mede viabilidade

**Medição de 21/09:** 15% de fala indeterminada em 12 conversas (limite: 30%).
Em 10 das 12, abaixo de 8%. O eixo de intenção é utilizável.

## O que falta

1. O conjunto de perguntas como serviço (`ask` com todas numa requisição)
2. A composição em categorias
3. Persistir categoria + estado de atribuição por oportunidade
4. Substituir o score na tela

## Limites conhecidos

- Nenhuma adaptação formal de MEDDIC ou SPIN para SST/EHS foi publicada. O que
  existe é literatura comercial do setor, não metodologia validada.
- Sandler Pain Funnel é modelo de treinamento comercial consolidado, não escala
  psicométrica validada.
- C3 e C5 vêm de material de fornecedor. Peso menor por isso.
- A régua não mede probabilidade de fechamento. Mede presença de evidência.
