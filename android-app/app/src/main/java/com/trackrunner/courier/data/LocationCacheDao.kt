package com.trackrunner.courier.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
interface LocationCacheDao {

    @Insert
    suspend fun insert(location: CachedLocation): Long

    @Insert
    suspend fun insertAll(locations: List<CachedLocation>)

    @Query("SELECT * FROM location_cache ORDER BY timestamp ASC LIMIT :limit")
    suspend fun getBatch(limit: Int = 500): List<CachedLocation>

    @Query("SELECT COUNT(*) FROM location_cache")
    suspend fun count(): Int

    @Query("DELETE FROM location_cache WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<Long>)

    @Query("DELETE FROM location_cache")
    suspend fun clear()

    /**
     * Trim the cache if it grows beyond [maxRows] to avoid unbounded disk usage
     * during long offline periods. Keeps the most recent rows.
     */
    @Query("""
        DELETE FROM location_cache
        WHERE id NOT IN (
            SELECT id FROM location_cache ORDER BY timestamp DESC LIMIT :maxRows
        )
    """)
    suspend fun trim(maxRows: Int)
}
