//
//  LocationPoint.swift
//  TrackRunner
//

import Foundation

nonisolated struct LocationPoint: Codable, Equatable, Sendable {
    let eventId: String
    let runnerId: String
    let latitude: Double
    let longitude: Double
    let accuracy: Double?
    let speed: Double?
    let bearing: Double?
    let altitude: Double?
    let battery: Int?
    let timestamp: Int64
}
