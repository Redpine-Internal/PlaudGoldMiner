# Plaud Gold Miner

## Register

product

## Users

Andreza e a equipe da EHS Brasil usam o Plaud Gold Miner para transformar reuniões, treinamentos e conversas gravadas em decisões comerciais, projetos e conteúdo. O uso acontece entre compromissos, em notebooks e celulares, frequentemente sob luz ambiente intensa e com pouco tempo para reaprender a navegação.

O trabalho principal é reconhecer rapidamente o que aconteceu, conferir a evidência que sustenta cada conclusão e executar a próxima ação com segurança. Usuários precisam alternar entre visão executiva, leitura profunda de transcrições, avaliação de oportunidades, produção de conteúdo e acompanhamento de projetos sem perder contexto.

## Product Purpose

O Plaud Gold Miner transforma conversas de trabalho em inteligência de negócio rastreável. O sistema ingere gravações, preserva transcrições e metadados, identifica padrões recorrentes, qualifica oportunidades, organiza evidências, propõe conteúdos e converte decisões em projetos executáveis.

Sucesso significa reduzir o tempo entre uma conversa e uma ação útil sem criar afirmações sem prova. Todos os insights precisam continuar vinculados às fontes, e nenhuma adaptação visual pode remover campos, rotas, transcrições ou alternativas operacionais necessárias à comparação e à decisão.

## Product Surface & Field Preservation

Esta é a matriz funcional mínima do produto. Uma mudança visual pode reorganizar a apresentação, mas não pode remover os campos abaixo nem tornar a versão móvel funcionalmente inferior.

| Área | Conteúdo e campos preservados | Ações essenciais |
|---|---|---|
| Dashboard | Resumo da semana; fila de trabalho; indicadores de conversas, negócios e conteúdos; projeto em andamento; conversas recentes; pipeline; temas; conversas por mês; demanda; evidência; cobertura. | Abrir a origem, continuar projeto e acessar cada coleção. |
| Conversas | Título, resumo, tipo, status, data, duração e disponibilidade de resumo, transcrição e insights. No detalhe: áudio, participantes, tópicos, tags, transcrição integral e negócios detectados. | Buscar, filtrar, atualizar, sincronizar com Plaud, importar do Drive, criar conversa e analisar gravação. |
| Novos Negócios | Título, dor, contexto, tipo, subtipo, score, status, recorrência/fontes, data e vínculo com a conversa. | Detectar, buscar, filtrar, alternar visão, agrupar por tema, priorizar, criar projeto e excluir. |
| Conteúdos | Título, formato, subtipo, tema, abordagem/outline, menções, relevância, status, rascunho e fonte. | Gerar sugestões, buscar, filtrar, gerar/editar rascunho, avançar status, descartar e criar projeto. |
| Projetos | Título, descrição, status, origem e data. No board: colunas, tarefas, tipo, detalhe e posição. | Criar, buscar, editar, arquivar, gerar tarefas, adicionar/renomear/excluir coluna, adicionar/excluir tarefa e mover etapa. |
| Assuntos de Interesse | Título, tipo da fonte, trecho original, notas e data de marcação. | Abrir evidência e enriquecer a ideia. |
| Clone | Histórico de mensagens, contexto consultado, oportunidades e conteúdos relacionados. | Perguntar, consultar a base, gerar insights, copiar, avaliar e regenerar. |
| Configurações | Acento funcional, estados semânticos, superfície de trabalho e integrações Google Drive/n8n; no n8n, URL e chave de API. | Aplicar preferências, conectar, desconectar e verificar integrações. |
| Perfil | Nome, e-mail e texto “Sobre você” usado como contexto do Clone. | Salvar dados da conta. |

O detalhe é o mecanismo principal de progressive disclosure: listas podem resumir, desde que os campos completos continuem imediatamente acessíveis. Tabelas e boards mantêm sua estrutura integral em contêiner próprio quando necessário.

## Brand Personality

**Sóbria, editorial e confiável.**

A interface deve transmitir discernimento humano, precisão e calma executiva. Ela organiza uma grande quantidade de informação sem parecer um painel genérico de tecnologia. O tom é direto, institucional e inteligível, com personalidade suficiente para ser reconhecido como parte do universo visual da Andreza.

## Anti-references

- Fundos bege ou creme que contaminem a área principal de trabalho.
- Roxo, azul saturado ou a estética genérica de SaaS e ferramentas de IA.
- Material Design aplicado como fantasia visual sem melhorar o fluxo do produto.
- Glassmorphism, gradientes decorativos, cápsulas flutuantes e sombras ostensivas.
- Faixas coloridas laterais, excesso de linhas e divisórias usadas como decoração.
- Botões totalmente quadrados e pesados, ou componentes excessivamente arredondados.
- Grades intermináveis de cards iguais ou cards aninhados.
- Rótulos conceituais sem função, como “Intel OS” e “Conceito C”.
- Navegação reinventada a ponto de o usuário perder a relação com as áreas conhecidas.
- Interfaces móveis que simplesmente escondem campos, dados ou ações para caber na tela.

## Design Principles

1. **Evidência antes da afirmação.** Toda conclusão relevante mantém acesso claro à conversa, ao trecho ou ao registro que a sustenta.
2. **Orientação antes da novidade.** A arquitetura e os nomes das áreas permanecem familiares; atalhos melhoram velocidade sem apagar o mapa mental existente.
3. **Hierarquia antes da decoração.** Ordem, tipografia, espaço e densidade explicam a tela. Cor e linhas aparecem apenas quando carregam significado.
4. **Resumir sem remover.** Progressive disclosure reduz carga cognitiva, mas todos os campos e conteúdos continuam acessíveis.
5. **A próxima ação deve ser evidente.** Cada superfície possui uma ação dominante reconhecível e ações secundárias agrupadas sem competir visualmente.
6. **Mobile é adaptação estrutural.** Listas, tabelas, painéis, Kanban e navegação assumem formas adequadas ao toque sem criar um produto paralelo.

## Accessibility & Inclusion

O produto deve atender WCAG 2.2 AA. Texto de leitura usa no mínimo 1rem, contraste de texto normal é de pelo menos 4,5:1 e componentes/foco atingem pelo menos 3:1. Controles possuem mínimo absoluto de 44 × 44 px, alvo preferencial de 48 × 48 px e espaçamento mínimo de 8 px. Ações não dependem exclusivamente de cor, hover, arrastar, pressionar longamente ou gestos ocultos. Zoom a 200%, navegação por teclado, redução de movimento, safe areas e teclado virtual fazem parte da definição de pronto.
