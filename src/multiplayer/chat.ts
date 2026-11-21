import type { TeamId } from '../maps/types';

export type ChatChannel = 'all' | 'team';

export interface ChatPayload {
  text: string;
  channel: ChatChannel;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderTeam: TeamId | 'system';
  channel: ChatChannel;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export const CHAT_MAX_LENGTH = 140;
export const CHAT_RATE_LIMIT_MS = 600;
export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_FADE_MS = 6000;

export const QUICK_CHAT_CALLOUTS: readonly string[] = [
  'Ready',
  'Switch teams?',
  'Start match',
  'GLHF',
] as const;

export function sanitizeChatText(raw: string): string {
  const replaced = raw.replace(/[\r\n\t]+/g, ' ');
  let clean = '';
  for (let i = 0; i < replaced.length; i++) {
    const code = replaced.charCodeAt(i);
    // Strip ASCII C0 controls, DEL, C1 controls, and bidirectional override characters
    if (
      code <= 0x1f ||
      code === 0x7f ||
      (code >= 0x80 && code <= 0x9f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    ) {
      continue;
    }
    clean += replaced[i];
  }
  const trimmed = clean.trim();
  if (trimmed.length === 0) return '';
  return trimmed.slice(0, CHAT_MAX_LENGTH).trim();
}

export function validateChatPayload(raw: unknown): ChatPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as { text?: unknown; channel?: unknown };
  if (typeof candidate.text !== 'string') {
    return null;
  }
  if (candidate.channel !== 'all' && candidate.channel !== 'team') {
    return null;
  }
  const cleanText = sanitizeChatText(candidate.text);
  if (cleanText.length === 0) {
    return null;
  }
  return {
    text: cleanText,
    channel: candidate.channel,
  };
}

export function formatChatTimestamp(timestampMs: number): string {
  const d = new Date(timestampMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
