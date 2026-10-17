// Ghi chi phí thật (theo usage API trả về) để popup hiển thị.

export interface UsageStats {
  month: string;
  monthUsd: number;
  totalUsd: number;
  /** videoId → USD, giữ ~50 video gần nhất. */
  byVideo: Record<string, number>;
}

const KEY = 'usage';
const thisMonth = () => new Date().toISOString().slice(0, 7);

export async function loadUsage(): Promise<UsageStats> {
  const got = (await browser.storage.local.get(KEY))[KEY] as UsageStats | undefined;
  const u: UsageStats = got ?? { month: thisMonth(), monthUsd: 0, totalUsd: 0, byVideo: {} };
  if (u.month !== thisMonth()) {
    u.month = thisMonth();
    u.monthUsd = 0;
  }
  return u;
}

let chain: Promise<void> = Promise.resolve();

/** Cộng dồn tuần tự để các request song song không ghi đè nhau. */
export function addUsage(videoId: string, usd: number): Promise<void> {
  chain = chain.then(async () => {
    const u = await loadUsage();
    u.monthUsd += usd;
    u.totalUsd += usd;
    const { [videoId]: prev = 0, ...rest } = u.byVideo;
    const ids = Object.keys(rest);
    const kept = Object.fromEntries(ids.slice(Math.max(0, ids.length - 49)).map((id) => [id, rest[id]!]));
    u.byVideo = { ...kept, [videoId]: prev + usd };
    await browser.storage.local.set({ [KEY]: u });
  });
  return chain;
}
