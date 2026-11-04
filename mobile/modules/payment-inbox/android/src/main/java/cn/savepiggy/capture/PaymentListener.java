package cn.savepiggy.capture;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

public final class PaymentListener extends NotificationListenerService {
    @Override public void onListenerConnected() {
        super.onListenerConnected();
        CaptureDiagnostics.listenerConnected = true;
    }
    @Override public void onListenerDisconnected() {
        CaptureDiagnostics.listenerConnected = false;
        super.onListenerDisconnected();
    }
    @Override public void onNotificationPosted(StatusBarNotification event) {
        if (event != null) PaymentQueue.record(this, event);
    }
}
