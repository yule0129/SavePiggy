import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestCategory } from '../src/categorySuggestions.ts';
import { prepareImport, previewCsv } from '../src/importCsv.ts';

const saved = { id: 'history', amountFen: 1000, merchant: '咖啡小店', category: '学习', state: 'saved', source: 'manual', channel: '微信', createdAt: '2026-11-03T04:00:00.000Z' };
const header = '日期,金额,商家,类型,支付渠道,交易号,分类,状态';
const parse = (rows, existing = []) => previewCsv(`${header}\n${rows.join('\n')}`, existing);

test('优先沿用真实已确认历史，忽略模拟和待记账，历史冲突要求手动判断', () => {
  assert.equal(suggestCategory(' 咖啡小店 ', '微信', [saved]).category, '学习');
  assert.equal(suggestCategory('咖啡小店', '微信', [{ ...saved, source: 'demo' }]).source, 'keyword');
  assert.equal(suggestCategory('咖啡小店', '微信', [{ ...saved, state: 'pending' }]).source, 'keyword');
  assert.equal(suggestCategory('咖啡小店', '支付宝', [saved]).category, '餐饮');
  const conflict = suggestCategory('咖啡小店', '微信', [saved, { ...saved, id: 'other', category: '餐饮' }]);
  assert.equal(conflict.category, null);
  assert.equal(conflict.source, 'history');
});

test('未知商家和含多个类别关键词的商家不强行分类', () => {
  assert.equal(suggestCategory('某某商户', '微信', []), null);
  assert.equal(suggestCategory('书店咖啡', '微信', []), null);
  assert.equal(suggestCategory('地铁出行', '微信', []).category, '交通');
});

test('尊重文件分类；空分类自动建议；无效文件分类仍要求核对', () => {
  const rows = parse([
    '2026-11-03,10.00,咖啡小店,支出,微信,A1,,成功',
    '2026-11-03,20.00,咖啡小店,支出,微信,A2,其他,成功',
    '2026-11-03,30.00,咖啡小店,支出,微信,A3,无效分类,成功',
  ], [saved]).rows;
  assert.equal(rows[0].candidate.category, '学习');
  assert.equal(rows[0].categorySource, 'history');
  assert.equal(rows[1].candidate.category, '其他');
  assert.equal(rows[1].categorySource, 'file');
  assert.equal(rows[2].candidate.category, null);
});

test('批量确认仅入账已分类记录，未分类保留待记账，不修改原始预览', () => {
  const rows = parse([
    '2026-11-03,28.00,午餐餐厅,支出,微信,A1,,成功',
    '2026-11-03,6.00,地铁,支出,微信,A2,,成功',
    '2026-11-03,8.00,某某商户,支出,微信,A3,,成功',
  ]).rows;
  const selected = new Set(rows.map(row => row.line));
  const result = prepareImport(rows, selected, [], true);
  assert.equal(result.saved, 2);
  assert.equal(result.pending, 1);
  assert.equal(result.additions.filter(entry => entry.state === 'saved').reduce((sum, entry) => sum + entry.amountFen, 0), 3400);
  assert.ok(rows.every(row => row.candidate.state === 'pending'));
  assert.equal(prepareImport(rows, selected, [], false).saved, 0);
  assert.equal(prepareImport(rows, selected, result.additions, true).additions.length, 0);
});

test('预览后出现新重复需重新核对，疑似重复仍需明确勾选', () => {
  const row = parse(['2026-11-03,28.00,午餐餐厅,支出,微信,A1,,成功']).rows[0];
  const concurrent = { ...row.candidate, id: 'concurrent', externalId: undefined };
  assert.equal(prepareImport([row], new Set([row.line]), [concurrent], true).additions.length, 0);
  const suspected = { ...row, status: 'suspected' };
  assert.equal(prepareImport([suspected], new Set(), [concurrent], true).additions.length, 0);
  assert.equal(prepareImport([suspected], new Set([row.line]), [concurrent], true).saved, 1);
});
