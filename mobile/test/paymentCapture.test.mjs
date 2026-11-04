import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePaymentEvents, mergePaymentEvents } from '../src/paymentCapture.ts';
import { decodeLedger, monthlyTotal } from '../src/ledger.ts';

const event = { id: 'a'.repeat(64), amountFen: 1, occurredAt: new Date(2026, 10, 4, 12).getTime(), evidence: 'needs_review' };
test('原生候选只生成待记账，持久化后才能确认来源队列，不影响支出统计', () => {
  const parsed = decodePaymentEvents(JSON.stringify([event]));
  const merged = mergePaymentEvents([], parsed);
  assert.equal(merged.added, 1);
  assert.equal(merged.entries[0].state, 'pending');
  assert.equal(merged.entries[0].amountFen, 1);
  assert.equal(merged.entries[0].source, 'wechat_notification');
  assert.equal(monthlyTotal(merged.entries, new Date(2026, 10, 4)), 0);
  assert.deepEqual(merged.acceptedIds, [event.id]);
  assert.deepEqual(decodeLedger(JSON.stringify({ version: 1, entries: merged.entries })), merged.entries);
});
test('同步或确认重试不重复入账，已编辑的记录仍用来源标识去重', () => {
  const first = mergePaymentEvents([], [event]);
  assert.equal(mergePaymentEvents(first.entries, [event, event]).added, 0);
  const edited = [{ ...first.entries[0], merchant: '午餐', category: '餐饮', amountFen: 2800, state: 'saved' }];
  assert.equal(mergePaymentEvents(edited, [event]).added, 0);
});
test('相同金额的独立通知不直接丢弃，附加疑似重复提示', () => {
  const result = mergePaymentEvents([], [event, { ...event, id: 'b'.repeat(64) }]);
  assert.equal(result.added, 2);
  assert.match(result.entries[0].note, /是否重复/);
});
test('无效原生事件整批拒绝，保留原队列供核对', () => {
  for (const invalid of [{ ...event, id: 'raw title' }, { ...event, amountFen: 0.1 }, { ...event, amountFen: 0 }, { ...event, occurredAt: -1 }, { ...event, evidence: 'success' }, { ...event, confirmedCategory: '无效分类' }, { ...event, confirmedCategory: null }]) {
    assert.throws(() => decodePaymentEvents(JSON.stringify([invalid])));
  }
  assert.throws(() => decodePaymentEvents('{}'));
});

test('悬浮窗口明确确认分类后直接入账，重试不重复也不覆盖已编辑账单', () => {
  const confirmed = decodePaymentEvents(JSON.stringify([{ ...event, confirmedCategory: '餐饮' }]));
  const first = mergePaymentEvents([], confirmed);
  assert.equal(first.entries[0].state, 'saved');
  assert.equal(first.entries[0].category, '餐饮');
  assert.equal(monthlyTotal(first.entries, new Date(2026, 10, 4)), 1);
  assert.deepEqual(decodeLedger(JSON.stringify({ version: 1, entries: first.entries })), first.entries);
  const edited = [{ ...first.entries[0], category: '其他', amountFen: 100 }];
  const retry = mergePaymentEvents(edited, confirmed);
  assert.equal(retry.added, 0);
  assert.equal(retry.entries[0].category, '其他');
  assert.equal(retry.entries[0].amountFen, 100);
});
