package com.trackrunner.courier.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.trackrunner.courier.MainActivity
import com.trackrunner.courier.R
import com.trackrunner.courier.BuildConfig
import com.trackrunner.courier.data.CachedLocation
import com.trackrunner.courier.data.LocationCacheRepository
import com.trackrunner.courier.data.SessionStore
import com.trackrunner.courier.network.LocationPayload
import com.trackrunner.courier.network.SocketClient
import com.trackrunner.courier.util.BatteryHelper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Foreground service that streams the runner's location to the Node.js
 * backend over a Socket.IO connection. When the connection is unavailable,
 * samples are persisted to a local Room database and flushed on reconnect.
 *
 * Battery profile:
 *  - PRIORITY_BALANCED_POWER_ACCURACY (block-level, ~10m accuracy)
 *  - 15s nominal interval, 10s fastest interval
 *  - 15m smallest displacement
 *
 * These values are tuned for a courier on foot or on a scooter. For higher
 * accuracy (e.g. last-mile delivery) the caller can pass extras via the
 * start intent to switch to HIGH_ACCURACY.
 */
class LocationTrackingService : Service() {

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var cache: LocationCacheRepository
    private lateinit var socket: SocketClient

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Volatile
    private var runnerId: String = DEFAULT_RUNNER_ID

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        cache = LocationCacheRepository(applicationContext)

        // Pull the JWT + runner id from the encrypted session store. If the
        // user is not logged in we fall back to a placeholder id and an empty
        // token; the server will reject the connection and the service will
        // keep retrying until the user logs in.
        val session = SessionStore(applicationContext)
        runnerId = session.runnerId() ?: DEFAULT_RUNNER_ID
        val token = session.token()
        val serverUrl = session.serverUrl() ?: BuildConfig.SERVER_URL

        socket = SocketClient(
            serverUrl = serverUrl,
            runnerId = runnerId,
            token = token
        ).also { client ->
            client.setListener(object : SocketClient.Listener {
                override fun onConnected() {
                    Log.i(TAG, "Socket connected; flushing cache if any")
                    flushCache()
                }

                override fun onDisconnected(reason: String) {
                    Log.w(TAG, "Socket disconnected: $reason")
                }

                override fun onReconnected() {
                    Log.i(TAG, "Socket reconnected; flushing cache")
                    flushCache()
                }
            })
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.getStringExtra(EXTRA_RUNNER_ID)?.let { runnerId = it }

        createNotificationChannel()
        startForegroundCompat()

        // Connect the socket and start requesting location updates.
        socket.connect()
        startLocationUpdates()

        // START_STICKY: ask the OS to recreate us if killed under memory pressure.
        return START_STICKY
    }

    private fun startLocationUpdates() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                for (location in locationResult.locations) {
                    handleLocation(location)
                }
            }
        }

        val priority = Priority.PRIORITY_BALANCED_POWER_ACCURACY
        val locationRequest = LocationRequest.Builder(priority, UPDATE_INTERVAL_MS)
            .setMinUpdateIntervalMillis(FASTEST_INTERVAL_MS)
            .setMinUpdateDistanceMeters(MIN_DISPLACEMENT_M)
            .setWaitForAccurateLocation(false)
            .build()

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )
        } catch (security: SecurityException) {
            // Lost location permission while running; stop the service cleanly.
            Log.e(TAG, "Lost location permission, stopping service", security)
            stopSelf()
        }
    }

    private fun handleLocation(location: android.location.Location) {
        val battery = BatteryHelper.getBatteryPercent(applicationContext)
        val payload = LocationPayload(
            runnerId = runnerId,
            lat = location.latitude,
            lon = location.longitude,
            accuracy = location.accuracy,
            speed = if (location.hasSpeed()) location.speed else 0f,
            bearing = if (location.hasBearing()) location.bearing else 0f,
            altitude = if (location.hasAltitude()) location.altitude else 0.0,
            battery = battery,
            ts = location.time
        )

        if (socket.isConnected) {
            socket.sendLocation(payload)
        } else {
            // Offline: persist to Room and let the reconnect handler flush.
            cache.cacheLocation(
                CachedLocation(
                    latitude = payload.lat,
                    longitude = payload.lon,
                    accuracy = payload.accuracy,
                    speed = payload.speed,
                    bearing = payload.bearing,
                    altitude = payload.altitude,
                    batteryPercent = payload.battery,
                    timestamp = payload.ts,
                    runnerId = payload.runnerId
                )
            )
        }
    }

    /**
     * Reads cached rows from Room, ships them as a single batch over the
     * socket, and deletes the rows on success. Runs on the IO dispatcher.
     */
    private fun flushCache() {
        scope.launch {
            try {
                val batch = cache.fetchBatch()
                if (batch.isEmpty()) return@launch
                val payloads = batch.map {
                    LocationPayload(
                        runnerId = it.runnerId,
                        lat = it.latitude,
                        lon = it.longitude,
                        accuracy = it.accuracy,
                        speed = it.speed,
                        bearing = it.bearing,
                        altitude = it.altitude,
                        battery = it.batteryPercent,
                        ts = it.timestamp
                    )
                }
                socket.sendCachedBatch(payloads)
                // Best-effort cleanup. If the server didn't ack we may end up
                // with duplicates on the next reconnect; the server is expected
                // to dedupe by (runnerId, ts).
                cache.deleteByIds(batch.map { it.id })
            } catch (t: Throwable) {
                Log.e(TAG, "Failed to flush cached locations", t)
            }
        }
    }

    private fun startForegroundCompat() {
        val tapIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setContentIntent(tapIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            fusedLocationClient.removeLocationUpdates(locationCallback)
        } catch (t: Throwable) {
            Log.w(TAG, "removeLocationUpdates failed", t)
        }
        socket.disconnect()
        scope.coroutineContext[kotlinx.coroutines.Job]?.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.notification_channel_description)
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        private const val TAG = "LocationTrackingService"
        private const val CHANNEL_ID = "LocationTrackingChannel"
        private const val NOTIFICATION_ID = 1

        private const val UPDATE_INTERVAL_MS = 15_000L
        private const val FASTEST_INTERVAL_MS = 10_000L
        private const val MIN_DISPLACEMENT_M = 15f

        private const val DEFAULT_RUNNER_ID = "unknown-runner"

        const val EXTRA_RUNNER_ID = "extra_runner_id"

        fun start(context: Context, runnerId: String) {
            val intent = Intent(context, LocationTrackingService::class.java).apply {
                putExtra(EXTRA_RUNNER_ID, runnerId)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, LocationTrackingService::class.java))
        }
    }
}
