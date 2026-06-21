package com.trackrunner.courier.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Persists the runner's auth token and identity across launches. Uses
 * EncryptedSharedPreferences so the JWT is not stored in plaintext on disk.
 */
class SessionStore(context: Context) {

    private val prefs: SharedPreferences = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (t: Throwable) {
        // Fallback for emulators / devices where the keystore is unavailable.
        context.getSharedPreferences("${FILE_NAME}_fallback", Context.MODE_PRIVATE)
    }

    fun saveSession(token: String, runnerId: String, displayName: String?, serverUrl: String?) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_RUNNER_ID, runnerId)
            .putString(KEY_DISPLAY_NAME, displayName)
            .putString(KEY_SERVER_URL, serverUrl)
            .apply()
    }

    fun token(): String? = prefs.getString(KEY_TOKEN, null)
    fun runnerId(): String? = prefs.getString(KEY_RUNNER_ID, null)
    fun displayName(): String? = prefs.getString(KEY_DISPLAY_NAME, null)
    fun serverUrl(): String? = prefs.getString(KEY_SERVER_URL, null)
    fun isLoggedIn(): Boolean = !token().isNullOrBlank() && !runnerId().isNullOrBlank()

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val FILE_NAME = "trackrunner.session"
        private const val KEY_TOKEN = "token"
        private const val KEY_RUNNER_ID = "runner_id"
        private const val KEY_DISPLAY_NAME = "display_name"
        private const val KEY_SERVER_URL = "server_url"
    }
}
