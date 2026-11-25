package dz.hkstore.app

import android.app.Notification
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

class HKSomfyNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        try {
            val packageName = sbn.packageName ?: return
            val appLabel = try {
                packageManager.getApplicationLabel(
                    packageManager.getApplicationInfo(packageName, 0)
                ).toString()
            } catch (_: PackageManager.NameNotFoundException) {
                packageName
            }
            val isSomfy = appLabel.contains("somfy", ignoreCase = true) ||
                packageName.contains("somfy", ignoreCase = true) ||
                packageName.contains("visidom", ignoreCase = true)
            if (!isSomfy) return

            val extras = sbn.notification.extras
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
            val text = (
                extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
                    ?: extras.getCharSequence(Notification.EXTRA_TEXT)
                    ?: extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)
                )?.toString().orEmpty()
            if (title.isBlank() && text.isBlank()) return

            val event = JSONObject().apply {
                put("id", sbn.postTime)
                put("packageName", packageName)
                put("appLabel", appLabel)
                put("title", title.take(240))
                put("text", text.take(1000))
                put("postedAt", sbn.postTime)
            }
            val prefs = getSharedPreferences("hk_somfy_notifications", MODE_PRIVATE)
            val old = try { JSONArray(prefs.getString("events", "[]") ?: "[]") } catch (_: Exception) { JSONArray() }
            val next = JSONArray()
            val start = (old.length() - 38).coerceAtLeast(0)
            for (i in start until old.length()) next.put(old.getJSONObject(i))
            next.put(event)
            prefs.edit().putString("events", next.toString()).apply()
        } catch (_: Exception) {
            // Never interrupt the source Somfy notification if local capture fails.
        }
    }
}
