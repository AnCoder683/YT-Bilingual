import { modelInfo } from '../settings';

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Chi phí ước tính (USD) của một response. */
export function costUsd(model: string, u: UsageLike): number {
  const m = modelInfo(model);
  const M = 1_000_000;
  return (
    (u.input_tokens * m.input +
      u.output_tokens * m.output +
      (u.cache_creation_input_tokens ?? 0) * m.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * m.cacheRead) /
    M
  );
}
