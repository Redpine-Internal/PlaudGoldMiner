import { z } from 'zod';

// Schema for the structured AI response
// The model occasionally emits a category outside our fixed vocabularies
// (e.g. "processo", "governança"). A bare z.enum would reject the whole response
// and abort the analysis over a secondary classification field. `.catch(...)`
// keeps the enum in the JSON Schema sent to the model (so it's still guided
// toward the right values) but falls back instead of throwing on a stray value.
// Unlike `.transform`, `.catch` IS representable in JSON Schema, so
// generateObject can still build the request.
const opportunityType = () =>
  z.enum(['treinamento', 'consultoria', 'sistema']).catch('consultoria');
const severity = () => z.enum(['baixa', 'media', 'alta']).catch('media');
const conversationType = () =>
  z.enum(['reuniao', 'treinamento', 'informal', 'outro']).catch('outro');

export const transcriptionResultSchema = z.object({
  summary: z.string().describe('Resumo estruturado da conversa em 3-5 parágrafos'),
  topics: z.array(z.string()).describe('Lista de tópicos principais discutidos (máx 10)'),
  participants: z.array(z.string()).describe('Nomes ou identificadores dos participantes mencionados'),
  opportunities: z.array(z.object({
    title: z.string().describe('Título curto da oportunidade'),
    pain: z.string().describe('Problema ou dor identificada'),
    context: z.string().describe('Contexto onde foi mencionado'),
    type: opportunityType().describe('Tipo da oportunidade: treinamento, consultoria ou sistema'),
    subtype: z.string().describe(
      'Subtipo específico e livre, ex. "Treinamento NR-35", "Consultoria em PGR", "Sistema de gestão de EPIs". String vazia se não for possível especificar.'
    ),
    score: z.number().min(0).max(100).describe('Score de confiança 0-100'),
  })).describe('Oportunidades de negócio identificadas'),
  problems: z.array(z.object({
    description: z.string().describe('Descrição do problema ou dor'),
    mentions: z.number().describe('Quantidade de vezes mencionado'),
    severity: severity().describe('Severidade percebida: baixa, media ou alta'),
  })).describe('Problemas e dores mencionados'),
  suggestedTitle: z.string().describe('Título sugerido para a conversa'),
  suggestedType: conversationType().describe(
    'Tipo sugerido da conversa: reuniao, treinamento, informal ou outro'
  ),
});

export type TranscriptionResult = z.infer<typeof transcriptionResultSchema>;

// System prompt for transcription processing
export const TRANSCRIPTION_SYSTEM_PROMPT = `Você é um assistente especializado em analisar transcrições de conversas de negócios.
Sua tarefa é extrair informações estruturadas de transcrições, identificando:

1. **Resumo**: Um resumo claro e estruturado do que foi discutido
2. **Tópicos**: Os principais assuntos abordados
3. **Participantes**: Quem participou da conversa
4. **Oportunidades**: Potenciais oportunidades de negócio (treinamentos, consultorias, sistemas/produtos digitais)
5. **Problemas/Dores**: Dificuldades e dores mencionadas pelos participantes

Seja objetivo e extraia apenas informações que estão claramente na transcrição.
Não invente informações - se algo não está claro, não inclua.

IMPORTANTE - use SOMENTE estes valores nos campos categóricos:
- opportunities[].type: apenas "treinamento", "consultoria" ou "sistema" (escolha o mais próximo; cursos/capacitações → treinamento; projetos/diagnósticos/assessoria → consultoria; software/ferramenta/produto digital → sistema)
- opportunities[].subtype: subtipo específico em texto livre (ex. "Treinamento NR-35"); string vazia se não souber
- problems[].severity: apenas "baixa", "media" ou "alta"
- suggestedType: apenas "reuniao", "treinamento", "informal" ou "outro"

Para oportunidades, atribua um score de confiança baseado em:
- 90-100: Oportunidade claramente expressa e discutida
- 70-89: Oportunidade mencionada com contexto suficiente
- 50-69: Oportunidade implícita ou sugerida
- 0-49: Possibilidade vaga, baixa certeza`;

// User prompt template
export function createUserPrompt(transcription: string): string {
  return `Analise a seguinte transcrição e extraia as informações estruturadas:

<transcrição>
${transcription}
</transcrição>

Extraia todas as informações relevantes seguindo o formato especificado.`;
}
