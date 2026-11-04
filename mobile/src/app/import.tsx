import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useLedger } from '../LedgerProvider';
import { csvTemplate, prepareImport, previewCsv } from '../importCsv';
import type { ImportPreview } from '../importCsv';
import { pickCsv, saveCsv } from '../csvFiles';
import { CATEGORIES, dateInputValue, formatAmount } from '../ledger';
import type { Category } from '../ledger';

const STATUS = { ready: '可导入', duplicate: '重复跳过', suspected: '疑似重复', invalid: '需修正', skipped: '不计支出' };

export default function ImportScreen() {
  const router = useRouter();
  const { current, persist, busy, loading, storageError } = useLedger();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [working, setWorking] = useState(false);
  const inProgress = useRef(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [categoryLine, setCategoryLine] = useState<number | null>(null);
  const [savedPeriod, setSavedPeriod] = useState<{ year: string; month: string } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const unavailable = working || busy || loading || storageError;

  async function chooseFile() {
    if (inProgress.current || unavailable) return;
    inProgress.current = true; setWorking(true); setError(''); setResult('');
    try {
      const file = await pickCsv();
      if (!file) return;
      // Clear the previous selection before parsing another file.
      setPreview(null); setSelected(new Set()); setName(file.name);
      const next = previewCsv(file.text, current.current);
      setPreview(next);
      setSelected(new Set(next.rows.filter(row => row.status === 'ready').map(row => row.line)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取文件，请重试'); }
    finally { inProgress.current = false; setWorking(false); }
  }
  async function template() {
    if (inProgress.current || unavailable) return;
    inProgress.current = true; setWorking(true); setError('');
    try { await saveCsv('SavePiggy-template.csv', csvTemplate()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '模板保存失败'); }
    finally { inProgress.current = false; setWorking(false); }
  }
  function toggle(line: number) {
    setSelected(previous => { const next = new Set(previous); if (next.has(line)) next.delete(line); else next.add(line); return next; });
  }
  function changeCategory(category: Category | null) {
    setPreview(previous => previous ? { ...previous, rows: previous.rows.map(row => row.line === categoryLine && row.candidate ? { ...row, candidate: { ...row.candidate, category }, categorySource: 'manual', categoryReason: category ? '你在预览中选择的分类' : '暂不分类，将留在待记账' } : row) } : null);
    setCategoryLine(null);
  }
  async function importSelected(confirmCategories = false) {
    if (!preview || unavailable || inProgress.current) return;
    inProgress.current = true; setWorking(true); setError('');
    try {
      const { additions, changed, saved, pending } = prepareImport(preview.rows, selected, current.current, confirmCategories);
      if (!additions.length) { setError('没有可新增的记录，可能已被导入，请重新选择文件核对。'); return; }
      if (!await persist([...additions, ...current.current])) { setError('未能保存，现有账单没有变更。请重试。'); return; }
      const firstSaved = additions.find(entry => entry.state === 'saved');
      const date = firstSaved ? new Date(firstSaved.createdAt) : null;
      setSavedPeriod(date ? { year: String(date.getFullYear()), month: String(date.getMonth()) } : null);
      setPendingCount(pending);
      setResult(`${saved ? `已确认入账 ${saved} 笔。` : ''}${pending ? `${pending} 笔保留在待记账，确认保存后才计入统计。` : ''}${changed ? `另有 ${changed} 笔状态变化已跳过。` : ''}`);
      setPreview(null); setSelected(new Set());
    } finally { inProgress.current = false; setWorking(false); }
  }
  const eligible = preview?.rows.filter(row => row.status === 'ready' || row.status === 'suspected') || [];
  const amount = eligible.filter(row => selected.has(row.line)).reduce((sum, row) => sum + (row.candidate?.amountFen || 0), 0);
  const categorized = eligible.filter(row => selected.has(row.line) && row.candidate?.category).length;
  const categorizedAmount = eligible.filter(row => selected.has(row.line) && row.candidate?.category).reduce((sum, row) => sum + (row.candidate?.amountFen || 0), 0);
  const currentCategoryRow = preview?.rows.find(row => row.line === categoryLine);

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
    <Pressable accessibilityRole="button" onPress={() => router.navigate('/')}><Text style={s.link}>‹ 返回总览</Text></Pressable>
    <View style={s.intro}><Text style={s.eyebrow}>IMPORT YOUR EXPENSES</Text><Text style={s.heading}>导入账单</Text><Text style={s.body}>自动预填金额、日期和建议分类，核对后可以批量入账。</Text></View>
    <View style={s.card}><Text style={s.title}>先按模板整理，再预览确认</Text><Text style={s.body}>支持人民币 UTF-8 CSV，最多 2 MB、1000 条。必填日期、金额、商家、类型和支付渠道。暂不直接识别微信或支付宝原始导出文件、Excel、截图。</Text><Text style={s.hint}>模板含一笔示例账单，请替换后再导入。文件仅在当前设备处理，不上传服务器。</Text><Pressable accessibilityRole="button" disabled={unavailable} onPress={() => { void template(); }} style={s.secondary}><Text style={s.link}>下载 CSV 模板</Text></Pressable><Pressable accessibilityRole="button" disabled={unavailable} onPress={() => { void chooseFile(); }} style={[s.button, unavailable && s.disabled]}><Text style={s.buttonText}>{working ? '正在处理…' : preview ? '重新选择 CSV 文件' : '选择 CSV 文件'}</Text></Pressable></View>
    {loading && <ActivityIndicator color="#7965CF" />}
    {storageError && <Text accessibilityRole="alert" style={s.error}>账单存储暂时不可读取，请返回首页重试，当前已暂停导入。</Text>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!result && <View style={s.card}><Text style={s.title}>导入完成</Text><Text style={s.body}>{result}</Text>{savedPeriod && <Pressable accessibilityRole="button" onPress={() => router.navigate({ pathname: '/expenses', params: { ...savedPeriod, mode: 'month' } })} style={s.button}><Text style={s.buttonText}>查看支出明细</Text></Pressable>}{pendingCount > 0 && <Pressable accessibilityRole="button" onPress={() => router.navigate('/pending')} style={s.secondary}><Text style={s.link}>去待记账确认</Text></Pressable>}</View>}
    {preview && <>
      <View style={s.summary}><Text style={s.title}>{name}</Text><Text style={s.body}>共 {preview.rows.length} 条 · 可导入 {preview.rows.filter(row => row.status === 'ready').length} · 疑似重复 {preview.rows.filter(row => row.status === 'suspected').length}</Text><Text style={s.body}>重复 {preview.rows.filter(row => row.status === 'duplicate').length} · 需修正 {preview.rows.filter(row => row.status === 'invalid').length} · 不计支出 {preview.rows.filter(row => row.status === 'skipped').length}</Text><Text style={s.hint}>疑似重复默认不选。收入、退款、转账、充值、还款和非成功交易不会导入。缺失交易号时，无法完全自动去重。</Text>{preview.warnings.map(warning => <Text key={warning} style={s.hint}>{warning}</Text>)}</View>
      <View style={s.actions}><Pressable accessibilityRole="button" disabled={unavailable} onPress={() => setSelected(new Set(preview.rows.filter(row => row.status === 'ready').map(row => row.line)))}><Text style={s.link}>仅选择可导入</Text></Pressable><Pressable accessibilityRole="button" disabled={unavailable} onPress={() => setSelected(new Set())}><Text style={s.link}>全部取消</Text></Pressable></View>
      <View style={s.card}>{preview.rows.map(row => {
        const enabled = row.status === 'ready' || row.status === 'suspected';
        return <View key={row.line} style={s.previewRow}><Pressable accessibilityRole="checkbox" aria-checked={selected.has(row.line)} aria-disabled={!enabled || unavailable} accessibilityState={{ checked: selected.has(row.line), disabled: !enabled || unavailable }} accessibilityLabel={`选择第${row.line}行 ${row.merchant}`} disabled={!enabled || unavailable} onPress={() => toggle(row.line)} style={s.checkbox}><Text style={[s.check, selected.has(row.line) && s.checked]}>{selected.has(row.line) ? '✓' : enabled ? '○' : '－'}</Text></Pressable><View style={s.rowBody}><View style={s.actions}><Text style={s.rowTitle}>{row.merchant}</Text><Text style={row.status === 'ready' ? s.link : s.hint}>{STATUS[row.status]}</Text></View>{row.candidate && <Text style={s.body}>¥{formatAmount(row.candidate.amountFen)} · {dateInputValue(new Date(row.candidate.createdAt))} · {row.candidate.channel}</Text>}{enabled && row.candidate && <><Pressable accessibilityRole="button" accessibilityLabel={`修改第${row.line}行分类`} disabled={unavailable} onPress={() => setCategoryLine(row.line)} style={s.categoryPill}><Text style={s.categoryText}>{row.candidate.category || '选择分类'} ▾</Text><Text style={s.hint}>{row.categorySource === 'history' ? '沿用历史' : row.categorySource === 'keyword' ? '商家建议' : row.categorySource === 'file' ? '文件分类' : row.categorySource === 'manual' ? '已手动选择' : '待确认'}</Text></Pressable>{!!row.categoryReason && <Text style={s.hint}>{row.categoryReason}</Text>}</>}<Text style={s.hint}>第 {row.line} 行 · {row.reason}</Text></View></View>;
      })}</View>
      <Text style={s.title}>已选 {selected.size} 笔 · ¥{formatAmount(amount)}</Text><Text style={s.body}>建议分类可以点击修改。核对后，已分类的 {categorized} 笔（¥{formatAmount(categorizedAmount)}）可直接入账；未分类的 {selected.size - categorized} 笔（¥{formatAmount(amount - categorizedAmount)}）仍放入待记账。</Text><Pressable accessibilityRole="button" disabled={unavailable || categorized === 0} onPress={() => { void importSelected(true); }} style={[s.button, (unavailable || categorized === 0) && s.disabled]}><Text style={s.buttonText}>确认分类并入账 {categorized} 笔</Text></Pressable><Pressable accessibilityRole="button" disabled={unavailable || selected.size === 0} onPress={() => { void importSelected(); }} style={[s.secondary, (unavailable || selected.size === 0) && s.disabled]}><Text style={s.link}>添加 {selected.size} 笔到待记账</Text></Pressable>
    </>}
  </ScrollView><Modal visible={categoryLine !== null} transparent animationType="fade" onRequestClose={() => setCategoryLine(null)}><View style={s.overlay}><View style={s.categoryDialog}><Text style={s.title}>选择支出分类</Text><Text style={s.body}>{currentCategoryRow?.merchant}</Text><View style={s.categoryGrid}>{CATEGORIES.map(category => <Pressable key={category} accessibilityRole="button" disabled={unavailable} onPress={() => changeCategory(category)} style={s.categoryOption}><Text style={s.categoryText}>{category}</Text></Pressable>)}</View><Pressable accessibilityRole="button" disabled={unavailable} onPress={() => changeCategory(null)} style={s.secondary}><Text style={s.link}>暂不分类，留待确认</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setCategoryLine(null)}><Text style={s.link}>取消</Text></Pressable></View></View></Modal></SafeAreaView>;
}

const s = StyleSheet.create({
  checkbox: { paddingVertical: 12, paddingHorizontal: 5 }, categoryPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 10, backgroundColor: '#F0EDF7', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10 }, categoryText: { color: '#7965CF', fontSize: 12, fontWeight: '600' }, overlay: { flex: 1, backgroundColor: '#211A3A70', alignItems: 'center', justifyContent: 'center', padding: 24 }, categoryDialog: { backgroundColor: '#FFF', width: '100%', maxWidth: 430, borderRadius: 24, padding: 24, gap: 18 }, categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, categoryOption: { backgroundColor: '#F0EDF7', borderRadius: 12, padding: 16, minWidth: '21%', flexGrow: 1, alignItems: 'center' },
  safe: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: '#F8F7FC' },
  content: { padding: 24, gap: 20 }, intro: { gap: 10 }, eyebrow: { color: '#9A8ABB', fontSize: 10, letterSpacing: 2 }, heading: { color: '#302744', fontSize: 28, fontWeight: '800' }, title: { color: '#453654', fontSize: 16, fontWeight: '700' }, body: { color: '#84778E', fontSize: 12, lineHeight: 21 }, hint: { color: '#A397AD', fontSize: 11, lineHeight: 19 }, link: { color: '#7965CF', fontSize: 12, paddingVertical: 5 }, card: { backgroundColor: '#FFF', borderRadius: 22, padding: 20, gap: 15, borderWidth: 1, borderColor: '#F0EDF6' }, button: { backgroundColor: '#7965CF', padding: 17, borderRadius: 15, alignItems: 'center' }, buttonText: { color: '#FFF', fontSize: 14, fontWeight: '600' }, secondary: { backgroundColor: '#F0EDF7', padding: 12, borderRadius: 13, alignItems: 'center' }, disabled: { opacity: 0.45 }, error: { color: '#AF564D', fontSize: 13, lineHeight: 22 }, summary: { backgroundColor: '#EFEBF8', padding: 20, borderRadius: 20, gap: 10 }, actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#F1EDF7', paddingVertical: 12 }, check: { color: '#B3A7C4', fontSize: 23 }, checked: { color: '#7965CF' }, rowBody: { flex: 1, gap: 6 }, rowTitle: { color: '#5D4D70', fontSize: 13, flex: 1 },
});
