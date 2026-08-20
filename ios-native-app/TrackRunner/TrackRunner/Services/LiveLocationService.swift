//
//  LiveLocationService.swift
//  TrackRunner
//

import Combine
import CoreLocation
import Foundation
import UIKit

@MainActor
final class LiveLocationService: NSObject, ObservableObject {
    static let shared = LiveLocationService()

    private let manager = CLLocationManager()
    private let socketClient: SocketIOPollingClient
    private let queue: LocationQueue

    private var runnerID: String?
    private var token: String?
    private var foregroundSyncTask: Task<Void, Never>?
    private var connectionMonitorTask: Task<Void, Never>?
    private var freshnessMonitorTask: Task<Void, Never>?

    @Published private(set) var state = LiveLocationState()

    init(
        socketClient: SocketIOPollingClient = .shared,
        queue: LocationQueue = .shared
    ) {
        self.socketClient = socketClient
        self.queue = queue
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 5
        manager.pausesLocationUpdatesAutomatically = false
        UIDevice.current.isBatteryMonitoringEnabled = true
    }

    func start(user: User, token: String) async {
        runnerID = user.id
        self.token = token
        state.permission = permissionState(for: manager.authorizationStatus)
        await refreshPendingCount()

        guard hasLocationUsageDescription else {
            state.status = .configurationMissing
            state.errorMessage = "Add NSLocationWhenInUseUsageDescription to the app Info.plist."
            return
        }

        await ensureSocketConnection()
        startConnectionMonitor()
        startFreshnessMonitor()

        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            beginLocationUpdates()
            requestAlwaysAuthorizationIfConfigured()
        case .denied, .restricted:
            state.status = .permissionDenied
            state.errorMessage = "Location permission is denied. Enable it in Settings to show live dashboard location."
        @unknown default:
            state.status = .permissionDenied
        }
    }

    func stop() async {
        foregroundSyncTask?.cancel()
        foregroundSyncTask = nil
        connectionMonitorTask?.cancel()
        connectionMonitorTask = nil
        freshnessMonitorTask?.cancel()
        freshnessMonitorTask = nil
        manager.stopUpdatingLocation()
        await socketClient.disconnect()
        state.isTracking = false
        state.isConnected = false
        state.status = .stopped
    }

    func refreshPendingCount() async {
        state.pendingCount = await queue.pendingCount()
    }

    func syncNow() async {
        await flushPendingLocations()
    }

    private func beginLocationUpdates() {
        state.permission = permissionState(for: manager.authorizationStatus)
        state.status = .activeForeground
        state.isTracking = true
        configureBackgroundLocationUpdates()
        manager.startUpdatingLocation()
        manager.requestLocation()
        startForegroundSyncTimer()
    }

    private func startForegroundSyncTimer() {
        foregroundSyncTask?.cancel()
        foregroundSyncTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                await self?.captureCurrentLocation()
            }
        }
    }

    private func startConnectionMonitor() {
        connectionMonitorTask?.cancel()
        connectionMonitorTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.ensureSocketConnection()
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
    }

    private func startFreshnessMonitor() {
        freshnessMonitorTask?.cancel()
        freshnessMonitorTask = Task { [weak self] in
            while !Task.isCancelled {
                self?.refreshLocationFreshness()
                try? await Task.sleep(nanoseconds: 10_000_000_000)
            }
        }
    }

    func appDidBecomeActive() {
        guard runnerID != nil else {
            return
        }

        Task {
            await ensureSocketConnection()
            if state.isTracking {
                manager.requestLocation()
            }
            refreshLocationFreshness()
        }
    }

    private func ensureSocketConnection() async {
        guard let token else {
            return
        }

        do {
            if !(await socketClient.isConnected) {
                state.status = state.isTracking ? .activeForeground : .connecting
                try await socketClient.connect(token: token)
                try await socketClient.setTrackingActive(true)
            }
            state.isConnected = true
            state.errorMessage = nil
            await flushPendingLocations()
        } catch {
            state.isConnected = false
            state.errorMessage = userFacingConnectionError(error)
        }
    }

    private func captureCurrentLocation() async {
        guard state.isTracking else {
            return
        }
        manager.requestLocation()
    }

    private func handleLocation(_ location: CLLocation) {
        guard let runnerID else {
            return
        }

        guard Date().timeIntervalSince(location.timestamp) <= LiveLocationState.freshnessInterval else {
            state.lastLocationReceivedAt = location.timestamp
            state.errorMessage = "Connected, waiting for a fresh GPS point."
            refreshLocationFreshness()
            return
        }

        let point = LocationPoint(
            eventId: UUID().uuidString,
            runnerId: runnerID,
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            accuracy: location.horizontalAccuracy >= 0 ? location.horizontalAccuracy : nil,
            speed: location.speed >= 0 ? location.speed : nil,
            bearing: location.course >= 0 ? location.course : nil,
            altitude: location.verticalAccuracy >= 0 ? location.altitude : nil,
            battery: batteryLevel,
            timestamp: Int64(location.timestamp.timeIntervalSince1970 * 1000)
        )

        state.lastLocation = point
        state.lastLocationReceivedAt = location.timestamp
        refreshLocationFreshness()
        Task {
            await sendOrQueue(point)
        }
    }

    private func sendOrQueue(_ point: LocationPoint) async {
        do {
            if !(await socketClient.isConnected) {
                if let token {
                    try await socketClient.connect(token: token)
                    try await socketClient.setTrackingActive(true)
                }
            }
            try await socketClient.emitLocation(point)
            state.isConnected = true
            await flushPendingLocations()
        } catch {
            await queue.append(point)
            state.isConnected = false
            state.errorMessage = userFacingConnectionError(error)
        }
        await refreshPendingCount()
    }

    private func flushPendingLocations() async {
        let pending = await queue.pendingBatch()
        guard !pending.isEmpty else {
            await refreshPendingCount()
            return
        }

        do {
            if !(await socketClient.isConnected), let token {
                try await socketClient.connect(token: token)
                try await socketClient.setTrackingActive(true)
            }
            try await socketClient.emitLocationBatch(pending)
            await queue.remove(eventIDs: Set(pending.map(\.eventId)))
            state.isConnected = true
            state.errorMessage = nil
        } catch {
            state.isConnected = false
            state.errorMessage = userFacingConnectionError(error)
        }
        await refreshPendingCount()
    }

    private func userFacingConnectionError(_ error: Error) -> String {
        let message = error.localizedDescription
        let lowercased = message.lowercased()
        if lowercased.contains("session id unknown") || lowercased.contains("cancelled") || lowercased.contains("canceled") {
            return "Live connection is reconnecting. Location updates are queued until it is back online."
        }
        return message
    }

    private func refreshLocationFreshness() {
        state.freshnessEvaluatedAt = Date()
    }

    private func configureBackgroundLocationUpdates() {
        let hasBackgroundMode = (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String])?.contains("location") == true
        let canRunInBackground = hasBackgroundMode && manager.authorizationStatus == .authorizedAlways
        state.backgroundUpdatesEnabled = canRunInBackground
        manager.allowsBackgroundLocationUpdates = canRunInBackground
        manager.showsBackgroundLocationIndicator = canRunInBackground
    }

    private var batteryLevel: Int? {
        let level = UIDevice.current.batteryLevel
        guard level >= 0 else {
            return nil
        }
        return Int((level * 100).rounded())
    }

    private var hasLocationUsageDescription: Bool {
        Bundle.main.object(forInfoDictionaryKey: "NSLocationWhenInUseUsageDescription") != nil
    }

    private var hasAlwaysUsageDescription: Bool {
        Bundle.main.object(forInfoDictionaryKey: "NSLocationAlwaysAndWhenInUseUsageDescription") != nil
    }

    private func requestAlwaysAuthorizationIfConfigured() {
        guard manager.authorizationStatus == .authorizedWhenInUse, hasAlwaysUsageDescription else {
            return
        }
        manager.requestAlwaysAuthorization()
    }

    private func permissionState(for status: CLAuthorizationStatus) -> LiveLocationPermission {
        switch status {
        case .authorizedAlways:
            .background
        case .authorizedWhenInUse:
            .foregroundOnly
        case .notDetermined:
            .notDetermined
        case .denied, .restricted:
            .denied
        @unknown default:
            .denied
        }
    }
}

