package cn.savepiggy.capture;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.StatusBarNotification;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

public final class PaymentQueue {
    private static long deadline;
    private static int skipped;
    private static int events;
    private static final Set<String> awaitingChoice = new HashSet<>();
    private static final Handler main = new Handler(Looper.getMainLooper());
    private static final Runnable expire = () -> stop();
    private static final String CHANNEL = "savepiggy_payment_candidates";
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("savepiggy_payment_queue", Context.MODE_PRIVATE); }
    private static NotificationManager manager(Context c) { return (NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE); }
    public static boolean allowed(Context c) {
        if (Build.VERSION.SDK_INT < 28) return false;
        return manager(c).isNotificationListenerAccessGranted(new ComponentName(c, PaymentListener.class));
    }
    public static synchronized boolean active() {
        if (deadline != 0 && SystemClock.elapsedRealtime() >= deadline) deadline = 0;
        return deadline > 0;
    }
    public static synchronized void start(Context c) {
        if (!allowed(c)) throw new IllegalStateException("请先由你在系统设置中开启通知使用权");
        deadline = SystemClock.elapsedRealtime() + 5 * 60 * 1000;
        main.removeCallbacks(expire);
        main.postDelayed(expire, 5 * 60 * 1000);
        events = 0; skipped = 0;
    }
    public static synchronized void stop() {
        deadline = 0;
        main.removeCallbacks(expire);
        main.post(PaymentOverlay::dismiss);
    }
    public static synchronized void setOverlayEnabled(Context c, boolean enabled) {
        if (enabled && !Settings.canDrawOverlays(c)) throw new IllegalStateException("请先允许显示在其他应用上层");
        if (!prefs(c).edit().putBoolean("overlayEnabled", enabled).commit()) throw new IllegalStateException("无法保存弹窗设置");
        if (!enabled) main.post(PaymentOverlay::dismiss);
    }
    static synchronized boolean overlayEnabled(Context c) {
        return prefs(c).getBoolean("overlayEnabled", false) && Settings.canDrawOverlays(c);
    }
    public static synchronized String status(Context c) {
        try {
            return new JSONObject().put("allowed", allowed(c)).put("active", active())
              .put("diagnostics", CaptureDiagnostics.status())
              .put("overlayAllowed", Settings.canDrawOverlays(c)).put("overlayEnabled", prefs(c).getBoolean("overlayEnabled", false))
              .put("remainingSeconds", active() ? Math.max(0, (deadline - SystemClock.elapsedRealtime() + 999) / 1000) : 0)
              .put("events", events).put("skipped", skipped).put("queued", read(c).length())
              .put("reminders", Build.VERSION.SDK_INT < 33 || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED).toString();
        } catch (Exception e) { throw new IllegalStateException("无法读取接入状态", e); }
    }
    private static JSONArray read(Context c) {
        try { return new JSONArray(prefs(c).getString("queue", "[]")); }
        catch (Exception e) { throw new IllegalStateException("队列不可读取，已暂停接入以保护数据", e); }
    }
    public static synchronized String list(Context c) {
        JSONArray visible = new JSONArray(), all = read(c);
        for (int i = 0; i < all.length(); i++) {
            JSONObject item = all.optJSONObject(i);
            if (item == null) throw new IllegalStateException("队列数据无效");
            if (!awaitingChoice.contains(item.optString("id"))) visible.put(item);
        }
        return visible.toString();
    }
    // Hold a displayed candidate out of JS synchronization until its choice is durable.
    // The hold is memory-only: after process death all pending candidates are recoverable.
    static synchronized void finishOverlay(Context c, String id, String category) {
        if (category != null) {
            if (!PaymentOverlay.isCategory(category)) throw new IllegalArgumentException("无效分类");
            JSONArray queue = read(c);
            boolean found = false;
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.optJSONObject(i);
                if (item != null && id.equals(item.optString("id"))) {
                    try { item.put("confirmedCategory", category); } catch (Exception e) { throw new IllegalStateException(e); }
                    found = true;
                }
            }
            if (!found || !prefs(c).edit().putString("queue", queue.toString()).commit()) throw new IllegalStateException("保存失败，请稍后在待记账中处理");
        }
        awaitingChoice.remove(id);
    }
    public static synchronized void acknowledge(Context c, String[] ids) {
        Set<String> accepted = new HashSet<>();
        for (String id : ids) accepted.add(id);
        JSONArray old = read(c), next = new JSONArray();
        for (int i = 0; i < old.length(); i++) {
            JSONObject item = old.optJSONObject(i);
            if (item == null) throw new IllegalStateException("队列数据无效");
            if (!accepted.contains(item.optString("id"))) next.put(item);
        }
        if (!prefs(c).edit().putString("queue", next.toString()).commit()) throw new IllegalStateException("无法确认队列记录");
    }
    public static synchronized void clear(Context c) {
        stop();
        if (!prefs(c).edit().clear().commit()) throw new IllegalStateException("清空队列失败");
        manager(c).cancel(4501);
    }
    public static synchronized void record(Context c, StatusBarNotification event) {
        if (!active() || !allowed(c) || !"com.tencent.mm".equals(event.getPackageName())) return;
        events++;
        Notification n = event.getNotification();
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0 || n.extras == null) return;
        Bundle extras = n.extras;
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        if (title == null || !(title.toString().equals("微信支付") || title.toString().equals("WeChat Pay"))) return;
        CaptureDiagnostics.paymentNotice();
        CharSequence value = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (value == null || value.length() == 0) value = extras.getCharSequence(Notification.EXTRA_TEXT);
        if (value == null) return;
        int fen = PaymentParser.candidateAmount(title.toString(), value.toString());
        if (fen == 0) { skipped++; return; }
        CaptureDiagnostics.candidateAt = System.currentTimeMillis();
        try {
            long stamp = n.when > 0 ? n.when : event.getPostTime();
            String id = hash(event.getKey() + "|" + stamp + "|" + fen);
            SharedPreferences p = prefs(c);
            Set<String> seen = new HashSet<>(p.getStringSet("seen", new HashSet<>()));
            if (seen.contains(id)) return;
            JSONArray queue = read(c);
            if (queue.length() >= 100) { skipped++; return; }
            queue.put(new JSONObject().put("id", id).put("amountFen", fen)
              .put("occurredAt", stamp).put("evidence", "needs_review"));
            // Persist only normalized amount/time and a one-way event identifier; never raw text.
            if (seen.size() >= 1000) seen.clear();
            seen.add(id);
            if (!p.edit().putString("queue", queue.toString()).putStringSet("seen", seen).commit()) { skipped++; return; }
            if (overlayEnabled(c)) {
                awaitingChoice.add(id);
                Context app = c.getApplicationContext();
                main.post(() -> PaymentOverlay.show(app, id, fen));
            }
            remind(c);
        } catch (Exception ignored) { skipped++; stop(); }
    }
    private static String hash(String value) throws Exception {
        byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder();
        for (byte item : bytes) result.append(String.format("%02x", item & 255));
        return result.toString();
    }
    private static void remind(Context c) {
        if (Build.VERSION.SDK_INT < 28) return;
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "付款候选提醒", NotificationManager.IMPORTANCE_DEFAULT);
        manager(c).createNotificationChannel(channel);
        Intent intent = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (intent == null) return;
        intent.setAction(Intent.ACTION_VIEW).setData(Uri.parse("savepiggy://pending"));
        PendingIntent tap = PendingIntent.getActivity(c, 4501, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(c, CHANNEL)
          .setSmallIcon(android.R.drawable.ic_menu_edit).setContentTitle("有微信付款候选待核对")
          .setContentText("点击确认金额与支出分类；候选尚未计入支出")
          .setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(tap).setAutoCancel(true).build();
        manager(c).notify(4501, notification);
    }
}
