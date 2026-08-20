//
//  LocationQueue.swift
//  TrackRunner
//

import Foundation

actor LocationQueue {
    static let shared = LocationQueue()

    private let storageKey = "TrackRunner.PendingLocations"
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    func append(_ point: LocationPoint) {
        var points = loadAll()
        points.append(point)
        save(points)
    }

    func pendingCount() -> Int {
        loadAll().count
    }

    func pendingBatch(limit: Int = 1000) -> [LocationPoint] {
        Array(loadAll().prefix(limit))
    }

    func remove(eventIDs: Set<String>) {
        guard !eventIDs.isEmpty else {
            return
        }
        save(loadAll().filter { !eventIDs.contains($0.eventId) })
    }

    func clear() {
        UserDefaults.standard.removeObject(forKey: storageKey)
    }

    private func loadAll() -> [LocationPoint] {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else {
            return []
        }
        return (try? decoder.decode([LocationPoint].self, from: data)) ?? []
    }

    private func save(_ points: [LocationPoint]) {
        guard let data = try? encoder.encode(points) else {
            return
        }
        UserDefaults.standard.set(data, forKey: storageKey)
    }
}
