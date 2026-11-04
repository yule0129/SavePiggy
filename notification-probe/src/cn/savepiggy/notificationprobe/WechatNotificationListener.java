package cn.savepiggy.notificationprobe;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

public final class WechatNotificationListener extends NotificationListenerService {
    @Override public void onNotificationPosted(StatusBarNotification event) {
        if (event != null) ProbeStore.record(this, event);
    }
}
