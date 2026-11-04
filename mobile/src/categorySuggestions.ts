import type { Category, Entry } from './ledger.ts';

export type CategorySuggestion = { category: Category | null; source: 'history' | 'keyword'; reason: string };

function normalize(value: string): string { return value.trim().toLowerCase().replace(/\s+/g, ' '); }

export function suggestCategory(merchant: string, channel: string, entries: Entry[]): CategorySuggestion | null {
  const name = normalize(merchant);
  if (!name) return null;
  const history = entries.filter(entry => entry.state === 'saved' && entry.source !== 'demo'
    && entry.category && normalize(entry.merchant) === name
    && normalize(entry.channel || '') === normalize(channel));
  const categories = new Set(history.map(entry => entry.category));
  if (categories.size > 1) return { category: null, source: 'history', reason: '该商家的历史分类不一致，请手动选择' };
  if (categories.size === 1) return { category: history[0].category, source: 'history', reason: '沿用你确认过的同商家同渠道分类' };

  const rules: [Category, RegExp][] = [
    ['餐饮', /咖啡|奶茶|餐厅|饭店|餐饮|早餐|午餐|晚餐|面馆|火锅|烧烤|肯德基|麦当劳|星巴克|瑞幸/],
    ['交通', /地铁|公交|出租车|网约车|滴滴|停车|高速通行|加油站|火车票|机票/],
    ['住房', /房租|物业费|水费|电费|燃气费|宽带费/],
    ['医疗', /医院|药房|药店|诊所|体检/],
    ['学习', /书店|教材|学费|培训费|课程费/],
    ['娱乐', /电影院|电影票|游乐园|游戏充值|演唱会/],
    ['购物', /超市|便利店|百货|服装|日用品/],
  ];
  const matches = rules.filter(([, pattern]) => pattern.test(name));
  if (matches.length !== 1) return null;
  return { category: matches[0][0], source: 'keyword', reason: '根据商家名称建议，请核对' };
}
