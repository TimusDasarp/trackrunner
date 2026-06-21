package com.trackrunner.courier.network

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI

/**
 * Wraps the Socket.IO client and exposes a coroutine-friendly API plus a
 * connection-state callback. The service owns a single instance for its
 * lifetime and reuses it across reconnects.
 *
 * Auth: the JWT is passed via `auth.token` (Socket.IO 4.x handshake payload).
 * The server verifies it in its `io.use(...)` middleware before allowing the
 * runner to join its private room.
 */
class SocketClient(
    private val serverUrl: String,
    private val runnerId: String,
    private val token: String?
) {

    interface Listener {
        fun onConnected()
        fun onDisconnected(reason: String)
        fun onReconnected()
    }

    @Volatile
    private var socket: Socket? = null

    @Volatile
    private var listener: Listener? = null

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val isConnected: Boolean
        get() = socket?.connected() == true

    fun setListener(listener: Listener?) {
        this.listener = listener
    }

    fun connect() {
        if (socket?.connected() == true) return

        val options = IO.Options().apply {
            // Reconnection tuning: aggressive but bounded.
            reconnection = true
            reconnectionAttempts = Int.MAX_VALUE
            reconnectionDelay = 1_000L
            reconnectionDelayMax = 10_000L
            randomizationFactor = 0.5
            timeout = 10_000L
            // Auth: pass the JWT in the Socket.IO 4.x handshake payload.
            if (!token.isNullOrBlank()) {
                auth = mutableMapOf<String, String>().apply { put("token", token) }
            }
            // Use websocket-first transport; falls back to long-polling.
            transports = arrayOf("websocket", "polling")
        }

        val s = IO.socket(URI.create(serverUrl), options)
        socket = s

        s.on(Socket.EVENT_CONNECT) {
            Log.i(TAG, "Socket connected")
            listener?.onConnected()
        }
        s.on(Socket.EVENT_DISCONNECT) { args ->
            val reason = args.firstOrNull()?.toString() ?: "unknown"
            Log.w(TAG, "Socket disconnected: $reason")
            listener?.onDisconnected(reason)
        }
        s.on("reconnect") {
            Log.i(TAG, "Socket reconnected")
            listener?.onReconnected()
        }
        s.on(Socket.EVENT_CONNECT_ERROR) { args ->
            val err = args.firstOrNull()?.toString() ?: "unknown"
            Log.e(TAG, "Socket connect error: $err")
        }

        s.connect()
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }

    /**
     * Push a single location update. If the socket is not connected the
     * caller is expected to persist the sample locally and retry on reconnect.
     */
    fun sendLocation(payload: LocationPayload) {
        val s = socket ?: return
        if (!s.connected()) return
        s.emit(EVENT_LOCATION, payload.toJson())
    }

    /**
     * Flush a batch of cached locations in a single emit. The server is
     * expected to accept an array and persist each entry in order.
     */
    fun sendCachedBatch(payloads: List<LocationPayload>) {
        val s = socket ?: return
        if (!s.connected() || payloads.isEmpty()) return
        val arr = JSONArray()
        payloads.forEach { arr.put(it.toJson()) }
        s.emit(EVENT_LOCATION_BATCH, arr)
    }

    private fun LocationPayload.toJson(): JSONObject = JSONObject().apply {
        put("runnerId", runnerId)
        put("lat", lat)
        put("lon", lon)
        put("accuracy", accuracy.toDouble())
        put("speed", speed.toDouble())
        put("bearing", bearing.toDouble())
        put("altitude", altitude)
        put("battery", battery)
        put("ts", ts)
    }

    companion object {
        private const val TAG = "SocketClient"
        const val EVENT_LOCATION = "runner:location"
        const val EVENT_LOCATION_BATCH = "runner:location:batch"
    }
}
