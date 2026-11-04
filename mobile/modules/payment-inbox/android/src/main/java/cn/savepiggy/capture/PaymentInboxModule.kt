package cn.savepiggy.capture

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PaymentInboxModule : Module() {
  private val context get() = appContext.reactContext ?: throw IllegalStateException("应用尚未就绪")
  override fun definition() = ModuleDefinition {
    Name("SavePiggyPaymentInbox")
    Function("getStatus") { PaymentQueue.status(context) }
    Function("list") { PaymentQueue.list(context) }
    Function("start") { PaymentQueue.start(context) }
    Function("stop") { PaymentQueue.stop() }
    Function("clear") { PaymentQueue.clear(context) }
    Function("setOverlayEnabled") { enabled: Boolean -> PaymentQueue.setOverlayEnabled(context, enabled) }
    Function("previewOverlay") { PaymentOverlay.schedulePreview(context) }
    Function("openOverlaySettings") {
      val activity = appContext.throwingActivity
      activity.runOnUiThread { activity.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + activity.packageName))) }
    }
    Function("acknowledge") { ids: List<String> -> PaymentQueue.acknowledge(context, ids.toTypedArray()) }
    Function("openSettings") {
      val activity = appContext.throwingActivity
      activity.runOnUiThread { activity.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
    }
    Function("requestReminderPermission") {
      val activity = appContext.throwingActivity
      activity.runOnUiThread {
        if (Build.VERSION.SDK_INT >= 33) activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4501)
      }
    }
  }
}