extension LiveLocationService: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            state.permission = permissionState(for: manager.authorizationStatus)
            switch manager.authorizationStatus {
            case .authorizedAlways:
                beginLocationUpdates()
            case .authorizedWhenInUse:
                beginLocationUpdates()
                requestAlwaysAuthorizationIfConfigured()
            case .denied, .restricted:
                state.isTracking = false
                state.status = .permissionDenied
                state.errorMessage = "Location permission is denied. Enable it in Settings to show live dashboard location."
            case .notDetermined:
                state.status = .waitingForPermission
            @unknown default:
                state.status = .permissionDenied
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            return
        }
        Task { @MainActor in
            handleLocation(location)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            state.errorMessage = error.localizedDescription
        }
    }
}

nonisolated struct LiveLocationState: Equatable {
    static let freshnessInterval: TimeInterval = 90

    var isTracking = false
    var isConnected = false
    var pendingCount = 0
    var permission: LiveLocationPermission = .notDetermined
    var status: LiveLocationStatus = .stopped
    var lastLocation: LocationPoint?
    var lastLocationReceivedAt: Date?
    var freshnessEvaluatedAt = Date()
    var backgroundUpdatesEnabled = false
    var errorMessage: String?

    var isLocationFresh: Bool {
        guard let lastLocationReceivedAt else {
            return false
        }
        return freshnessEvaluatedAt.timeIntervalSince(lastLocationReceivedAt) <= Self.freshnessInterval
    }

    var locationAgeDescription: String? {
        guard let lastLocationReceivedAt else {
            return nil
        }

        let age = max(0, Int(freshnessEvaluatedAt.timeIntervalSince(lastLocationReceivedAt)))
        if age < 60 {
            return "\(age)s ago"
        }
        return "\(age / 60)m ago"
    }
}

nonisolated enum LiveLocationPermission: String, Equatable {
    case notDetermined
    case foregroundOnly
    case background
    case denied

    var title: String {
        switch self {
        case .notDetermined:
            "Not Requested"
        case .foregroundOnly:
            "While Using"
        case .background:
            "Background"
        case .denied:
            "Denied"
        }
    }
}

nonisolated enum LiveLocationStatus: Equatable {
    case stopped
    case waitingForPermission
    case connecting
    case activeForeground
    case permissionDenied
    case configurationMissing

    var title: String {
        switch self {
        case .stopped:
            "Stopped"
        case .waitingForPermission:
            "Waiting"
        case .connecting:
            "Connecting"
        case .activeForeground:
            "Live"
        case .permissionDenied:
            "Denied"
        case .configurationMissing:
            "Setup Needed"
        }
    }
}
