import { CATEGORIES, dateInputValue, parseAmount, parseEntryDate } from './ledger.ts';
import type { Entry } from './ledger.ts';
import { suggestCategory } from './categorySuggestions.ts';

export type ImportRow = {
  line: number;
  status: 'ready' | 'duplicate' | 'suspected' | 'invalid' | 'skipped';
  reason: string;
  candidate?: Entry;
  merchant: string;
  categorySource?: 'file' | 'history' | 'keyword' | 'manual';
  categoryReason?: string;
};
export type ImportPreview = { rows: ImportRow[]; warnings: string[] };
const REQUIRED = ['日期', '金额', '商家', '类型', '支付渠道'];
const CHANNEL_ALIASES: Record<string, string> = { 微信支付: '微信', alipay: '支付宝', 'apple pay': 'Apple Pay' };
export const MAX_IMPORT_ROWS = 1000;

// Keep transaction identifiers as text; never convert them to numbers.
export function normalizeChannel(value: string): string {
  const clean = value.trim();
  return CHANNEL_ALIASES[clean.toLowerCase()] || clean;
}
export function fingerprint(entry: Entry): string {
  return JSON.stringify([dateInputValue(new Date(entry.createdAt)), entry.amountFen, entry.merchant.trim(), normalizeChannel(entry.channel || '')]);
}
function transactionKey(entry: Entry): string | null {
  const sourceChannel = entry.sourceChannel || entry.channel;
  return entry.externalId && sourceChannel ? JSON.stringify([normalizeChannel(sourceChannel), entry.externalId]) : null;
}
export function classifyCandidate(candidate: Entry, entries: Entry[]): Pick<ImportRow, 'status' | 'reason'> {
  const key = transactionKey(candidate);
  const match = key ? entries.find(entry => transactionKey(entry) === key) : undefined;
  if (match) {
    if ((match.importFingerprint || fingerprint(match)) !== candidate.importFingerprint) return { status: 'invalid', reason: '同一渠道和交易号的数据存在冲突，请核对原账单' };
    return { status: 'duplicate', reason: '同一渠道和交易号已经存在，将跳过' };
  }
  if (entries.some(entry => (entry.importFingerprint || fingerprint(entry)) === candidate.importFingerprint)) return { status: 'suspected', reason: '日期、金额、商家和渠道相同，可能重复，默认不选' };
  return { status: 'ready', reason: '可在预览中核对分类，或放入待记账稍后处理' };
}

function parseRecords(input: string): { cells: string[]; line: number }[] {
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [], field = '', quoted = false, closed = false, line = 1, start = 1;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') { field += '"'; index++; }
        else { quoted = false; closed = true; }
      } else { field += char; if (char === '\n') line++; }
      continue;
    }
    if (char === '"') {
      if (field || closed) throw new Error(`第 ${line} 行引号格式不正确`);
      quoted = true;
    } else if (char === ',' || char === '\n' || char === '\r') {
      cells.push(field); field = ''; closed = false;
      if (char !== ',') {
        if (cells.some(cell => cell.trim())) records.push({ cells, line: start });
        cells = [];
        if (char === '\r' && input[index + 1] === '\n') index++;
        line++; start = line;
        if (records.length > MAX_IMPORT_ROWS + 1) throw new Error(`单次最多导入 ${MAX_IMPORT_ROWS} 条，请拆分文件`);
      }
    } else {
      if (closed && char.trim()) throw new Error(`第 ${line} 行引号后有多余字符`);
      if (!closed) field += char;
    }
  }
  if (quoted) throw new Error('CSV 存在未闭合的引号，请检查文件');
  cells.push(field);
  if (cells.some(cell => cell.trim())) records.push({ cells, line: start });
  return records;
}

