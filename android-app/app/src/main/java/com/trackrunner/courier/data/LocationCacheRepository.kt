package com.trackrunner.courier.data

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Thin wrapper around [LocationCacheDao] that exposes a coroutine-friendly API
 * to the foreground service. Keeps the service code free of Room details.
 */
class LocationCacheRepository(context: Context) {

    private val dao: LocationCacheDao = AppDatabase.getInstance(context).locationCacheDao()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun cacheLocation(location: CachedLocation) {
        scope.launch {
            try {
                dao.insert(location)
                // Defensive trim: keep at most 5k rows on disk.
                dao.trim(MAX_CACHED_ROWS)
            } catch (t: Throwable) {
                Log.e(TAG, "Failed to cache location", t)
            }
        }
    }

    suspend fun fetchBatch(limit: Int = 500): List<CachedLocation> = dao.getBatch(limit)

    suspend fun deleteByIds(ids: List<Long>) = dao.deleteByIds(ids)

    suspend fun pendingCount(): Int = dao.count()

    companion object {
        private const val TAG = "LocationCacheRepo"
        private const val MAX_CACHED_ROWS = 5_000
    }
}
