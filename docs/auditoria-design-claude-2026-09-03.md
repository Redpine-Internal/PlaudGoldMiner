# Auditoria de paridade com o Claude Design

**Referência:** [Claude Design — reality parity review](https://claude.ai/design/p/c6e5fd83-9e08-4d2c-8bfa-b21b035e16f9?file=ui_kits%2Fplaud-intelligence-os%2Freality-parity-review.html)

**Ambiente local:** `http://localhost:3000`, autenticado

**Produção:** `https://plaudgoldminer-huzboo2prq-uc.a.run.app`

**Revisão de produção:** `plaudgoldminer-00016-nj6`

**Base local:** commit `8cddfca89baed60c0fa39823d56175e24db9ec03` e alterações não commitadas desta auditoria

**Executado em:** 3 de setembro de 2026, 01:09 EDT

**Critério:** preservar todos os campos e ações reais; os valores demonstrativos não precisam ser idênticos.

## Cobertura obrigatória

| # | Página ou estado | Paridade de campos e ações |
|---:|---|---|
| 1 | Dashboard | Conforme |
| 2 | Conversas — lista | Conforme |
| 3 | Conversas — filtros expandidos | Conforme |
| 4 | Conversas — nova conversa | Conforme |
| 5 | Conversas — importar do Google Drive | Conforme |
| 6 | Detalhe da conversa — topo e resumo | Conforme |
| 7 | Detalhe da conversa — continuação do resumo | Conforme |
| 8 | Detalhe da conversa — transcrição | Conforme |
| 9 | Novos negócios — lista | Conforme |
| 10 | Novos negócios — criação | Conforme |
| 11 | Conteúdos | Conforme |
| 12 | Projetos — lista | Conforme |
| 13 | Projetos — criação em linha | Conforme |
| 14 | Projeto — detalhe superior | Conforme |
| 15 | Projeto — quadro e continuação | Conforme |
| 16 | Assuntos de interesse | Conforme |
| 17 | Clone | Conforme |
| 18 | Configurações | Conforme |
| 19 | Perfil | Conforme |
| 20 | Menu da conta | Conforme |
| 21 | Menu lateral recolhido | Conforme no local; divergente na produção atual |

## Contrato do estado 21 — menu recolhido

- Trilho lateral com 64 px de largura.
- Favicon PGM aprovado com 22 × 22 px no topo, em vez da sigla `PGM` em texto.
- Alvos dos itens com 48 × 40 px e ícones preservados na mesma ordem do menu expandido.
- Item ativo identificado por superfície, sem faixa vertical colorida.
- Configurações e controle de expansão permanecem no rodapé.
- Controle de expansão com 48 × 40 px.
- Nome acessível em todos os links e botões mesmo sem rótulo visual.
- Foco visível de alto contraste sobre o fundo escuro.

## Comparação medida do menu

| Elemento | Claude Design | Local após correção | Produção auditada |
|---|---:|---:|---:|
| Menu expandido | 232 px | 232 px | 248 px |
| Menu recolhido | 64 px | 64 px | 64 px |
| Marca recolhida | favicon, 22 px | favicon, 22 px | `PGM` em texto |
| Item recolhido | 48 × 40 px | 48 × 40 px | 48 × 40 px |
| Controle inferior | 48 × 40 px | 48 × 40 px | 48 × 44 px |

## Método e evidências

- As 20 superfícies originais foram abertas no navegador autenticado e comparadas com os estados correspondentes da referência. A inspeção verificou campos, ações, títulos, famílias tipográficas, fundo, curvatura e overflow horizontal.
- O estado 21 foi medido em separado, nos modos expandido e recolhido, em viewport de 1280 × 1000 px. A inspeção usou retângulos dos elementos renderizados e a árvore de acessibilidade.
- O estado 21 também passou por auditoria independente de código, sem alterações, incluindo contraste de foco de 11,95:1, nomes acessíveis, `aria-current`, ordem de navegação e substituição responsiva até 900 px.
- A produção redireciona visitantes não autenticados para o login. As diferenças foram confirmadas nos artefatos públicos `/_next/static/chunks/23_0geq3doxzv.css` e `/_next/static/chunks/2ytcdgfp0jszg.js`, publicados pela revisão acima.
- As verificações técnicas reproduzíveis são `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` e `pnpm build`.
- A produção somente ficará conforme depois de receber uma nova implantação com estas alterações.
