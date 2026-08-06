package com.trackrunner.courier.data

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Persisted location sample used as a fallback buffer when the WebSocket
 * connection is unavailable. Rows are flushed in batches on reconnect and
 * then deleted from the local table.
 */
@Entity(tableName = "location_cache")
data class CachedLocation(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val speed: Float,
    val bearing: Float,
    val altitude: Double,
    val batteryPercent: Int,
    val timestamp: Long,
    val runnerId: String
)
