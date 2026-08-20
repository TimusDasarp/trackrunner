//
//  SocketIOPollingClient.swift
//  TrackRunner
//

import Foundation

actor SocketIOPollingClient {
    static let shared = SocketIOPollingClient()

    private let session: URLSession
    private var webSocketTask: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private(set) var isConnected = false

    init(session: URLSession = .shared) {
        self.session = session
    }

    func connect(token: String) async throws {
        if isConnected {
            return
        }

        await disconnect()

        let socket = session.webSocketTask(with: try webSocketURL())
        webSocketTask = socket
        socket.resume()

        do {
            try await completeHandshake(token: token, socket: socket)
            isConnected = true
            startReceiving()
        } catch {
            await disconnect()
            throw error
        }
    }

    func setTrackingActive(_ active: Bool) async throws {
        guard isConnected else {
            return
        }
        try await emit(event: "runner:tracking", payload: TrackingPayload(active: active))
    }

    func emitLocation(_ point: LocationPoint) async throws {
        guard isConnected else {
            throw SocketIOError.notConnected
        }
        try await emit(event: "runner:location", payload: LocationPayload(point: point))
    }

    func emitLocationBatch(_ points: [LocationPoint]) async throws {
        guard isConnected else {
            throw SocketIOError.notConnected
        }
        guard !points.isEmpty else {
            return
        }
        try await emit(event: "runner:location:batch", payload: points.map(LocationPayload.init(point:)))
    }

    func disconnect() async {
        receiveTask?.cancel()
        receiveTask = nil
        isConnected = false

        if let webSocketTask {
            try? await sendPacket("41", socket: webSocketTask)
            webSocketTask.cancel(with: .normalClosure, reason: nil)
        }
        webSocketTask = nil
    }

    private func completeHandshake(token: String, socket: URLSessionWebSocketTask) async throws {
        while !Task.isCancelled {
            let packet = try await receiveString(socket: socket)

            if packet == "2" {
                try await sendPacket("3", socket: socket)
            } else if packet.first == "0" {
                try await sendPacket("40\(encodedAuthPayload(token: token))", socket: socket)
            } else if packet == "40" || packet.hasPrefix("40{") {
                return
            } else if packet.hasPrefix("44") {
                throw SocketIOError.connectionFailed(socketErrorMessage(from: packet) ?? "Socket.IO authentication failed.")
            }
        }

        throw SocketIOError.connectionFailed("Socket.IO connection was cancelled.")
    }

    private func startReceiving() {
        receiveTask?.cancel()
        receiveTask = Task { [weak self] in
            guard let self else {
                return
            }

            while !Task.isCancelled {
                do {
                    guard let socket = await self.webSocketTask else {
                        return
                    }
                    let packet = try await self.receiveString(socket: socket)
                    try await self.handlePacket(packet)
                } catch {
                    await self.markDisconnected()
                    return
                }
            }
        }
    }

    private func handlePacket(_ packet: String) async throws {
        if packet == "2" {
            try await sendPacket("3")
        } else if packet.hasPrefix("41") || packet.hasPrefix("44") {
            throw SocketIOError.connectionFailed(socketErrorMessage(from: packet) ?? "Socket.IO connection closed.")
        } else if packet.hasPrefix("42") {
            await handleSocketEvent(packet)
        }
    }

    private func emit<Payload: Encodable>(event: String, payload: Payload) async throws {
        let eventPayload = SocketEvent(name: event, payload: payload)
        let data = try JSONEncoder().encode(eventPayload)
        let packet = "42\(String(decoding: data, as: UTF8.self))"
        try await sendPacket(packet)
    }

    private func sendPacket(_ packet: String) async throws {
        guard let webSocketTask else {
            isConnected = false
            throw SocketIOError.notConnected
        }
        do {
            try await sendPacket(packet, socket: webSocketTask)
        } catch {
            isConnected = false
            throw error
        }
    }

    private func sendPacket(_ packet: String, socket: URLSessionWebSocketTask) async throws {
        try await socket.send(.string(packet))
    }

    private func receiveString(socket: URLSessionWebSocketTask) async throws -> String {
        switch try await socket.receive() {
        case .string(let value):
            return value
        case .data(let data):
            return String(decoding: data, as: UTF8.self)
        @unknown default:
            throw SocketIOError.connectionFailed("Socket.IO returned an unknown packet type.")
        }
    }

    private func markDisconnected() {
        isConnected = false
        receiveTask?.cancel()
        receiveTask = nil
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
    }

    private func webSocketURL() throws -> URL {
        let origin = try APIConfiguration.socketOriginURL()
        guard var components = URLComponents(url: origin.appendingPathComponent("socket.io/"), resolvingAgainstBaseURL: false) else {
            throw SocketIOError.invalidURL
        }

        switch components.scheme {
        case "https":
            components.scheme = "wss"
        case "http":
            components.scheme = "ws"
        default:
            throw SocketIOError.invalidURL
        }

        components.queryItems = [
            URLQueryItem(name: "EIO", value: "4"),
            URLQueryItem(name: "transport", value: "websocket")
        ]

        guard let url = components.url else {
            throw SocketIOError.invalidURL
        }
        return url
    }

    private func encodedAuthPayload(token: String) -> String {
        let escapedToken = token
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        return "{\"token\":\"\(escapedToken)\"}"
    }

    private func socketErrorMessage(from packet: String) -> String? {
        guard let dataStart = packet.firstIndex(of: "{") else {
            return nil
        }
        let payload = String(packet[dataStart...])
        guard let data = payload.data(using: .utf8),
              let error = try? JSONDecoder().decode(SocketIOErrorPayload.self, from: data) else {
            return payload
        }
        return error.message ?? error.error
    }

    private func handleSocketEvent(_ packet: String) async {
        let payload = String(packet.dropFirst(2))
        guard let data = payload.data(using: .utf8),
              let array = try? JSONSerialization.jsonObject(with: data) as? [Any],
              let eventName = array.first as? String else {
            return
        }

        switch eventName {
        case "task:created", "task:updated":
            guard array.count > 1,
                  JSONSerialization.isValidJSONObject(array[1]),
                  let taskData = try? JSONSerialization.data(withJSONObject: array[1]),
                  let task = try? JSONDecoder().decode(RunnerTask.self, from: taskData) else {
                return
            }
            await MainActor.run {
                NotificationCenter.default.post(name: .runnerTaskDidChange, object: task)
            }
        default:
            return
        }
    }
}

