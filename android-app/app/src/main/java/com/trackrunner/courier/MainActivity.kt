package com.trackrunner.courier

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.trackrunner.courier.data.SessionStore
import com.trackrunner.courier.databinding.ActivityMainBinding
import com.trackrunner.courier.service.LocationTrackingService
import com.trackrunner.courier.util.PermissionUtils

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var session: SessionStore

    private val foregroundLocationLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val granted = results.values.any { it }
        if (granted) {
            requestBackgroundLocation()
        } else {
            Toast.makeText(this, R.string.permission_required, Toast.LENGTH_LONG).show()
        }
        refreshUi()
    }

    private val backgroundLocationLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ ->
        requestNotificationPermission()
        refreshUi()
    }

    private val notificationLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ -> refreshUi() }

    private val batteryOptimizationLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { /* result not inspected; user choice is respected either way */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        session = SessionStore(applicationContext)

        // Defensive: if the user landed here without a session, bounce them
        // back to the login screen.
        if (!session.isLoggedIn()) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        binding.btnStart.setOnClickListener { onStartClicked() }
        binding.btnStop.setOnClickListener { onStopClicked() }
        binding.btnLogout.setOnClickListener { onLogoutClicked() }
    }

    override fun onResume() {
        super.onResume()
        refreshUi()
    }

    private fun onStartClicked() {
        if (!PermissionUtils.hasForegroundLocation(this)) {
            requestForegroundLocation()
            return
        }
        if (!PermissionUtils.hasBackgroundLocation(this)) {
            requestBackgroundLocation()
            return
        }
        if (!PermissionUtils.hasNotificationPermission(this)) {
            requestNotificationPermission()
            return
        }
        requestBatteryOptimizationExclusionIfNeeded()
        // Use the authenticated runner id from the session store.
        val runnerId = session.runnerId() ?: return
        LocationTrackingService.start(this, runnerId = runnerId)
        refreshUi()
    }

    private fun onStopClicked() {
        LocationTrackingService.stop(this)
        refreshUi()
    }

    private fun onLogoutClicked() {
        LocationTrackingService.stop(this)
        session.clear()
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }

    private fun requestForegroundLocation() {
        foregroundLocationLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
        )
    }

    private fun requestBackgroundLocation() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            requestNotificationPermission()
            return
        }
        backgroundLocationLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        ) return
        notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun requestBatteryOptimizationExclusionIfNeeded() {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (pm.isIgnoringBatteryOptimizations(packageName)) return
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:$packageName")
        }
        // Wrap in try/catch: some OEMs (Xiaomi, Huawei) block this intent.
        try {
            batteryOptimizationLauncher.launch(intent)
        } catch (t: Throwable) {
            // Fall back to the system battery-optimization list.
            try {
                startActivity(
                    Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                )
            } catch (_: Throwable) { /* nothing more we can do */ }
        }
    }

    private fun refreshUi() {
        val running = isServiceRunning()
        binding.tvStatus.text = getString(
            if (running) R.string.status_running else R.string.status_idle
        )
        binding.btnStart.isEnabled = !running
        binding.btnStop.isEnabled = running

        val name = session.displayName()?.takeIf { it.isNotBlank() }
            ?: session.runnerId()
            ?: ""
        binding.tvUser.text = getString(R.string.logged_in_as, name)
    }

    private fun isServiceRunning(): Boolean {
        val manager = getSystemService(ACTIVITY_SERVICE) as android.app.ActivityManager
        @Suppress("DEPRECATION")
        return manager.getRunningServices(Int.MAX_VALUE).any {
            it.service.className == LocationTrackingService::class.java.name
        }
    }
}
