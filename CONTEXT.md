# EHS Insights

Sistema que transforma conversas de trabalho gravadas (Plaud) da EHS Brasil em inteligência de negócio: resumos, insights cruzados, oportunidades qualificadas e conteúdo em rascunho para revisão da Andresa. O clone conversacional (Clone Andrezza) e sua alimentação (embeddings/pgvector/n8n) são um contexto separado e fora do escopo deste.

## Language

**Conversa**: Uma gravação do Plaud já ingerida no sistema, com data, transcrição e resumo. É a unidade de evidência de tudo o mais.
_Avoid_: "reunião" como sinônimo técnico (nem toda conversa é reunião); "meeting" na UI.

**Ingestão**: O processo de trazer TODAS as gravações do Plaud para o banco, com reconciliação diária automática e botão de sincronização manual para urgências. A completude é requisito: gravação sem resumo é processada automaticamente, não ignorada.
_Avoid_: confundir com a alimentação do clone (embeddings) — são fluxos distintos.

**Insight cruzado**: Convergência detectada pela IA entre várias conversas de um universo analisado (padrão: as 50 mais recentes, com filtro opcional de período). Sempre carrega recorrência e evidências.
_Avoid_: "insight" para achados de uma conversa só.

**Recorrência**: A medida "X de Y conversas (Z%)" de um tema — quantas conversas do universo analisado o mencionam.
_Avoid_: contagens absolutas sem denominador ("mencionado em 5 conversas").

**Oportunidade real**: Insight cruzado que passou na qualificação: tem dor identificada, evidência rastreável, aderência ao negócio da EHS e recomendação acionável. Recebe selo próprio na UI.
_Avoid_: tratar qualquer tema repetido como oportunidade.

**Padrão observado**: Tema recorrente que NÃO se qualificou como oportunidade real. Vale acompanhar (métricas de frequência e evolução entre gerações), mas não pede ação imediata.
_Avoid_: descartar padrões como ruído; eles alimentam a leitura estratégica.

**Evidência**: Trecho-fonte de uma conversa específica que sustenta um insight, sempre com link para a conversa de origem.
_Avoid_: afirmações da IA sem trecho rastreável.

**Hipótese de metodologia**: Abordagem ou metodologia proposta pela IA para investigar/atacar uma dor. É sempre marcada como hipótese e exige aprovação humana.
_Avoid_: apresentar proposta da IA como fato ou plano decidido.

**Tipo de oportunidade**: Taxonomia fechada: **treinamento** (cursos/capacitações), **consultoria** (projetos/diagnósticos/assessoria) ou **sistema** (software/produto digital).
_Avoid_: os tipos legados "produto" e "serviço" (existem só em linhas antigas, até a reclassificação por IA).

**Subtipo**: Especificação livre sugerida pela IA dentro de um tipo, ex. "Treinamento NR-35", "Consultoria em PGR".
_Avoid_: transformar subtipos em enum fechado.

**Artigo**: Texto longo próprio como canal de conteúdo (junto de YouTube e LinkedIn).
_Avoid_: **"blog"** — não existe blog como canal publicado; o termo foi aposentado.

**Pauta**: O esqueleto de um conteúdo: ângulo e pontos a cobrir. É o que o sistema sugere primeiro.
_Avoid_: chamar pauta de "rascunho" ou "artigo".

**Rascunho**: Texto integral gerado pela IA (artigo, copy de LinkedIn ou roteiro de YouTube) no tom de voz da Andresa. É editável manualmente e regenerável, e nunca é versão final.
_Avoid_: "texto pronto"; conteúdo externo com travessões.

**Tom de voz**: As regras de como a Andresa se expressa, escreve e compõe — extraídas (somente leitura) do workflow do clone no n8n.
_Avoid_: inventar o tom a partir de descrição genérica.

**Estados editoriais**: Fluxo de um conteúdo: sugerido → rascunho → em revisão → aprovado → publicado / descartado. "Publicado" é registro manual de que a publicação (externa) aconteceu; toda publicação exige aprovação humana antes.
_Avoid_: o estado legado "produção"; publicação automática.

**Arquivado**: Destino de um insight que não foi consultado e que a Andresa optou por guardar para consulta futura ao gerar novos insights (as opções são manter, arquivar ou descartar — nada é excluído silenciosamente).
_Avoid_: exclusão automática de insights antigos.

**Anotações**: Notas livres da Andresa gravadas em um insight (decisões, contexto, próximos passos).
_Avoid_: confundir com as notas de oportunidade ou com o rascunho de conteúdo.

## Relationships

- Uma **Conversa** origina resumos, oportunidades e serve de fonte de **Evidências**.
- Um **Insight cruzado** referencia N conversas e nasce de um universo analisado; qualifica-se como **Oportunidade real** ou permanece **Padrão observado**.
- Uma **Oportunidade** tem um **Tipo** e opcionalmente um **Subtipo**.
- Um **Conteúdo** tem plataforma (artigo/LinkedIn/YouTube), nasce como **Pauta**, pode ganhar **Rascunho** e percorre os **Estados editoriais**.
- O **Tom de voz** alimenta a geração de rascunhos; sua fonte é o workflow do clone (leitura apenas).
- O **Clone Andrezza** e sua alimentação são contexto separado: este sistema não modifica embeddings, pgvector nem workflows n8n.

## Example dialogue

> **Andresa:** "Esse tema de treinamento em altura apareceu de novo?"
> **Sistema:** "Sim — recorrência de 8 de 50 conversas (16%), subindo em relação à geração anterior (5 de 50). Qualificado como oportunidade real, tipo treinamento, subtipo 'Treinamento NR-35', com 8 evidências rastreáveis. Há uma hipótese de metodologia aguardando sua aprovação."
> **Andresa:** "Gera um artigo sobre isso."
> **Sistema:** "Rascunho gerado no seu tom de voz. Ele está em 'rascunho' — você pode editar, regenerar ou enviar para revisão. Nada é publicado sem sua aprovação."

## Flagged ambiguities

- **"Blog"** dito em conversa quase sempre significa **Artigo** — corrigir para o termo canônico.
- **"Insight"** sozinho é ambíguo: distinguir insight de uma conversa (resumo) de **Insight cruzado** (multiconversa).
- **"Publicar"** no sistema significa apenas registrar o estado; a publicação real acontece fora, feita por humano.
- **"Sincronizar"** refere-se à ingestão do Plaud; não implica reprocessar embeddings do clone.
