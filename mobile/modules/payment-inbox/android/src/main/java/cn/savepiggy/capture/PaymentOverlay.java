package cn.savepiggy.capture;

import android.app.KeyguardManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.util.Arrays;
import java.util.Locale;

/** A small, explicitly enabled window; never launches an activity over a payment screen. */
public final class PaymentOverlay {
    private static final String[] CATEGORIES = {"餐饮", "交通", "购物", "住房", "娱乐", "医疗", "学习", "其他"};
    private static final Handler main = new Handler(Looper.getMainLooper());
    private static View window;
    private static WindowManager manager;
    private static Context context;
    private static String eventId;
    private static boolean preview;
    private static Runnable scheduledPreview;
    private static final Runnable timeout = () -> dismiss();
    static boolean isCategory(String value) { return Arrays.asList(CATEGORIES).contains(value); }
    private static int dp(Context c, int value) { return Math.round(value * c.getResources().getDisplayMetrics().density); }
    private static TextView label(Context c, String value, int size, int color) {
        TextView view = new TextView(c);
        view.setText(value); view.setTextSize(size); view.setTextColor(color);
        view.setPadding(0, dp(c, 5), 0, dp(c, 5));
        return view;
    }
    public static void show(Context c, String id, int fen) {
        showWindow(c, id, fen, false);
    }
    public static void schedulePreview(Context c) {
        if (!Settings.canDrawOverlays(c)) throw new IllegalStateException("请先允许悬浮窗权限");
        Context app = c.getApplicationContext();
        main.post(() -> {
            if (scheduledPreview != null) main.removeCallbacks(scheduledPreview);
            CaptureDiagnostics.previewScheduled = true;
            CaptureDiagnostics.overlay("preview_scheduled");
            scheduledPreview = () -> {
                scheduledPreview = null;
                CaptureDiagnostics.previewScheduled = false;
                showWindow(app, null, 0, true);
            };
            main.postDelayed(scheduledPreview, 8000);
        });
    }
    private static void showWindow(Context c, String id, int fen, boolean demo) {
        CaptureDiagnostics.overlayAttemptAt = System.currentTimeMillis();
        KeyguardManager keyguard = (KeyguardManager)c.getSystemService(Context.KEYGUARD_SERVICE);
        String skip = window != null ? "busy" : keyguard.isKeyguardLocked() ? "locked"
          : !Settings.canDrawOverlays(c) ? "permission_denied"
          : !demo && !PaymentQueue.active() ? "capture_stopped"
          : !demo && !PaymentQueue.overlayEnabled(c) ? "disabled" : null;
        if (skip != null) {
            CaptureDiagnostics.overlay(skip);
            if (!demo) PaymentQueue.finishOverlay(c, id, null);
            return;
        }
        context = c; eventId = id; preview = demo;
        LinearLayout card = new LinearLayout(c);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(c, 18), dp(c, 12), dp(c, 18), dp(c, 12));
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.WHITE); background.setCornerRadius(dp(c, 20));
        card.setBackground(background); card.setElevation(dp(c, 12));
        TextView title = label(c, demo ? "SavePiggy · 后台弹窗测试" : "SavePiggy · 微信付款记账", 16, Color.rgb(69, 54, 84));
        title.setTypeface(null, Typeface.BOLD); card.addView(title);
        card.addView(label(c, demo ? "演示 · 不会入账" : "¥" + String.format(Locale.ROOT, "%.2f", fen / 100.0), 28, Color.rgb(48, 39, 68)));
        card.addView(label(c, demo ? "用于检查后台显示，点击任何类别都不会保存账单" : "请核对金额和是否重复，点击类别即保存支出", 12, Color.DKGRAY));
        for (int row = 0; row < 2; row++) {
            LinearLayout line = new LinearLayout(c);
            for (int col = 0; col < 4; col++) {
                String category = CATEGORIES[row * 4 + col];
                Button button = new Button(c);
                button.setText(category); button.setTextSize(13); button.setMinWidth(0); button.setMinimumWidth(0);
                button.setTextColor(Color.rgb(121, 101, 207));
                button.setOnClickListener(v -> confirm(category));
                line.addView(button, new LinearLayout.LayoutParams(0, dp(c, 48), 1));
            }
            card.addView(line);
        }
        Button later = new Button(c); later.setText(demo ? "关闭测试窗口" : "稍后处理 · 保留到待记账");
        later.setTextSize(12); later.setOnClickListener(v -> dismiss()); card.addView(later);
        manager = (WindowManager)c.getSystemService(Context.WINDOW_SERVICE);
        int width = Math.min(dp(c, 360), c.getResources().getDisplayMetrics().widthPixels - dp(c, 24));
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(width, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_SECURE,
            PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.CENTER;
        params.setTitle("SavePiggy 付款分类");
        try {
            manager.addView(card, params); window = card;
            CaptureDiagnostics.overlay(demo ? "preview_added" : "payment_added");
            main.postDelayed(timeout, 45000);
        } catch (RuntimeException e) {
            CaptureDiagnostics.overlay("add_failed_" + e.getClass().getSimpleName());
            dismiss();
        }
    }
    private static void confirm(String category) {
        if (context == null || window == null) return;
        if (preview) {
            Toast.makeText(context, "演示结束，没有新增账单", Toast.LENGTH_SHORT).show();
            dismiss();
            return;
        }
        try {
            // No success message until the selection is committed to the private durable queue.
            PaymentQueue.finishOverlay(context, eventId, category);
            Toast.makeText(context, "已保存到本机 · " + category, Toast.LENGTH_SHORT).show();
            dismiss();
        } catch (RuntimeException e) {
            Toast.makeText(context, "保存失败，请稍后在待记账中处理", Toast.LENGTH_LONG).show();
        }
    }
    public static void dismiss() {
        if (scheduledPreview != null) main.removeCallbacks(scheduledPreview);
        scheduledPreview = null;
        CaptureDiagnostics.previewScheduled = false;
        main.removeCallbacks(timeout);
        if (window != null) {
            try { manager.removeView(window); } catch (RuntimeException ignored) { }
        }
        if (context != null && eventId != null) PaymentQueue.finishOverlay(context, eventId, null);
        window = null; eventId = null; context = null; manager = null; preview = false;
    }
}