extension Notification.Name {
    static let runnerTaskDidChange = Notification.Name("runnerTaskDidChange")
}

nonisolated enum SocketIOError: LocalizedError, Sendable {
    case invalidURL
    case notConnected
    case connectionFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            "The Socket.IO URL is invalid."
        case .notConnected:
            "The live location socket is not connected."
        case .connectionFailed(let message):
            message
        }
    }
}

nonisolated private struct SocketIOErrorPayload: Decodable, Sendable {
    let error: String?
    let message: String?
}

nonisolated private struct TrackingPayload: Encodable, Sendable {
    let active: Bool
}

nonisolated private struct LocationPayload: Encodable, Sendable {
    let eventId: String
    let runnerId: String
    let lat: Double
    let lon: Double
    let accuracy: Double?
    let speed: Double?
    let bearing: Double?
    let altitude: Double?
    let battery: Int?
    let ts: Int64

    init(point: LocationPoint) {
        eventId = point.eventId
        runnerId = point.runnerId
        lat = point.latitude
        lon = point.longitude
        accuracy = point.accuracy
        speed = point.speed
        bearing = point.bearing
        altitude = point.altitude
        battery = point.battery
        ts = point.timestamp
    }
}

nonisolated private struct SocketEvent<Payload: Encodable>: Encodable {
    let name: String
    let payload: Payload

    func encode(to encoder: Encoder) throws {
        var container = encoder.unkeyedContainer()
        try container.encode(name)
        try container.encode(payload)
    }
}
