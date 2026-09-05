// Typed client for the real Plaud Developer API (https://platform.plaud.ai/developer/api).
// Auth is handled by lib/plaud/tokens.ts (reuses the MCP OAuth tokens, auto-refresh).
//
// Endpoints (verified live):
//   GET /open/third-party/users/current
//   GET /open/third-party/files/?page=&page_size=   (page_size >= 10)
//   GET /open/third-party/files/{id}

import { getAccessToken, PlaudAuthError } from './tokens';

const API_BASE = process.env.PLAUD_API_BASE || 'https://platform.plaud.ai/developer/api';

/** A recording as returned by the files list endpoint. `duration` is in milliseconds. */
export interface PlaudFile {
  id: string;
  name: string;
  created_at: string;
  serial_number?: string;
  start_at: string;
  duration: number;
}

export interface PlaudFilesPage {
  data: PlaudFile[];
  page: number;
  page_size: number;
}

/** Preserva o status HTTP para as rotas distinguirem ausência de falha do serviço. */
export class PlaudApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'PlaudApiError';
  }
}

async function plaudFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  if (res.status === 401) {
    throw new PlaudAuthError('Plaud recusou o token (401). Reautentique o MCP do Plaud.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new PlaudApiError(res.status, `Plaud API ${path} respondeu ${res.status}. ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** List recordings. Plaud requires page_size >= 10. */
export async function listFiles(page = 1, pageSize = 20): Promise<PlaudFilesPage> {
  const size = Math.max(10, pageSize);
  const j = await plaudFetch<{ data: PlaudFile[]; page: number; page_size: number }>(
    `/open/third-party/files/?page=${page}&page_size=${size}`
  );
  return { data: j.data ?? [], page: j.page ?? page, page_size: j.page_size ?? size };
}

/** A raw segment inside a recording's source_list / note_list. */
export interface PlaudSegment {
  data_id?: string;
  data_type?: string;
  data_title?: string;
  data_content?: string;
  data_link?: string;
}

export interface PlaudFileDetail extends PlaudFile {
  presigned_url?: string | null;
  source_list?: PlaudSegment[];
  note_list?: PlaudSegment[];
}

/** Fetch full detail for a single recording (transcript/summary segments live here). */
export async function getFile(id: string): Promise<PlaudFileDetail> {
  return plaudFetch<PlaudFileDetail>(`/open/third-party/files/${encodeURIComponent(id)}`);
}

/**
 * Resolve a segment's text: inline `data_content` when present, otherwise fetch
 * from its `data_link` (S3). Returns '' on any failure — callers treat empty as
 * "not processed yet". The link is a plain-text or JSON payload.
 */
export async function resolveSegmentText(seg: PlaudSegment): Promise<string> {
  if (seg.data_content && seg.data_content.trim()) return seg.data_content;
  if (!seg.data_link) return '';
  try {
    const res = await fetch(seg.data_link);
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

// Real Plaud segment data_types (observed live):
//   transaction   -> transcript: JSON array of speech segments [{content, ...}]
//   outline       -> topics:     JSON array of [{start_time, end_time, topic}]
//   auto_sum_note -> summary:     Markdown text (use as-is)
//   mark_memo     -> highlight markers (ignored — not body text)
const SEG = { transaction: 'transaction', outline: 'outline', autoSum: 'auto_sum_note' } as const;

function findSeg(list: PlaudSegment[] | undefined, type: string): PlaudSegment | undefined {
  return (list ?? []).find((s) => s.data_type === type);
}

/** transaction content is a JSON array of speech segments — join their `content`. */
function parseTranscript(raw: string): string {
  try {
    const arr = JSON.parse(raw) as Array<{ content?: string; speaker?: string | number }>;
    if (!Array.isArray(arr)) return raw;
    return arr
      .map((s) => (s?.content ?? '').trim())
      .filter(Boolean)
      .join('\n\n');
  } catch {
    return raw;
  }
}

/** outline content is a JSON array of {topic}; return the unique topic labels. */
function parseTopics(raw: string): string[] {
  try {
    const arr = JSON.parse(raw) as Array<{ topic?: string }>;
    if (!Array.isArray(arr)) return [];
    const topics = arr.map((o) => (o?.topic ?? '').trim()).filter(Boolean);
    return [...new Set(topics)];
  } catch {
    return [];
  }
}

/**
 * Build a normalized detail with transcript + summary + topics pulled from the
 * recording's real segments. Empty strings/arrays mean Plaud hasn't produced
 * that artifact yet (audio-only recording), which the UI surfaces honestly.
 */
export async function getFileContent(id: string): Promise<{
  file: PlaudFileDetail;
  transcript: string;
  summary: string;
  topics: string[];
}> {
  const file = await getFile(id);
  const sources = file.source_list ?? [];
  const notes = file.note_list ?? [];

  const txSeg = findSeg(sources, SEG.transaction);
  const olSeg = findSeg(sources, SEG.outline);
  // Summary lives in note_list (auto_sum_note); fall back to any note segment.
  const sumSeg =
    findSeg(notes, SEG.autoSum) ??
    notes.find((n) => (n.data_type ?? '').toLowerCase().includes('sum')) ??
    notes[0];

  const [txRaw, olRaw, sumRaw] = await Promise.all([
    txSeg ? resolveSegmentText(txSeg) : Promise.resolve(''),
    olSeg ? resolveSegmentText(olSeg) : Promise.resolve(''),
    sumSeg ? resolveSegmentText(sumSeg) : Promise.resolve(''),
  ]);

  return {
    file,
    transcript: txRaw ? parseTranscript(txRaw) : '',
    summary: sumRaw.trim(),
    topics: olRaw ? parseTopics(olRaw) : [],
  };
}

/** Whether Plaud tokens are available at all (used by the settings status UI). */
export async function isPlaudConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}
