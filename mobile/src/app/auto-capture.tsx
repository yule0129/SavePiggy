import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { paymentInbox } from '../nativePaymentInbox';
import type { InboxStatus } from '../nativePaymentInbox';
import { useLedger } from '../LedgerProvider';

export default function AutoCaptureScreen() {
  const router = useRouter();
  const { entries, captureError } = useLedger();
  const [status, setStatus] = useState<InboxStatus | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  function refresh() {
    try { setStatus(paymentInbox.status()); }
    catch { setError('无法读取原生接入状态，请停止使用并重新打开应用'); }
  }
  useEffect(() => {
    const timer = setInterval(refresh, 1000);
    void Promise.resolve().then(refresh);
    return () => clearInterval(timer);
  }, []);
  function run(action: () => void) {
    try { action(); refresh(); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); }
  }
  const candidates = entries.filter(entry => entry.source === 'wechat_notification' && entry.state === 'pending').length;
  const diagnostics = status?.diagnostics;
  const diagnosticTime = (stamp?: number) => stamp ? new Date(stamp).toLocaleTimeString('zh-CN', { hour12: false }) : '本次运行尚无';
  const overlayResults: Record<string, string> = {
    not_attempted: '尚未尝试', preview_scheduled: '等待 8 秒测试', preview_added: '测试窗口已提交系统显示',
    payment_added: '付款窗口已提交系统显示', busy: '已有窗口，候选保留待记账', locked: '锁屏时不弹出',
    permission_denied: '悬浮窗权限未允许', capture_stopped: '接入已停止', disabled: '分类弹窗开关已关闭',
  };
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
    <Pressable accessibilityRole="button" onPress={() => router.navigate('/')}><Text style={s.link}>‹ 返回总览</Text></Pressable>
    <Text style={s.heading}>微信付款候选接入</Text><Text style={s.body}>开启付款分类弹窗后，识别到金额会显示悬浮窗口，核对金额后点击类别即可保存支出。红包暂不支持。</Text>
    {!paymentInbox.supported ? <View style={s.card}><Text style={s.title}>当前环境没有安卓接入模块</Text><Text style={s.body}>电脑浏览器、iPhone 和 Expo Go 不提供此通知监听。请在包含接入模块的安卓构建中使用；当前页面不会读取通知。</Text></View> : <>
      <View style={s.card}><Text style={s.title}>先了解与验证包的区别</Text><Text style={s.body}>系统通知使用权的范围仍较广。只有你同意并开始测试后，程序才处理标题为微信支付的候选；通知原文、联系人和商家不保存。</Text><Text style={s.body}>本版会在设备中持久保存候选金额、时间和单向去重标识，并同步到待记账，即使测试停止也会保留。测试仍限时 5 分钟，进程重启不会自动开启。停止接入不会删除已经保存的候选，请到待记账中核对或删除。</Text><Text style={s.body}>通知标题可能被模仿，转账、收款、退款或含多个不同金额的内容会尽量排除；剩余候选仍不能证明真实消费。系统权限需你自行开启和关闭。</Text></View>
      <View style={s.card}><Text style={s.title}>{status?.active ? `接入中 · 剩余 ${status.remainingSeconds} 秒` : '接入已停止'}</Text><Text style={s.body}>通知使用权：{status?.allowed ? '已开启' : '未开启'}　提醒：{status?.reminders ? '可发送' : '未允许'}</Text><Text style={s.body}>本次微信事件 {status?.events || 0} · 跳过 {status?.skipped || 0} · 原生队列 {status?.queued || 0}</Text><Pressable accessibilityRole="button" onPress={() => run(paymentInbox.openSettings)} style={s.secondary}><Text style={s.link}>查看 / 关闭系统通知使用权</Text></Pressable><Pressable accessibilityRole="button" onPress={() => run(paymentInbox.requestReminders)} style={s.secondary}><Text style={s.link}>申请发送待记账提醒</Text></Pressable></View>
      <View style={s.card}>
        <Text style={s.title}>付款后直接选择类别</Text>
        <Text style={s.body}>悬浮窗权限：{status?.overlayAllowed ? '已允许' : '未允许'} · 分类弹窗：{status?.overlayEnabled ? '已开启' : '已关闭'}</Text>
        <Text style={s.body}>允许显示在其他应用上层后，再开启下方分类弹窗。弹窗显示金额，点击类别即确认这笔支出并保存在本机，打开 App 后自动同步到合计。关闭或 45 秒不操作会保留为待记账；锁屏时不弹出，系统拦截时保留通知提醒。弹窗不会自动操作微信。</Text>
        <Pressable accessibilityRole="button" onPress={() => run(paymentInbox.openOverlaySettings)} style={s.secondary}><Text style={s.link}>设置“显示在其他应用上层”权限</Text></Pressable>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!status?.overlayEnabled }} disabled={!status?.overlayAllowed && !status?.overlayEnabled} onPress={() => run(() => paymentInbox.setOverlayEnabled(!status?.overlayEnabled))} style={[s.secondary, !status?.overlayAllowed && !status?.overlayEnabled && s.disabled]}><Text style={s.link}>{status?.overlayEnabled ? '关闭付款分类弹窗' : '开启付款分类弹窗'}</Text></Pressable>
      </View>
      <View style={s.card}>
        <Text style={s.title}>无需付款，先测试后台弹窗</Text>
        <Text style={s.body}>点击后立即返回手机桌面，保持解锁并等待 8 秒。测试不读取微信通知，不生成账单，点击类别也不会入账。先在桌面测试，再判断是否为微信付款通知延迟。</Text>
        <Pressable accessibilityRole="button" disabled={!status?.overlayAllowed || diagnostics?.previewScheduled} onPress={() => run(paymentInbox.previewOverlay)} style={[s.secondary, (!status?.overlayAllowed || diagnostics?.previewScheduled) && s.disabled]}><Text style={s.link}>{diagnostics?.previewScheduled ? '测试已安排，请回桌面等待' : '8 秒后显示测试弹窗（不入账）'}</Text></Pressable>
        <Text style={s.body}>上次弹窗：{overlayResults[diagnostics?.overlayResult || 'not_attempted'] || '系统未接受窗口，请反馈此页状态'}{diagnostics?.overlayResult.startsWith('add_failed_') ? `（${diagnostics.overlayResult.slice(11)}）` : ''}。系统接受窗口不等于屏幕上一定可见。</Text>
        <Text style={s.body}>监听连接：{diagnostics?.listenerConnected ? '已连接' : '未连接'}{ '\n' }支付通知收到：{diagnosticTime(diagnostics?.paymentNoticeAt)}{ '\n' }收到时 App：{diagnostics?.noticeAppState === 'foreground' ? '前台' : diagnostics?.noticeAppState === 'background' ? '后台' : '尚无记录'}{ '\n' }提取到候选：{diagnosticTime(diagnostics?.candidateAt)}{ '\n' }尝试弹窗：{diagnosticTime(diagnostics?.overlayAttemptAt)}</Text>
        <Text style={s.body}>以上只显示本次运行的时间与处理状态，不保存通知原文和金额日志。进程重启后重置。</Text>
      </View>
      <Pressable accessibilityRole="checkbox" aria-checked={consent} onPress={() => setConsent(!consent)} style={s.consent}><Text style={s.link}>{consent ? '☑' : '□'} 我同意在本机保存金额、时间及我确认的分类</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!consent || !status?.allowed || status.active} onPress={() => run(paymentInbox.start)} style={[s.button, (!consent || !status?.allowed || status.active) && s.disabled]}><Text style={s.white}>开始 5 分钟接入测试</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => run(paymentInbox.stop)} style={s.secondary}><Text style={s.link}>停止接入（保留待记账）</Text></Pressable>
    </>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!captureError && <Text accessibilityRole="alert" style={s.error}>{captureError}</Text>}
    <View style={s.card}><Text style={s.title}>微信通知待核对 · {candidates} 笔</Text><Text style={s.body}>核对金额、交易类型和是否重复，再确认分类；只有保存后才会计入首页统计。</Text><Pressable accessibilityRole="button" onPress={() => router.navigate('/pending')} style={s.button}><Text style={s.white}>去待记账确认分类</Text></Pressable></View>
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: '#F8F7FC' }, content: { padding: 24, gap: 18 }, heading: { fontSize: 27, fontWeight: '700', color: '#302744' }, title: { fontSize: 16, fontWeight: '600', color: '#453654' }, body: { color: '#84778E', fontSize: 13, lineHeight: 23 }, link: { color: '#7965CF', fontSize: 13, lineHeight: 22 }, card: { padding: 20, backgroundColor: '#FFF', borderRadius: 22, gap: 14 }, button: { padding: 17, alignItems: 'center', backgroundColor: '#7965CF', borderRadius: 15 }, secondary: { padding: 15, backgroundColor: '#EFEBF8', borderRadius: 13, alignItems: 'center' }, white: { color: '#FFF', fontSize: 14, fontWeight: '600' }, disabled: { opacity: 0.45 }, error: { color: '#AF564D', fontSize: 13 }, consent: { paddingVertical: 12 },
});
