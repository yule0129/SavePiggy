package cn.savepiggy.capture;

import android.app.ActivityManager;
import android.util.Log;
import org.json.JSONObject;

/** Process-local timing only. Never log notification text, amounts, IDs or categories. */
final class CaptureDiagnostics {
    static volatile boolean listenerConnected;
    static volatile long paymentNoticeAt;
    static volatile long candidateAt;
    static volatile long overlayAttemptAt;
    static volatile String overlayResult = "not_attempted";
    static volatile boolean previewScheduled;
    static volatile String noticeAppState = "unknown";
    static String appState() {
        ActivityManager.RunningAppProcessInfo info = new ActivityManager.RunningAppProcessInfo();
        ActivityManager.getMyMemoryState(info);
        return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND ? "foreground" : "background";
    }
    static void paymentNotice() {
        paymentNoticeAt = System.currentTimeMillis();
        noticeAppState = appState();
        Log.i("SavePiggyCapture", "payment_notice app=" + noticeAppState);
    }
    static void overlay(String result) {
        overlayResult = result;
        Log.i("SavePiggyCapture", "overlay=" + result + " app=" + appState());
    }
    static JSONObject status() throws Exception {
        return new JSONObject().put("listenerConnected", listenerConnected)
          .put("paymentNoticeAt", paymentNoticeAt).put("candidateAt", candidateAt)
          .put("overlayAttemptAt", overlayAttemptAt).put("overlayResult", overlayResult)
          .put("previewScheduled", previewScheduled).put("noticeAppState", noticeAppState);
    }
}
