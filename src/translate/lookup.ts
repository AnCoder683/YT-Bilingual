import type { LookupRequest, LookupResult } from '../messages';

export const LOOKUP_VERSION = 2;

export const LOOKUP_SYSTEM = `You are a concise dictionary for language learners watching videos.
The user picked a word or phrase from a subtitle sentence. Explain what it means IN THAT SENTENCE.

Fields:
- term: dictionary form of the picked text ("burned out" -> "burn out", "kids" -> "kid"). If the picked text is part of a phrasal verb or idiom in this sentence, give the whole expression.
- ipa: IPA pronunciation of term in its usual accent for the source language (e.g. General American for English), between slashes. Empty string if not meaningful.
- pos: part of speech in English, short (noun, verb, adjective, adverb, phrasal verb, idiom, ...).
- meaning: meaning in this sentence, written in target_lang, short (at most ~12 words). Natural wording a learner would remember.
- definition: short English definition (at most ~15 words), learner-dictionary style.
- note: optional usage note (register, slang, common collocation, a different common meaning). At most ~20 words. Empty string if nothing useful.

Language: meaning and note MUST be written in target_lang (e.g. Vietnamese when target_lang is "vi"), never in English unless target_lang is English. Only definition is always English.`;

export const LOOKUP_SCHEMA = {
  type: 'object',
  properties: {
    term: { type: 'string' },
    ipa: { type: 'string' },
    pos: { type: 'string' },
    meaning: { type: 'string' },
    definition: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['term', 'ipa', 'pos', 'meaning', 'definition', 'note'],
  additionalProperties: false,
} as const;

export type LookupInput = Omit<LookupRequest, 'type' | 'videoId'>;

export function buildLookupMessage(i: LookupInput): string {
  return JSON.stringify({
    picked: i.picked,
    sentence: i.sentence,
    sentence_translation: i.translation || undefined,
    video_title: i.title || undefined,
    source_lang: i.sourceLang,
    target_lang: i.targetLang,
  });
}

/** Đọc JSON Claude trả; thiếu nghĩa thì báo lỗi. */
export function parseLookup(raw: string, picked: string): LookupResult {
  const o = JSON.parse(raw) as Partial<Record<keyof LookupResult, unknown>>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const r: LookupResult = {
    term: str(o.term) || picked,
    ipa: str(o.ipa),
    pos: str(o.pos),
    meaning: str(o.meaning),
    definition: str(o.definition),
    note: str(o.note),
  };
  if (!r.meaning && !r.definition) throw new Error('thiếu nghĩa');
  return r;
}
