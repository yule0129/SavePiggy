import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCandidate, csvTemplate, fingerprint, previewCsv } from '../src/importCsv.ts';
import { decodeLedger, monthlyTotal } from '../src/ledger.ts';

const header = '日期,金额,商家,类型,支付渠道,交易号,分类,状态,备注';
const row = '2026-10-26,28.00,午餐,支出,微信,00000000000000000001,餐饮,成功,工作餐';
const parse = (rows, existing = []) => previewCsv(`${header}\r\n${rows.join('\r\n')}`, existing);

test('CSV 生成待记账，保持长交易号、金额精度和来源，导入本身不改变统计', () => {
  const result = parse([row]);
  assert.equal(result.rows[0].status, 'ready');
  const candidate = result.rows[0].candidate;
  assert.equal(candidate.amountFen, 2800);
  assert.equal(candidate.externalId, '00000000000000000001');
  assert.equal(candidate.source, 'csv');
  assert.equal(candidate.category, '餐饮');
  assert.equal(candidate.note, '工作餐');
  assert.equal(monthlyTotal([candidate], new Date(2026, 9, 26)), 0);
  assert.equal(monthlyTotal([{ ...candidate, state: 'saved' }], new Date(2026, 9, 26)), 2800);
  assert.deepEqual(decodeLedger(JSON.stringify({ version: 1, entries: [candidate] })), [candidate]);
});

test('同一文件和再次导入按渠道交易号去重，来源字段不因编辑而失效', () => {
  const result = parse([row, row]);
  assert.deepEqual(result.rows.map(item => item.status), ['ready', 'duplicate']);
  const edited = { ...result.rows[0].candidate, amountFen: 2900, channel: '现金', merchant: '已修改午餐', state: 'saved' };
  assert.equal(parse([row], [edited]).rows[0].status, 'duplicate');
  assert.equal(parse([row.replace('28.00', '29.00')], [edited]).rows[0].status, 'invalid');
  const otherChannel = parse([row.replace(',微信,', ',支付宝,')], [edited]);
  assert.equal(otherChannel.rows[0].status, 'ready');
});

test('相同金额不能直接判为重复，无交易号的相同日期商家渠道标记疑似重复', () => {
  const first = parse([row]).rows[0].candidate;
  const noId = row.replace('00000000000000000001', '');
  assert.equal(parse([noId], [first]).rows[0].status, 'suspected');
  assert.equal(parse([row.replace('午餐', '晚餐')], [{ ...first, externalId: undefined }]).rows[0].status, 'ready');
  assert.equal(parse([row.replace('00000000000000000001', '00000000000000000002')], [first]).rows[0].status, 'suspected');
});

test('收入退款转账和非成功付款明确跳过，未知类型和状态要求修正', () => {
  const types = ['收入', '退款', '转账', '充值', '还款'];
  assert.ok(parse(types.map(kind => row.replace(',支出,', `,${kind},`))).rows.every(item => item.status === 'skipped'));
  assert.equal(parse([row.replace(',成功,', ',失败,')]).rows[0].status, 'skipped');
  assert.equal(parse([row.replace(',成功,', ',部分退款,')]).rows[0].status, 'skipped');
  assert.equal(parse([row.replace(',支出,', ',商户消费,')]).rows[0].status, 'invalid');
  assert.equal(parse([row.replace(',成功,', ',未知,')]).rows[0].status, 'invalid');
});

test('引号中的逗号、换行和双引号可解析，格式损坏不部分写入', () => {
  const csv = '\uFEFF' + header + '\n2026-10-26,28.00,"午餐,小店",支出,微信,A,餐饮,成功,"第一行\n第二行"';
  const result = previewCsv(csv, []);
  assert.equal(result.rows[0].candidate.merchant, '午餐,小店');
  assert.equal(result.rows[0].candidate.note, '第一行\n第二行');
  const escaped = parse([row.replace('午餐', '"午餐""小店"')]);
  assert.equal(escaped.rows[0].candidate.merchant, '午餐"小店');
  assert.throws(() => previewCsv(header + '\n"unfinished', []), /引号/);
  assert.equal(parse([row + ',多余列']).rows[0].status, 'invalid');
});

test('无效日期、小数、科学计数交易号与缺失必填信息不会成为可导入支出', () => {
  for (const invalid of [row.replace('2026-10-26', '2026-02-29'), row.replace('28.00', '0'), row.replace('28.00', '28.001'), row.replace('00000000000000000001', '1.23E+18'), row.replace(',午餐,', ',,'), row.replace(',微信,', ',,')]) {
    assert.equal(parse([invalid]).rows[0].status, 'invalid');
  }
  assert.throws(() => previewCsv('日期,金额\n2026-10-26,28', []), /必需列/);
  assert.throws(() => previewCsv(header + '\n\uFFFD', []), /UTF-8/);
  assert.throws(() => previewCsv('x'.repeat(2_000_001), []), /文件过大/);
  assert.equal(previewCsv(`${header},币种\n${row},USD`, []).rows[0].status, 'invalid');
});

test('模板可解析；未知分类清空并提示；重复候选确认前可再次核查', () => {
  assert.equal(previewCsv(csvTemplate(new Date(2026, 9, 26)), []).rows[0].status, 'ready');
  const result = parse([row.replace(',餐饮,', ',未知分类,')]);
  assert.equal(result.rows[0].candidate.category, null);
  assert.equal(result.warnings.length, 1);
  const candidate = result.rows[0].candidate;
  assert.equal(candidate.importFingerprint, fingerprint(candidate));
  assert.equal(classifyCandidate(candidate, [candidate]).status, 'duplicate');
  const oldManual = { ...candidate, source: 'manual', externalId: undefined, importFingerprint: undefined };
  assert.equal(classifyCandidate(candidate, [oldManual]).status, 'suspected');
});
