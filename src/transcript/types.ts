export interface Json3Seg {
  utf8?: string;
  tOffsetMs?: number;
}

export interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  aAppend?: number;
  segs?: Json3Seg[];
}

export interface Json3 {
  events?: Json3Event[];
}

/** Một mảnh chữ có mốc thời gian, lấy thẳng từ một seg của json3. */
export interface Piece {
  text: string;
  startMs: number;
  endMs: number;
}

/** Một từ (hoặc cụm không tách được) sau khi tách mảnh. */
export interface Token {
  text: string;
  startMs: number;
  endMs: number;
  /** Có dấu cách giữa token trước và token này khi ghép lại. */
  spaceBefore: boolean;
}

export interface Sentence {
  id: number;
  text: string;
  startMs: number;
  endMs: number;
  /** Khoảng token [tokStart, tokEnd) trong Transcript.tokens. */
  tokStart: number;
  tokEnd: number;
}

export interface Transcript {
  tokens: Token[];
  /** Câu chia bằng heuristic (đơn vị hiển thị khi chưa có bản dịch). */
  sentences: Sentence[];
  /** Có dấu câu thật (phụ đề người làm) hay ASR. */
  punctuated: boolean;
}
