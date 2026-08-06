package com.trackrunner.courier.network

/**
 * Wire format for a single location update pushed from the runner app to the
 * Node.js backend. Field names are kept short to minimise payload size on
 * cellular networks.
 */
data class LocationPayload(
    val runnerId: String,
    val lat: Double,
    val lon: Double,
    val accuracy: Float,
    val speed: Float,
    val bearing: Float,
    val altitude: Double,
    val battery: Int,
    val ts: Long
)