export function previewCsv(text: string, existing: Entry[]): ImportPreview {
  if (text.length > 2_000_000) throw new Error('文件过大，请使用不超过 2 MB 的 CSV');
  if (text.includes('\uFFFD') || text.includes('\0')) throw new Error('文件编码无法识别，请另存为 UTF-8 CSV');
  const records = parseRecords(text.replace(/^\uFEFF/, ''));
  if (records.length < 2) throw new Error('文件没有账单数据，请使用模板填写后重新导入');
  if (records.length - 1 > MAX_IMPORT_ROWS) throw new Error(`单次最多导入 ${MAX_IMPORT_ROWS} 条，请拆分文件`);
  const headers = records[0].cells.map(cell => cell.trim());
  if (new Set(headers).size !== headers.length) throw new Error('表头存在重复列，请检查文件');
  const missing = REQUIRED.filter(name => !headers.includes(name));
  if (missing.length) throw new Error(`缺少必需列：${missing.join('、')}。请先下载模板；暂不直接支持支付平台原始导出格式。`);
  const warnings = new Set<string>();
  const known = [...existing];
  const rows = records.slice(1).map(({ cells, line }): ImportRow => {
    const values = Object.fromEntries(headers.map((header, index) => [header, (cells[index] || '').trim()]));
    const base = { line, merchant: values['商家'] || '未填写商家' };
    const invalid = (reason: string): ImportRow => ({ ...base, status: 'invalid', reason });
    if (cells.length !== headers.length) return invalid('列数与表头不一致，请检查逗号和引号');
    const kind = values['类型'];
    if (['收入', '退款', '转账', '充值', '还款'].includes(kind)) return { ...base, status: 'skipped', reason: `${kind}暂不作为消费支出导入` };
    if (kind !== '支出') return invalid('类型必须明确填写支出、收入、退款、转账、充值或还款');
    if (headers.includes('状态')) {
      if (['失败', '已关闭', '待付款', '处理中', '已退款', '部分退款', '退款成功'].includes(values['状态'])) return { ...base, status: 'skipped', reason: `交易状态为${values['状态']}，不导入` };
      if (!['成功', '已完成', '支付成功', '交易成功'].includes(values['状态'])) return invalid('状态无法确认，请核对后填写成功或已完成');
    }
    const date = parseEntryDate(values['日期']);
    const amountFen = parseAmount(values['金额']);
    if (values['币种'] && !['CNY', 'RMB', '人民币', '¥', '￥'].includes(values['币种'].toUpperCase())) return invalid('当前仅支持人民币，请勿将外币金额直接作为人民币导入');
    if (!date) return invalid('日期必须是有效的 YYYY-MM-DD');
    if (amountFen === null) return invalid('金额必须大于 0，最多两位小数，不能带货币符号或千分位');
    if (!values['商家'] || values['商家'].length > 60) return invalid('商家不能为空且不得超过 60 字');
    if (!values['支付渠道'] || values['支付渠道'].length > 30) return invalid('支付渠道不能为空且不得超过 30 字');
    if ((values['备注'] || '').length > 200) return invalid('备注不得超过 200 字');
    const externalId = values['交易号'] || undefined;
    if (externalId && (externalId.length > 128 || /^\d+(\.\d+)?e[+-]?\d+$/i.test(externalId))) return invalid('交易号异常，请在表格中按文本保留完整交易号');
    let category = CATEGORIES.find(name => name === values['分类']) || null;
    let categorySource: ImportRow['categorySource'] = category ? 'file' : undefined;
    let categoryReason = category ? '来自文件，可在预览中修改' : '';
    if (values['分类'] && !category) warnings.add('部分分类不在当前分类列表中，将作为未分类记录导入。');
    if (!values['分类']) {
      const suggestion = suggestCategory(values['商家'], normalizeChannel(values['支付渠道']), existing);
      if (suggestion) { category = suggestion.category; categorySource = suggestion.source; categoryReason = suggestion.reason; }
    }
    const candidate: Entry = { id: `csv-${Date.now()}-${line}-${Math.random().toString(36).slice(2)}`, amountFen, merchant: values['商家'], category, state: 'pending', source: 'csv', createdAt: date.toISOString(), channel: normalizeChannel(values['支付渠道']), note: values['备注'] || '', externalId };
    candidate.importFingerprint = fingerprint(candidate);
    candidate.sourceChannel = candidate.channel;
    const classification = classifyCandidate(candidate, known);
    if (classification.status === 'ready' || classification.status === 'suspected') known.push(candidate);
    return { ...base, ...classification, candidate, categorySource, categoryReason };
  });
  return { rows, warnings: [...warnings] };
}

export function prepareImport(rows: ImportRow[], selected: Set<number>, existing: Entry[], confirmCategories = false): { additions: Entry[]; changed: number; saved: number; pending: number } {
  const additions: Entry[] = [];
  let changed = 0;
  for (const row of rows) {
    if (!selected.has(row.line) || !row.candidate || !['ready', 'suspected'].includes(row.status)) continue;
    const latest = classifyCandidate(row.candidate, [...existing, ...additions]);
    if (latest.status === 'duplicate' || latest.status === 'invalid' || (latest.status === 'suspected' && row.status === 'ready')) { changed++; continue; }
    additions.push({ ...row.candidate, state: confirmCategories && row.candidate.category ? 'saved' : 'pending' });
  }
  const saved = additions.filter(entry => entry.state === 'saved').length;
  return { additions, changed, saved, pending: additions.length - saved };
}

export function csvTemplate(date = new Date()): string {
  return '\uFEFF日期,金额,商家,类型,支付渠道,交易号,分类,状态,备注\r\n'
    + `${dateInputValue(date)},28.00,示例午餐,支出,微信,EXAMPLE-001,餐饮,成功,这是示例数据请替换\r\n`;
}
