package cn.savepiggy.notificationprobe;

import android.app.Notification;
import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

final class ProbeStore {
    private static final long DURATION = 5 * 60 * 1000;
    private static final Handler timer = new Handler(Looper.getMainLooper());
    private static long deadline;
    private static int events;
    private static int matches;
    private static final LinkedHashSet<Integer> seen = new LinkedHashSet<>();
    private static final List<String> amounts = new ArrayList<>();
    private static final Runnable expire = () -> { synchronized (ProbeStore.class) { active(); } };

    static synchronized void removeLegacyData(Context context) {
        // Remove any logs created by the previous probe. New test data is memory-only.
        context.getSharedPreferences("wechat_probe", Context.MODE_PRIVATE).edit().clear().commit();
    }
    static synchronized void start(Context context) {
        removeLegacyData(context);
        clear();
        deadline = SystemClock.elapsedRealtime() + DURATION;
        timer.postDelayed(expire, DURATION);
    }
    static synchronized boolean active() {
        if (deadline != 0 && SystemClock.elapsedRealtime() >= deadline) {
            deadline = 0;
            amounts.clear();
            seen.clear();
        }
        return deadline != 0;
    }
    static synchronized long remainingSeconds() {
        return active() ? Math.max(0, (deadline - SystemClock.elapsedRealtime() + 999) / 1000) : 0;
    }
    static synchronized void record(Context context, StatusBarNotification event) {
        if (!active() || !"com.tencent.mm".equals(event.getPackageName())) return;
        events++;
        Notification notification = event.getNotification();
        Bundle extras = notification.extras;
        if (extras == null || (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        String title = value(extras.getCharSequence(Notification.EXTRA_TITLE));
        // Read no chat body unless the notification title matches this narrow allowlist.
        if (!PaymentText.acceptsTitle(title)) return;
        int key = event.getKey().hashCode();
        if (seen.contains(key)) return;
        seen.add(key);
        if (seen.size() > 100) seen.remove(seen.iterator().next());
        matches++;
        String body = value(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (body.isEmpty()) body = value(extras.getCharSequence(Notification.EXTRA_TEXT));
        for (String amount : PaymentText.amounts(body)) {
            if (amounts.size() == 20) amounts.remove(0);
            amounts.add(amount);
        }
        // No notification title, body, sender, merchant or transaction ID is retained.
    }
    private static String value(CharSequence text) { return text == null ? "" : text.toString(); }
    static synchronized int events() { active(); return events; }
    static synchronized int matches() { active(); return matches; }
    static synchronized List<String> amounts() { active(); return new ArrayList<>(amounts); }
    static synchronized void clear() {
        timer.removeCallbacks(expire);
        deadline = 0;
        events = 0;
        matches = 0;
        seen.clear();
        amounts.clear();
    }
}
