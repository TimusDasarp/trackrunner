package com.trackrunner.courier.network

import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Minimal REST client for the auth endpoint. Kept dependency-free so the APK
 * stays small; if the app grows beyond a handful of endpoints we should swap
 * this for Retrofit + Moshi.
 */
object AuthApi {

    data class LoginRequest(val email: String, val password: String)

    data class LoginUser(
        val id: String,
        val email: String,
        val role: String,
        val displayName: String?
    )

    data class LoginResponse(val token: String, val user: LoginUser)

    fun login(baseUrl: String, request: LoginRequest): LoginResponse {
        val url = URL(baseUrl.trimEnd('/') + "/api/auth/login")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 10_000
            readTimeout = 10_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
        }

        try {
            val body = JSONObject()
                .put("email", request.email)
                .put("password", request.password)
                .toString()
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body) }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }

            if (code !in 200..299) {
                val message = runCatching {
                    JSONObject(text).optString("error", text)
                }.getOrDefault(text)
                throw IllegalStateException(message.ifBlank { "HTTP $code" })
            }

            val json = JSONObject(text)
            val token = json.optString("token")
            if (token.isBlank()) throw IllegalStateException("Server returned no token")
            val userJson = json.getJSONObject("user")
            val user = LoginUser(
                id = userJson.getString("id"),
                email = userJson.getString("email"),
                role = userJson.optString("role", "runner"),
                displayName = if (userJson.isNull("displayName")) null else userJson.optString("displayName")
            )
            return LoginResponse(token = token, user = user)
        } finally {
            conn.disconnect()
        }
    }
}
