import { Fragment, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useLedger } from './src/LedgerProvider';
import { CATEGORIES, dateInputValue, formatAmount, parseAmount, parseEntryDate, periodEntries, shiftPeriod } from './src/ledger';
import type { Category, Entry, Period } from './src/ledger';

const COLORS = ['#7965CF', '#E6A16F', '#70AB9D', '#7D9ACB', '#CD8FAA', '#A6B876', '#B19BCE', '#A8A5B1'];
function message(title: string, text: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${text}`);
  else Alert.alert(title, text);
}
function confirm(title: string, text: string, action: () => void, label = '确认') {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n\n${text}`)) action(); }
  else Alert.alert(title, text, [{ text: '取消', style: 'cancel' }, { text: label, onPress: action }]);
}
function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, (pressed || disabled) && { opacity: 0.55 }]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
function nowPeriod(): Period { const today = new Date(); return { mode: 'month', year: today.getFullYear(), month: today.getMonth() }; }

export default function App() {
  const router = useRouter();
  const path = usePathname();
  const params = useLocalSearchParams<{ year?: string; month?: string; mode?: string }>();
  const { entries, loading, storageError, busy, current, writing, load, persist } = useLedger();
  const screen = path === '/expenses' ? 'expenses' : path === '/pending' ? 'pending' : 'home';
  const today = nowPeriod();
  const year = Number(params.year);
  const month = Number(params.month);
  const period: Period = { mode: params.mode === 'year' ? 'year' : 'month', year: Number.isInteger(year) && year >= 1900 && year <= 9999 ? year : today.year, month: params.month !== undefined && Number.isInteger(month) && month >= 0 && month < 12 ? month : today.month };
  const activePeriod = screen === 'home' ? today : period;
  const [editing, setEditing] = useState<Entry | null>(null);
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [entryDate, setEntryDate] = useState('');
  const [picker, setPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(today.year);
  const selected = periodEntries(entries, activePeriod).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const pending = entries.filter(item => item.state === 'pending');
  const total = selected.reduce((sum, item) => sum + item.amountFen, 0);
  const maximum = selected.reduce((max, item) => Math.max(max, item.amountFen), 0);
  const label = activePeriod.mode === 'year' ? `${activePeriod.year} 年` : `${activePeriod.year} 年 ${activePeriod.month + 1} 月`;
  const categories = CATEGORIES.map((name, index) => ({ name, color: COLORS[index], total: selected.filter(item => item.category === name).reduce((sum, item) => sum + item.amountFen, 0) })).filter(item => item.total > 0).sort((a, b) => b.total - a.total);
  const visible = screen === 'pending' ? pending : selected;
  function setPeriod(next: Period) { router.setParams({ mode: next.mode, year: String(next.year), month: String(next.month) }); }
  function goExpenses(next = today) { router.navigate({ pathname: '/expenses', params: { mode: next.mode, year: String(next.year), month: String(next.month) } }); }
  async function commit(next: Entry[]) {
    const ok = await persist(next);
    if (!ok && !writing.current) message('未能保存', '本地存储写入失败，请重试。现有账单没有变更。');
    return ok;
  }
  function open(entry: Entry) { setEditing(entry); setAmount(formatAmount(entry.amountFen)); setMerchant(entry.merchant); setCategory(entry.category); setEntryDate(dateInputValue(new Date(entry.createdAt))); }
  function fresh(source: Entry['source']): Entry { return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, amountFen: 2800, merchant: source === 'demo' ? '午餐 · 模拟商家' : '', category: null, state: 'pending', source, createdAt: new Date().toISOString() }; }
  function manual() { open(fresh('manual')); setAmount(''); }
  async function simulate() {
    const entry = fresh('demo');
    if (await commit([entry, ...current.current])) confirm('模拟付款成功', '¥28.00 已加入待记账。现在分类？取消可稍后处理。', () => open(entry), '去分类');
  }
  async function save() {
    if (!editing || writing.current) return;
    const amountFen = parseAmount(amount);
    const date = parseEntryDate(entryDate);
    if (amountFen === null) { message('检查金额', '请输入大于 0 的金额，最多两位小数，最大 9,999,999.99 元。'); return; }
    if (!date) { message('检查日期', '请输入有效日期，格式为 YYYY-MM-DD。'); return; }
    if (!category) { message('选择分类', '请选择这笔支出的类型。'); return; }
    const updated: Entry = { ...editing, amountFen, category, merchant: merchant.trim(), state: 'saved', createdAt: entryDate === dateInputValue(new Date(editing.createdAt)) ? editing.createdAt : date.toISOString() };
    const exists = current.current.some(item => item.id === updated.id);
    if (await commit(exists ? current.current.map(item => item.id === updated.id ? updated : item) : [updated, ...current.current])) {
      setEditing(null); goExpenses({ mode: 'month', year: date.getFullYear(), month: date.getMonth() });
    }
  }
  function remove(entry: Entry) { confirm(entry.state === 'pending' ? '忽略这笔记录？' : '删除这笔账单？', '此操作无法撤销。', () => { void commit(current.current.filter(item => item.id !== entry.id)); }); }
  function choosePeriod(next: Period) { setPeriod(next); setPicker(false); }

  return <SafeAreaView style={s.safe}>
    <StatusBar style="dark" />
    <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="返回首页" onPress={() => router.navigate('/')} style={s.brandRow}><View style={s.logo}><Text style={s.logoText}>¥</Text></View><View><Text style={s.brand}>SavePiggy</Text><Text style={s.brandSub}>我的日常账本</Text></View></Pressable><View style={s.dateBadge}><Text style={s.dateBadgeText}>{today.month + 1} 月 · {today.year}</Text></View></View>
    {loading ? <View style={s.center}><ActivityIndicator color="#7965CF" /><Text style={s.muted}>正在读取账单…</Text></View> : storageError ? <View style={s.center}><Text style={s.title}>账单暂时无法读取</Text><Text style={s.muted}>已暂停写入以保护数据，请重试。</Text><Button title="重新读取" onPress={() => { void load(); }} /></View> : <>
      <ScrollView contentContainerStyle={s.content}>
        {screen === 'home' ? <>
          <View style={s.pageIntro}><Text style={s.eyebrow}>MONTHLY OVERVIEW</Text><Text style={s.pageTitle}>每一笔，都心中有数。</Text><Text style={s.muted}>从这个月开始，看见生活的每一份开销。</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="查看本月支出明细" onPress={() => goExpenses()} style={({ pressed }) => [s.hero, pressed && { opacity: 0.9 }]}>
            <View style={s.row}><Text style={s.heroLabel}>本月累计支出</Text><Text style={s.heroMonth}>{today.month + 1} 月账单</Text></View>
            <Text style={s.heroAmount} numberOfLines={1} adjustsFontSizeToFit><Text style={s.heroCurrency}>¥ </Text>{formatAmount(total)}</Text>
            <View style={s.heroBottom}><View><Text style={s.heroSmall}>已记录账单</Text><Text style={s.heroCount}>{selected.length}<Text style={s.heroUnit}> 笔</Text></Text></View><View style={s.heroCta}><Text style={s.heroCtaText}>查看详细支出</Text><Text style={s.heroCtaArrow}>↗</Text></View></View>
          </Pressable>
          <View style={s.metrics}><View style={s.metric}><Text style={s.metricLabel}>单笔最高支出</Text><Text style={s.metricValue}>¥ {formatAmount(maximum)}</Text><Text style={s.tiny}>本月已确认记录</Text></View><Pressable accessibilityRole="button" onPress={() => router.navigate('/pending')} style={[s.metric, s.pendingMetric]}><Text style={s.metricLabel}>待记账</Text><Text style={s.metricValue}>{pending.length}<Text style={s.metricUnit}> 笔</Text></Text><Text style={s.tiny}>有空时，慢慢整理 →</Text></Pressable></View>
          <View style={s.sectionHead}><Text style={s.title}>钱都花在哪儿了</Text><Text style={s.tiny}>本月分类</Text></View>
          <View style={s.card}>{categories.length ? categories.map(item => <View key={item.name} style={s.categorySummary}><View style={s.row}><View style={s.categoryName}><View style={[s.dot, { backgroundColor: item.color }]} /><Text style={s.bodyText}>{item.name}</Text></View><Text style={s.bodyText}>¥ {formatAmount(item.total)}<Text style={s.tiny}>  {Math.round(item.total / total * 100)}%</Text></Text></View><View style={s.track}><View style={[s.bar, { backgroundColor: item.color, width: `${item.total / total * 100}%` }]} /></View></View>) : <View style={s.empty}><Text style={s.emptyIcon}>◎</Text><Text style={s.title}>留住第一笔生活记录</Text><Text style={s.muted}>记下一笔支出后，这里会展示分类分布。</Text></View>}</View>
          <Button title="＋ 记一笔支出" disabled={busy} onPress={manual} />
          <View style={s.toolRow}><Text style={s.tiny}>开发体验 · 尚未接入真实付款</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => { void simulate(); }}><Text style={s.toolLink}>模拟付款 ¥28 ↗</Text></Pressable></View>
        </> : <>
          <View style={s.detailHeading}><Pressable accessibilityRole="button" onPress={() => router.navigate('/')}><Text style={s.back}>‹ 返回总览</Text></Pressable><Text style={s.pageTitle}>{screen === 'expenses' ? '支出明细' : '待记账'}</Text><Text style={s.muted}>{screen === 'expenses' ? '每一笔生活，都有迹可循。' : '确认分类后，再计入正式账单。'}</Text></View>
          {screen === 'expenses' && <>
            <View style={s.modeRow}>{(['month', 'year'] as const).map(mode => <Pressable key={mode} accessibilityRole="button" accessibilityState={{ selected: period.mode === mode }} onPress={() => setPeriod({ ...period, mode })} style={[s.mode, period.mode === mode && s.modeActive]}><Text style={[s.modeText, period.mode === mode && s.modeTextActive]}>{mode === 'month' ? '月度账单' : '年度账单'}</Text></Pressable>)}</View>
            <View style={s.periodRow}><Pressable accessibilityRole="button" accessibilityLabel="上一期间" disabled={shiftPeriod(period, -1).year < 1900} onPress={() => setPeriod(shiftPeriod(period, -1))} style={s.periodArrow}><Text style={s.arrow}>‹</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="选择年份月份" onPress={() => { setPickerYear(period.year); setPicker(true); }} style={s.periodChoose}><Text style={s.periodTitle}>{label} ▾</Text><Text style={s.tiny}>点击选择年份 / 月份</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="下一期间" disabled={shiftPeriod(period, 1).year > 9999} onPress={() => setPeriod(shiftPeriod(period, 1))} style={s.periodArrow}><Text style={s.arrow}>›</Text></Pressable></View>
            <View style={s.detailSummary}><View><Text style={s.metricLabel}>支出合计</Text><Text style={s.detailAmount}>¥ {formatAmount(total)}</Text></View><View style={s.countBlock}><Text style={s.countValue}>{selected.length}</Text><Text style={s.tiny}>笔账单</Text></View></View>
            <Pressable accessibilityRole="button" onPress={() => setPeriod(today)}><Text style={s.reset}>回到本月</Text></Pressable>
          </>}
          {visible.length === 0 ? <View style={[s.card, s.empty]}><Text style={s.emptyIcon}>◎</Text><Text style={s.title}>{screen === 'pending' ? '暂时没有待处理账单' : '这段时间还没有支出'}</Text><Text style={s.muted}>{screen === 'pending' ? '可以从首页模拟一笔付款，体验记账流程。' : '试试选择其他月份，或补记一笔历史账单。'}</Text></View> : <View style={s.card}>{visible.map((entry, index) => {
            const day = dateInputValue(new Date(entry.createdAt));
            const newDay = index === 0 || dateInputValue(new Date(visible[index - 1].createdAt)) !== day;
            const dayTotal = visible.filter(item => dateInputValue(new Date(item.createdAt)) === day).reduce((sum, item) => sum + item.amountFen, 0);
            const color = COLORS[Math.max(0, CATEGORIES.indexOf(entry.category || '其他'))];
            return <Fragment key={entry.id}>{newDay && <View style={s.dayHeader}><Text style={s.dayTitle}>{day}</Text><Text style={s.tiny}>支出 ¥{formatAmount(dayTotal)}</Text></View>}<View style={s.entry}><Pressable accessibilityRole="button" accessibilityLabel={`编辑${entry.merchant || entry.category || '支出'}`} onPress={() => open(entry)} style={s.entryMain}><View style={[s.entryIcon, { backgroundColor: `${color}18` }]}><Text style={{ color, fontWeight: '700' }}>{(entry.category || '待')[0]}</Text></View><View style={s.entryInfo}><Text style={s.entryName} numberOfLines={1}>{entry.merchant || entry.category || '待分类支出'}</Text><Text style={s.tiny}>{entry.category || '待分类'}{entry.source === 'demo' ? ' · 模拟账单' : ' · 手动记账'}</Text></View><Text style={s.entryAmount}>-{formatAmount(entry.amountFen)}</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => remove(entry)} hitSlop={8}><Text style={s.delete}>{screen === 'pending' ? '忽略' : '删除'}</Text></Pressable></View></Fragment>;
          })}</View>}
          <Button title="＋ 记一笔支出" disabled={busy} onPress={manual} />
        </>}
        <Text style={s.footnote}>{Platform.OS === 'web' ? '仅保存在当前浏览器 · 与手机数据不互通' : '仅保存在当前设备 · 暂无云备份'} · 模拟记录计入统计</Text>
      </ScrollView>
      <View style={s.nav}>{([{ key: 'home', title: '总览', symbol: '◉', action: () => router.navigate('/') }, { key: 'expenses', title: '明细', symbol: '≡', action: () => goExpenses() }, { key: 'pending', title: '待记账', symbol: '◷', action: () => router.navigate('/pending') }] as const).map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: screen === item.key }} onPress={item.action} style={s.navItem}><Text style={[s.navIcon, screen === item.key && s.navActive]}>{item.symbol}</Text><Text style={[s.navText, screen === item.key && s.navActive]}>{item.title}{item.key === 'pending' && pending.length > 0 ? ` ${pending.length}` : ''}</Text></Pressable>)}</View>
    </>}
    <Modal visible={picker} transparent animationType="fade" onRequestClose={() => setPicker(false)}><View style={s.overlay}><View style={s.pickerCard}><View style={s.row}><Text style={s.title}>选择账单时间</Text><Pressable accessibilityRole="button" onPress={() => setPicker(false)}><Text style={s.toolLink}>关闭</Text></Pressable></View><View style={s.periodRow}><Pressable accessibilityRole="button" accessibilityLabel="上一年" disabled={pickerYear <= 1900} onPress={() => setPickerYear(pickerYear - 1)} style={s.periodArrow}><Text style={s.arrow}>‹</Text></Pressable><Text style={s.periodTitle}>{pickerYear} 年</Text><Pressable accessibilityRole="button" accessibilityLabel="下一年" disabled={pickerYear >= 9999} onPress={() => setPickerYear(pickerYear + 1)} style={s.periodArrow}><Text style={s.arrow}>›</Text></Pressable></View><View style={s.monthGrid}>{Array.from({ length: 12 }, (_, index) => <Pressable key={index} accessibilityRole="button" onPress={() => choosePeriod({ mode: 'month', year: pickerYear, month: index })} style={[s.monthCell, period.mode === 'month' && pickerYear === period.year && index === period.month && s.monthSelected]}><Text style={[s.modeText, period.mode === 'month' && pickerYear === period.year && index === period.month && s.modeTextActive]}>{index + 1} 月</Text></Pressable>)}</View><Button title={`查看 ${pickerYear} 年全年账单`} onPress={() => choosePeriod({ mode: 'year', year: pickerYear, month: period.month })} /></View></View></Modal>
    <Modal visible={editing !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!busy) setEditing(null); }}><SafeAreaView style={s.safe}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={s.header}><Text style={s.title}>{editing?.state === 'saved' ? '编辑支出' : '记一笔支出'}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => setEditing(null)}><Text style={s.toolLink}>取消</Text></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}><Text style={s.muted}>{editing?.source === 'demo' ? '模拟付款 · 金额已预填' : '支出金额 · 人民币'}</Text><View style={s.amountRow}><Text style={s.currency}>¥</Text><TextInput accessibilityLabel="支出金额" style={s.amountInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" maxLength={10} editable={!busy} /></View><Text style={s.fieldLabel}>商家或备注</Text><TextInput accessibilityLabel="商家或备注" style={s.input} value={merchant} onChangeText={setMerchant} maxLength={60} placeholder="例如：午餐、地铁、日用品" editable={!busy} /><Text style={s.fieldLabel}>支出日期</Text><TextInput accessibilityLabel="支出日期" style={s.input} value={entryDate} onChangeText={setEntryDate} maxLength={10} placeholder="YYYY-MM-DD" editable={!busy} /><Text style={s.fieldLabel}>支出分类</Text><View style={s.monthGrid}>{CATEGORIES.map(item => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} disabled={busy} onPress={() => setCategory(item)} style={[s.monthCell, category === item && s.monthSelected]}><Text style={[s.modeText, category === item && s.modeTextActive]}>{item}</Text></Pressable>)}</View><Text style={s.tiny}>保存后，计入支出日期对应的月份与年份。</Text><Button title={busy ? '正在保存…' : '保存账单'} disabled={busy} onPress={() => { void save(); }} /></ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: '#F8F7FC' },
  header: { paddingHorizontal: 24, paddingVertical: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, logo: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#7965CF', alignItems: 'center', justifyContent: 'center' }, logoText: { color: '#FFF', fontSize: 25, fontWeight: '700' },
  brand: { color: '#2E2548', fontSize: 20, fontWeight: '800', letterSpacing: -0.5 }, brandSub: { color: '#A29BAC', fontSize: 10, marginTop: 3 }, dateBadge: { backgroundColor: '#EFEDF7', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20 }, dateBadgeText: { color: '#8A7BA8', fontSize: 11 },
  content: { paddingHorizontal: 24, paddingBottom: 24, gap: 20 }, pageIntro: { gap: 8, paddingTop: 12, paddingBottom: 4 }, eyebrow: { color: '#9A8ABB', fontSize: 10, letterSpacing: 2, fontWeight: '700' }, pageTitle: { fontSize: 27, fontWeight: '800', color: '#302744', letterSpacing: -0.8 }, muted: { color: '#A09AA9', fontSize: 12, lineHeight: 21 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, hero: { backgroundColor: '#7965CF', borderRadius: 28, padding: 26, overflow: 'hidden', gap: 22 }, heroLabel: { color: '#E3DCF9', fontSize: 13 }, heroMonth: { color: '#F0EAFE', backgroundColor: '#8A77D8', fontSize: 11, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, overflow: 'hidden' }, heroAmount: { color: '#FFF', fontSize: 48, fontWeight: '700', letterSpacing: -1.5 }, heroCurrency: { fontSize: 26, fontWeight: '400' }, heroBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#9683DE', paddingTop: 20 }, heroSmall: { color: '#DBD2F3', fontSize: 11 }, heroCount: { color: '#FFF', fontSize: 27, fontWeight: '600', marginTop: 5 }, heroUnit: { fontSize: 12, fontWeight: '400', color: '#DFD7F5' }, heroCta: { flexDirection: 'row', alignItems: 'center', gap: 10 }, heroCtaText: { color: '#FFF', fontSize: 12 }, heroCtaArrow: { color: '#FFF', fontSize: 23 },
  metrics: { flexDirection: 'row', gap: 12 }, metric: { flex: 1, borderRadius: 20, padding: 18, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F0EDF6', gap: 8 }, pendingMetric: { backgroundColor: '#F2EEE8', borderColor: '#F2EEE8' }, metricLabel: { fontSize: 11, color: '#9991A5' }, metricValue: { color: '#453855', fontSize: 23, fontWeight: '700' }, metricUnit: { fontSize: 12, fontWeight: '400' }, tiny: { color: '#ABA4B4', fontSize: 10, lineHeight: 17 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }, title: { fontSize: 16, fontWeight: '700', color: '#3B304E' }, card: { backgroundColor: '#FFF', padding: 20, borderRadius: 22, borderWidth: 1, borderColor: '#F0EDF6' }, categorySummary: { gap: 10, marginVertical: 9 }, categoryName: { flexDirection: 'row', alignItems: 'center', gap: 9 }, dot: { width: 8, height: 8, borderRadius: 4 }, bodyText: { color: '#5D526C', fontSize: 12 }, track: { height: 5, backgroundColor: '#F3F1F7', borderRadius: 4, overflow: 'hidden' }, bar: { height: 5, borderRadius: 4 },
  button: { backgroundColor: '#7965CF', alignItems: 'center', padding: 17, borderRadius: 16 }, buttonText: { color: '#FFF', fontSize: 15, fontWeight: '600' }, toolRow: { gap: 8, alignItems: 'center' }, toolLink: { color: '#8A78B5', fontSize: 12, paddingVertical: 5 }, footnote: { color: '#B5AFBF', fontSize: 9, lineHeight: 16, textAlign: 'center', marginTop: 6 },
  nav: { flexDirection: 'row', paddingTop: 12, paddingBottom: 12, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F0EDF6' }, navItem: { flex: 1, alignItems: 'center', gap: 5 }, navIcon: { color: '#B5AFBE', fontSize: 23 }, navText: { color: '#B5AFBE', fontSize: 10 }, navActive: { color: '#7965CF', fontWeight: '700' },
  detailHeading: { gap: 8 }, back: { color: '#9B8BB5', fontSize: 12, paddingVertical: 7 }, modeRow: { flexDirection: 'row', backgroundColor: '#EEEAF6', borderRadius: 14, padding: 4 }, mode: { flex: 1, padding: 12, borderRadius: 11, alignItems: 'center' }, modeActive: { backgroundColor: '#7965CF' }, modeText: { fontSize: 13, color: '#8D819F' }, modeTextActive: { color: '#FFF', fontWeight: '600' }, periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, periodArrow: { backgroundColor: '#EFECF6', paddingHorizontal: 15, paddingVertical: 6, borderRadius: 11 }, arrow: { color: '#8F7DB9', fontSize: 25 }, periodChoose: { alignItems: 'center', gap: 5 }, periodTitle: { color: '#4C3B68', fontSize: 18, fontWeight: '700' }, detailSummary: { backgroundColor: '#EEEBF8', borderRadius: 20, padding: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, detailAmount: { fontSize: 32, color: '#6450A3', fontWeight: '700', marginTop: 8 }, countBlock: { alignItems: 'center', borderLeftWidth: 1, borderLeftColor: '#DBD3EE', paddingLeft: 22 }, countValue: { fontSize: 27, color: '#7965CF', fontWeight: '700' }, reset: { textAlign: 'center', color: '#9B8BB5', fontSize: 11 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F4F1F8' }, dayTitle: { color: '#A59AAC', fontSize: 11 }, entry: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: '#F7F4FA' }, entryMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 }, entryIcon: { width: 38, height: 38, borderRadius: 13, justifyContent: 'center', alignItems: 'center' }, entryInfo: { flex: 1, gap: 5 }, entryName: { color: '#544660', fontSize: 13, fontWeight: '600' }, entryAmount: { color: '#453654', fontSize: 15, fontWeight: '600' }, delete: { color: '#B79CA7', fontSize: 10 }, empty: { alignItems: 'center', paddingVertical: 26, gap: 12 }, emptyIcon: { fontSize: 36, color: '#BBAFD8' },
  overlay: { flex: 1, backgroundColor: '#211A3A70', justifyContent: 'center', alignItems: 'center', padding: 24 }, pickerCard: { width: '100%', maxWidth: 430, backgroundColor: '#F8F7FC', borderRadius: 26, padding: 24, gap: 24 }, monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, monthCell: { flexGrow: 1, minWidth: '21%', alignItems: 'center', paddingVertical: 17, backgroundColor: '#EFECF6', borderRadius: 12 }, monthSelected: { backgroundColor: '#7965CF' },
  fieldLabel: { color: '#685875', fontSize: 13, fontWeight: '600', marginTop: 4 }, input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EDE7F4', borderRadius: 13, padding: 16, color: '#544660', fontSize: 15 }, amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#E5DEF0', paddingBottom: 14 }, currency: { color: '#7965CF', fontSize: 28 }, amountInput: { flex: 1, fontSize: 44, color: '#6450A3', minHeight: 68 }, center: { flex: 1, justifyContent: 'center', padding: 30, gap: 20 },
});
