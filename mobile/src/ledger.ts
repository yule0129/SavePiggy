export const CATEGORIES = ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '学习', '其他'] as const;
export type Category = (typeof CATEGORIES)[number];
export type Period = { mode: 'month' | 'year'; year: number; month: number };
export type Entry = {
  id: string;
  amountFen: number;
  merchant: string;
  category: Category | null;
  state: 'pending' | 'saved';
  source: 'demo' | 'manual';
  createdAt: string;
};

export function parseAmount(value: string): number | null {
  const clean = value.trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean)) return null;
  const [yuan, fraction = ''] = clean.split('.');
  const fen = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'));
  return fen > 0 && fen <= 999999999 ? fen : null;
}

export function formatAmount(fen: number): string { return (fen / 100).toFixed(2); }

export function monthlyTotal(entries: Entry[], now = new Date()): number {
  return periodEntries(entries, { mode: 'month', year: now.getFullYear(), month: now.getMonth() })
    .reduce((sum, entry) => sum + entry.amountFen, 0);
}

export function periodEntries(entries: Entry[], period: Period): Entry[] {
  return entries.filter(entry => {
    const date = new Date(entry.createdAt);
    return entry.state === 'saved' && date.getFullYear() === period.year
      && (period.mode === 'year' || date.getMonth() === period.month);
  });
}

export function shiftPeriod(period: Period, step: number): Period {
  if (period.mode === 'year') return { ...period, year: period.year + step };
  const date = new Date(period.year, period.month + step, 1);
  return { ...period, year: date.getFullYear(), month: date.getMonth() };
}

export function dateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseEntryDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) return null;
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function decodeLedger(raw: string | null): Entry[] {
  if (raw === null) return [];
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Array.isArray(data.entries)) throw new Error('不支持的数据格式');
  const ids = new Set<string>();
  for (const entry of data.entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)
      || !Number.isSafeInteger(entry.amountFen) || entry.amountFen <= 0 || entry.amountFen > 999999999
      || typeof entry.merchant !== 'string' || !['pending', 'saved'].includes(entry.state)
      || !['demo', 'manual'].includes(entry.source)
      || !(entry.category === null || CATEGORIES.includes(entry.category))
      || (entry.state === 'saved' && entry.category === null)
      || typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt))) {
      throw new Error('账单数据校验失败');
    }
    ids.add(entry.id);
  }
  return data.entries;
}
