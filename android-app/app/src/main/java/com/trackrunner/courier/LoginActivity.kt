package com.trackrunner.courier

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.trackrunner.courier.data.SessionStore
import com.trackrunner.courier.databinding.ActivityLoginBinding
import com.trackrunner.courier.network.AuthApi
import com.trackrunner.courier.network.AuthApi.LoginRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Email/password sign-in screen. On success the JWT and runner id are stored
 * in [SessionStore] (EncryptedSharedPreferences) and the user is sent to
 * [MainActivity]. On failure an inline error is shown.
 *
 * The login call is intentionally implemented with HttpURLConnection so we
 * don't pull in OkHttp/Retrofit for a single endpoint. The base URL is read
 * from [BuildConfig.SERVER_URL] which is set per build variant.
 */
class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private lateinit var session: SessionStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)
        session = SessionStore(applicationContext)

        // If we already have a valid session, skip the form.
        if (session.isLoggedIn()) {
            goToMain()
            return
        }

        binding.btnLogin.setOnClickListener { attemptLogin() }
        binding.etServerUrl.setText(session.serverUrl() ?: BuildConfig.SERVER_URL)
    }

    private fun attemptLogin() {
        val email = binding.etEmail.text.toString().trim()
        val password = binding.etPassword.text.toString()
        val serverUrl = binding.etServerUrl.text.toString().trim()

        if (email.isEmpty() || password.isEmpty() || serverUrl.isEmpty()) {
            showError(getString(R.string.login_missing_fields))
            return
        }

        setLoading(true)
        lifecycleScope.launch {
            val result = runCatching {
                withContext(Dispatchers.IO) {
                    AuthApi.login(
                        baseUrl = serverUrl,
                        request = LoginRequest(email = email, password = password)
                    )
                }
            }
            setLoading(false)

            result.onSuccess { response ->
                session.saveSession(
                    token = response.token,
                    runnerId = response.user.id,
                    displayName = response.user.displayName,
                    serverUrl = serverUrl
                )
                goToMain()
            }.onFailure { err ->
                Log.w(TAG, "Login failed", err)
                showError(err.message ?: getString(R.string.login_failed))
            }
        }
    }

    private fun setLoading(loading: Boolean) {
        binding.progress.visibility = if (loading) View.VISIBLE else View.GONE
        binding.btnLogin.isEnabled = !loading
        binding.etEmail.isEnabled = !loading
        binding.etPassword.isEnabled = !loading
        binding.etServerUrl.isEnabled = !loading
    }

    private fun showError(message: String) {
        binding.tvError.text = message
        binding.tvError.visibility = View.VISIBLE
    }

    private fun goToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    companion object {
        private const val TAG = "LoginActivity"
    }
}
