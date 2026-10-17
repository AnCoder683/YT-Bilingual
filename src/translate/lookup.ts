import type { LookupRequest, LookupResult } from '../messages';
import { languageName } from './prompt';

export const LOOKUP_VERSION = 5;

export const LOOKUP_SYSTEM = `You are a concise dictionary for language learners watching videos.
Explain the picked word or phrase as used IN THE GIVEN SENTENCE. Follow "reminder" for output languages.

Fields:
- term: dictionary form ("burned out" -> "burn out", "kids" -> "kid"); the whole phrasal verb or idiom if the pick is part of one.
- ipa: IPA in the source language's usual accent (General American for English), between slashes; "" if not meaningful.
- pos: short English label (noun, verb, phrasal verb, idiom, ...).
- meaning: meaning in this sentence, at most ~12 words, natural wording a learner would remember.
- note: optional usage note (register, slang, collocation, another common meaning), at most ~20 words; "" if nothing useful.
- definition: learner-dictionary English definition, at most ~15 words.

meaning and note never use English unless that is the requested language; quoting the source words is fine.`;

export const LOOKUP_SCHEMA = {
  type: 'object',
  properties: {
    term: { type: 'string' },
    ipa: { type: 'string' },
    pos: { type: 'string' },
    meaning: { type: 'string' },
    note: { type: 'string' },
    definition: { type: 'string' },
  },
  required: ['term', 'ipa', 'pos', 'meaning', 'note', 'definition'],
  additionalProperties: false,
} as const;

export type LookupInput = Omit<LookupRequest, 'type' | 'videoId'>;

/** Dòng định nghĩa tiếng Anh chỉ có khi video là tiếng Anh. */
export function hasDefinition(sourceLang: string): boolean {
  return sourceLang.toLowerCase().split('-')[0] === 'en';
}

export function buildLookupMessage(i: LookupInput): string {
  const lang = languageName(i.targetLang);
  const def = hasDefinition(i.sourceLang) ? 'definition in English' : 'definition ""';
  return JSON.stringify({
    picked: i.picked,
    sentence: i.sentence,
    sentence_translation: i.translation || undefined,
    video_title: i.title || undefined,
    source_lang: i.sourceLang,
    reminder: `meaning and note in ${lang}; ${def}.`,
  });
}

/** Đọc JSON Claude trả; thiếu nghĩa thì báo lỗi. */
export function parseLookup(raw: string, picked: string, sourceLang = 'en'): LookupResult {
  const o = JSON.parse(raw) as Partial<Record<keyof LookupResult, unknown>>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const r: LookupResult = {
    term: str(o.term) || picked,
    ipa: str(o.ipa),
    pos: str(o.pos),
    meaning: str(o.meaning),
    definition: hasDefinition(sourceLang) ? str(o.definition) : '',
    note: str(o.note),
  };
  if (!r.meaning && !r.definition) throw new Error('thiếu nghĩa');
  return r;
}
