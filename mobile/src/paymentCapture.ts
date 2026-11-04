import { CATEGORIES, dateInputValue } from './ledger.ts';
import type { Category, Entry } from './ledger.ts';

export type PaymentEvent = { id: string; amountFen: number; occurredAt: number; evidence: 'needs_review'; confirmedCategory?: Category };

export function decodePaymentEvents(raw: string): PaymentEvent[] {
  const events = JSON.parse(raw);
  if (!Array.isArray(events) || events.length > 100) throw new Error('付款候选队列格式无效');
  for (const event of events) {
    if (!event || !/^[a-f0-9]{64}$/.test(event.id) || !Number.isSafeInteger(event.amountFen)
      || event.amountFen <= 0 || event.amountFen > 999999999 || !Number.isSafeInteger(event.occurredAt)
      || event.occurredAt < 946684800000 || event.occurredAt > Date.now() + 86400000
      || event.evidence !== 'needs_review'
      || (event.confirmedCategory !== undefined && !CATEGORIES.includes(event.confirmedCategory))) throw new Error('付款候选内容无法校验，已暂停同步');
  }
  return events;
}

export function mergePaymentEvents(entries: Entry[], events: PaymentEvent[]): { entries: Entry[]; acceptedIds: string[]; added: number } {
  const next = [...entries];
  const acceptedIds = new Set<string>();
  let added = 0;
  for (const event of events) {
    acceptedIds.add(event.id);
    if (next.some(entry => entry.captureId === event.id || entry.id === `wechat-${event.id}`)) continue;
    const date = new Date(event.occurredAt);
    const suspected = next.some(entry => entry.channel === '微信' && entry.amountFen === event.amountFen
      && dateInputValue(new Date(entry.createdAt)) === dateInputValue(date));
    next.unshift({ id: `wechat-${event.id}`, captureId: event.id, amountFen: event.amountFen,
      merchant: '微信付款候选', category: event.confirmedCategory ?? null, state: event.confirmedCategory ? 'saved' : 'pending', source: 'wechat_notification',
      channel: '微信', createdAt: date.toISOString(), note: `${event.confirmedCategory ? '已在悬浮窗口核对金额并选择分类。' : '通知仅提供候选金额，请核对是否为实际消费。'}${suspected ? '同日存在相同金额，请核对是否重复。' : ''}` });
    added++;
  }
  return { entries: next, acceptedIds: [...acceptedIds], added };
}
