import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, monthlyTotal, decodeLedger, periodEntries, shiftPeriod, dateInputValue, parseEntryDate } from '../src/ledger.ts';

const entry = { id: 'one', amountFen: 2800, merchant: '午餐', category: '餐饮', state: 'saved', source: 'demo', createdAt: new Date(2026, 9, 26, 12).toISOString() };
test('金额按分精确解析，拒绝无效值与超过两位小数的输入', () => {
  assert.equal(parseAmount('0.29'), 29);
  assert.equal(parseAmount('28.1'), 2810);
  assert.equal(parseAmount('9999999.99'), 999999999);
  for (const value of ['', '0', '-1', '1.001', '1e2', 'abc', '10000000']) assert.equal(parseAmount(value), null);
});
test('本月汇总仅计入本月已保存记录', () => {
  const entries = [entry, { ...entry, id: 'two', state: 'pending' }, { ...entry, id: 'three', createdAt: new Date(2026, 8, 26).toISOString() }];
  assert.equal(monthlyTotal(entries, new Date(2026, 9, 27)), 2800);
  assert.equal(monthlyTotal(entries, new Date(2027, 9, 27)), 0);
});
test('本地数据可往返读取，损坏或重复数据拒绝加载', () => {
  assert.deepEqual(decodeLedger(null), []);
  assert.deepEqual(decodeLedger(JSON.stringify({ version: 1, entries: [entry] })), [entry]);
  for (const data of [{ version: 2, entries: [] }, { version: 1, entries: [entry, entry] }, { version: 1, entries: [{ ...entry, category: null }] }, { version: 1, entries: [{ ...entry, amountFen: 0.1 }] }]) assert.throws(() => decodeLedger(JSON.stringify(data)));
  assert.throws(() => decodeLedger('broken'));
});

test('按年包含同年不同月份，按月只包含所选月，均排除待记账和其他年份', () => {
  const records = [entry,
    { ...entry, id: 'january', amountFen: 100, createdAt: new Date(2026, 0, 1).toISOString() },
    { ...entry, id: 'december', amountFen: 200, createdAt: new Date(2026, 11, 31, 23, 59).toISOString() },
    { ...entry, id: 'next-year', createdAt: new Date(2027, 0, 1).toISOString() },
    { ...entry, id: 'pending', state: 'pending' }];
  const year = periodEntries(records, { mode: 'year', year: 2026, month: 9 });
  assert.equal(year.length, 3);
  assert.equal(year.reduce((sum, item) => sum + item.amountFen, 0), 3100);
  assert.deepEqual(periodEntries(records, { mode: 'month', year: 2026, month: 9 }), [entry]);
  assert.deepEqual(periodEntries(records, { mode: 'year', year: 2025, month: 0 }), []);
});

test('月份跨年切换和年份切换正确', () => {
  assert.deepEqual(shiftPeriod({ mode: 'month', year: 2026, month: 0 }, -1), { mode: 'month', year: 2025, month: 11 });
  assert.deepEqual(shiftPeriod({ mode: 'month', year: 2026, month: 11 }, 1), { mode: 'month', year: 2027, month: 0 });
  assert.deepEqual(shiftPeriod({ mode: 'year', year: 2026, month: 9 }, -1), { mode: 'year', year: 2025, month: 9 });
});

test('补记日期保留本地日历日期，并校验闰年与无效日期', () => {
  assert.equal(dateInputValue(parseEntryDate('2024-02-29')), '2024-02-29');
  assert.equal(dateInputValue(parseEntryDate('2026-01-01')), '2026-01-01');
  for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-1', '', '0099-01-01']) assert.equal(parseEntryDate(value), null);
});
