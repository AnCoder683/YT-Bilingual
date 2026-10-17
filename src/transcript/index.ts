import { tokenize } from './join';
import { parseJson3 } from './parse';
import { isPunctuated, segment, type SegmentOptions } from './segment';
import type { Json3, Sentence, Transcript } from './types';

export function buildTranscript(json: Json3, lang: string | null, opts?: SegmentOptions): Transcript {
  const tokens = tokenize(parseJson3(json), lang);
  return { tokens, sentences: segment(tokens, opts), punctuated: isPunctuated(tokens) };
}

export function buildSentences(json: Json3, lang: string | null, opts?: SegmentOptions): Sentence[] {
  return buildTranscript(json, lang, opts).sentences;
}

export type { Json3, Sentence, Token, Transcript } from './types';
