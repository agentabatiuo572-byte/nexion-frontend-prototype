package uts.sdk.modules.uvelNativePush

import android.Manifest
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import io.dcloud.uts.UTSAndroid
import org.json.JSONArray
import org.json.JSONObject

// Only the server's generic account-language copy may reach the lock screen.
fun genericNotificationBody(body: String?): String = when (body) {
    "您有一条新通知，请打开 UVEL 查看。" -> body
    "Bạn có thông báo mới. Mở UVEL để xem." -> body
    else -> "You have a new notification. Open UVEL to view it."
}

object NativePushBridge {
    private const val CHANNEL = "uvel_notifications"
    private val main = Handler(Looper.getMainLooper())
    private var listener: ((String) -> Unit)? = null
    private var enabled = false
    private var generation = 0
    private var error = "NOT_INITIALIZED"
    private val seenClicks = LinkedHashSet<String>()
    private fun context(): Context? = UTSAndroid.getAppContext()
    private fun prefs(context: Context) = context.getSharedPreferences("uvel_native_push", Context.MODE_PRIVATE)
    private fun result(code: String) = JSONObject().put("available", false).put("provider", "FCM").put("code", code).toString()
    private fun emit(event: JSONObject) { main.post { listener?.invoke(event.put("provider", "FCM").toString()) } }

    fun initialize() {
        val ctx = context() ?: run { error = "CONTEXT_UNAVAILABLE"; return }
        if (GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(ctx) != ConnectionResult.SUCCESS) {
            error = "GMS_UNAVAILABLE"; return
        }
        try {
            val app = FirebaseApp.getApps(ctx).firstOrNull { it.name == FirebaseApp.DEFAULT_APP_NAME }
                ?: FirebaseApp.initializeApp(ctx)
            if (app == null || app.options.apiKey.isNullOrEmpty() || app.options.gcmSenderId.isNullOrEmpty()) {
                error = "CONFIG_MISSING"; return
            }
            enabled = true
            error = ""
            generation++
            prefs(ctx).edit().putBoolean("enabled", true).apply()
            FirebaseMessaging.getInstance().isAutoInitEnabled = true
            createChannel(ctx)
        } catch (_: Exception) { error = "CONFIG_INVALID" }
    }

    fun getToken(callback: (String) -> Unit) {
        if (!enabled) { callback(result(error)); return }
        val epoch = generation
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            main.post {
                if (!enabled || epoch != generation) callback(result("SESSION_CHANGED"))
                else if (task.isSuccessful && !task.result.isNullOrEmpty()) {
                    callback(JSONObject().put("available", true).put("provider", "FCM").put("token", task.result).toString())
                } else callback(result("TOKEN_UNAVAILABLE"))
            }
        }
    }

    fun shutdown() {
        enabled = false
        generation++
        error = "NOT_INITIALIZED"
        context()?.let { ctx ->
            prefs(ctx).edit().putBoolean("enabled", false).remove("clicks").apply()
            (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancelAll()
            try { FirebaseMessaging.getInstance().isAutoInitEnabled = false } catch (_: IllegalStateException) { }
        }
    }

    fun permission(callback: (String) -> Unit) {
        val ctx = context()
        val granted = ctx != null && (Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
            && (Build.VERSION.SDK_INT < 24 || (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled())
        callback(JSONObject().put("permission", if (granted) "granted" else "denied").toString())
    }

    fun listen(callback: (String) -> Unit) {
        listener = callback
        // Persist clicks until JS is ready; never persist tokens or message content.
        context()?.let { ctx ->
            val pending = JSONArray(prefs(ctx).getString("clicks", "[]"))
            prefs(ctx).edit().remove("clicks").apply()
            for (i in 0 until pending.length()) emit(JSONObject().put("type", "click").put("notificationId", pending.getString(i)))
        }
    }
    fun unlisten() { listener = null }

    @Synchronized fun click(ctx: Context, raw: String?) {
        val id = validId(raw) ?: return
        if (!seenClicks.add(id)) return
        if (seenClicks.size > 128) seenClicks.remove(seenClicks.first())
        if (listener != null) emit(JSONObject().put("type", "click").put("notificationId", id))
        else {
            val pending = JSONArray(prefs(ctx).getString("clicks", "[]"))
            if (pending.length() < 32) pending.put(id)
            prefs(ctx).edit().putString("clicks", pending.toString()).apply()
        }
    }

    fun initial(callback: (String) -> Unit) {
        val ctx = context() ?: run { callback("{}"); return }
        val intent = UTSAndroid.getUniActivity()?.intent
        val id = validId(intent?.getStringExtra("notificationId"))
        intent?.removeExtra("notificationId")
        if (id != null) click(ctx, id)
        val pending = JSONArray(prefs(ctx).getString("clicks", "[]"))
        if (pending.length() == 0) { callback("{}"); return }
        val first = pending.getString(0)
        pending.remove(0)
        prefs(ctx).edit().putString("clicks", pending.toString()).apply()
        callback(JSONObject().put("notificationId", first).toString())
    }

    fun newToken(ctx: Context, token: String) {
        if (prefs(ctx).getBoolean("enabled", false)) emit(JSONObject().put("type", "token").put("token", token))
    }

    fun received(ctx: Context, message: RemoteMessage) {
        if (!prefs(ctx).getBoolean("enabled", false)) return
        val id = validId(message.data["notificationId"]) ?: return
        emit(JSONObject().put("type", "received").put("notificationId", id))
        // Notification+data messages in background are displayed by FCM; this callback is foreground.
        // Data-only messages are unsupported: backend always sends generic notification+data.
        if (message.notification == null) return
        createChannel(ctx)
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val intent = Intent(ctx, UvelPushClickActivity::class.java)
            .setData(Uri.parse("uvel-push://notification/" + Uri.encode(id))).putExtra("notificationId", id)
        val pending = PendingIntent.getActivity(ctx, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val body = genericNotificationBody(message.notification?.body)
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, CHANNEL) else Notification.Builder(ctx)
        val icon = ctx.applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
        val notification = builder.setSmallIcon(icon).setContentTitle("UVEL").setContentText(body)
            .setContentIntent(pending).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE).build()
        (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(id, 0, notification)
    }

    private fun createChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT >= 26) (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .createNotificationChannel(NotificationChannel(CHANNEL, "UVEL", NotificationManager.IMPORTANCE_DEFAULT))
    }
    private fun validId(raw: String?): String? = raw?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{1,128}")) }
}

class UvelMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) { NativePushBridge.newToken(applicationContext, token) }
    override fun onMessageReceived(message: RemoteMessage) { NativePushBridge.received(applicationContext, message) }
}

class UvelPushClickActivity : Activity() {
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        NativePushBridge.click(applicationContext, intent.getStringExtra("notificationId"))
        packageManager.getLaunchIntentForPackage(packageName)?.let {
            it.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            startActivity(it)
        }
        finish()
    }
}
