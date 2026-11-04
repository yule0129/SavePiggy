package cn.savepiggy.notificationprobe;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.List;

public final class MainActivity extends Activity {
    private TextView status;
    private TextView results;
    private Button start;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable refresh = new Runnable() {
        @Override public void run() { render(); handler.postDelayed(this, 1000); }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ProbeStore.removeLegacyData(this);
        getWindow().setFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE, android.view.WindowManager.LayoutParams.FLAG_SECURE);
        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(24), dp(24), dp(32));
        content.setBackgroundColor(Color.rgb(248,247,252));
        scroll.addView(content);
        content.addView(text("SavePiggy 限时通知验证", 23, true));
        content.addView(text("隐私收缩版 0.2 · 默认不处理通知", 14, true));
        content.addView(text("此版本不保存通知原文、不联网、不自动入账。测试仅在你点击开始后进行，5 分钟后停止处理。进程结束也会停止，重启后不会自动恢复。", 15, false));
        content.addView(text("注意：系统通知使用权范围较广，仍可能把其他应用的通知事件交给程序。本程序直接忽略其他应用；测试期间只统计微信事件，仅对标题为“微信支付”或“WeChat Pay”的通知临时提取候选金额。该标题也不能证明消息来自官方支付服务。", 14, false));
        content.addView(text("候选金额仅在内存显示，最多 20 个；不保留商家、联系人、正文或交易号。停止测试或到期会清除候选金额。此页禁止截屏，避免内容进入截图或最近任务预览。", 14, false));
        status = text("", 16, true);
        content.addView(status);
        Button settings = new Button(this);
        settings.setText("查看 / 关闭通知使用权");
        settings.setOnClickListener(v -> {
            try { startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); }
            catch (Exception ignored) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
        });
        content.addView(settings);
        start = new Button(this);
        start.setText("开始 5 分钟测试");
        start.setOnClickListener(v -> { if (allowed()) { ProbeStore.start(this); render(); } });
        content.addView(start);
        Button stop = new Button(this);
        stop.setText("立即停止并清空测试数据");
        stop.setOnClickListener(v -> { ProbeStore.clear(); render(); });
        content.addView(stop);
        content.addView(text("如不接受通知权限的范围，可以直接退出并卸载。若愿意测试：先在系统设置中授权，返回后主动开始，等下次正常付款的系统通知，再查看候选金额是否吻合。无需为了测试额外消费。结束后请在系统设置关闭通知使用权；程序的停止按钮不能代替系统撤权。", 15, false));
        results = text("", 15, false);
        content.addView(results);
        setContentView(scroll);
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value); view.setTextSize(size);
        view.setTextColor(Color.rgb(62,48,82));
        view.setPadding(0, dp(8), 0, dp(14)); view.setLineSpacing(dp(4), 1f);
        if (bold) view.setTypeface(null, android.graphics.Typeface.BOLD);
        return view;
    }
    private boolean allowed() {
        return ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).isNotificationListenerAccessGranted(new ComponentName(this, WechatNotificationListener.class));
    }
    private void render() {
        boolean permission = allowed();
        if (!permission && ProbeStore.active()) ProbeStore.clear();
        start.setEnabled(permission && !ProbeStore.active());
        status.setText("通知使用权：" + (permission ? "已开启" : "未开启")
            + "\n测试状态：" + (ProbeStore.active() ? "进行中，剩余 " + ProbeStore.remainingSeconds() + " 秒" : "已停止")
            + "\n微信通知事件：" + ProbeStore.events()
            + "\n匹配支付标题的通知：" + ProbeStore.matches());
        List<String> values = ProbeStore.amounts();
        StringBuilder body = new StringBuilder("临时候选金额（不能作为付款凭证）\n");
        if (values.isEmpty()) body.append("暂无。无候选金额时不能认为自动记账验证成功。");
        for (String value : values) body.append("\n¥ ").append(value);
        results.setText(body.toString());
    }
    @Override protected void onResume() { super.onResume(); handler.post(refresh); }
    @Override protected void onPause() { handler.removeCallbacks(refresh); super.onPause(); }
}
