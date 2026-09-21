/**
 * Detecta gravações em que a consultora está APRESENTANDO — palestra, treinamento
 * ou workshop conduzido por ela.
 *
 * Por que isso importa: a mineração procura a dor do CLIENTE. Numa palestra quem
 * fala é a consultora, e o que ela diz é o próprio discurso comercial da EHS.
 * Minerar isso devolve como "oportunidade detectada" aquilo que ela mesma
 * apresentou — viés circular. O sistema conclui que há demanda por "cultura de
 * segurança" porque ela passou duas horas falando de cultura de segurança.
 *
 * Duas marcas, ambas observadas no acervo real:
 *
 *   1. O resumo do Plaud abre com "Instrutor(a): <nome>" em material didático.
 *      Só vale quando o nome está preenchido: "Instrutor: [Inserir Nome]" é
 *      placeholder e aparece em reuniões comuns.
 *
 *   2. O título começa com "Palestra:", "Treinamento:" ou traz "ws"/"WS" de
 *      workshop. Um título que começa com "Reunião"/"Meeting" é conversa sobre
 *      o evento, não o evento — e essa continua valendo como fonte.
 */

/** Nomes da consultora como aparecem nas transcrições (o Plaud alterna a grafia). */
const CONSULTANT_NAME = /(Andre[zs]a|Andressa|Andresa)/i;

/** "Instrutor(a): Fulano" com nome real — placeholder entre colchetes não conta. */
const INSTRUCTOR_LINE = /Instrutor(?:\(a\)|a|es)?\s*:\s*([^\n]{0,80})/i;

/** Título que anuncia o próprio evento. */
const PRESENTATION_TITLE = /^\d{2}-\d{2}\s+(Palestra|Treinamento)\b/i;

/** Workshop: "ws liderança", "WS AXIA Belém". */
const WORKSHOP_TITLE = /(^|\s)ws\s|WS\s+AXIA/i;

/** Título que descreve uma reunião SOBRE o evento, não o evento em si. */
const MEETING_TITLE = /^\d{2}-\d{2}\s+(Reuni[ãa]o|Meeting|Entrevista|Consulta)\b/i;

export interface PresentationSignal {
  isPresentation: boolean;
  /** Por que foi marcada — vai para log e para a tela, nunca é decisão cega. */
  reason: 'instrutora-nomeada' | 'titulo-palestra' | 'workshop' | null;
}

/**
 * Diz se a gravação é a consultora apresentando.
 *
 * Conservador por desenho: na dúvida devolve `false`. Um falso positivo remove
 * uma conversa legítima de cliente e o sinal se perde em silêncio; um falso
 * negativo deixa passar uma palestra, que o operador ainda pode reclassificar.
 */
export function detectPresentation(
  title: string | null,
  summary: string | null
): PresentationSignal {
  const t = title?.trim() ?? '';
  const s = summary ?? '';

  // Uma reunião sobre o evento é fonte legítima: o cliente falando que precisa
  // de treinamento é exatamente o sinal que a mineração procura.
  if (MEETING_TITLE.test(t)) return { isPresentation: false, reason: null };

  const instructor = s.match(INSTRUCTOR_LINE)?.[1] ?? '';
  // O nome tem de ser real: "[Inserir Nome]" é o placeholder do template.
  if (instructor && !instructor.includes('[') && CONSULTANT_NAME.test(instructor)) {
    return { isPresentation: true, reason: 'instrutora-nomeada' };
  }

  if (PRESENTATION_TITLE.test(t)) return { isPresentation: true, reason: 'titulo-palestra' };
  if (WORKSHOP_TITLE.test(t)) return { isPresentation: true, reason: 'workshop' };

  return { isPresentation: false, reason: null };
}
