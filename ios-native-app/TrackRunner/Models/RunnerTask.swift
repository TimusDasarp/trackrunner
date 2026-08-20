//
//  RunnerTask.swift
//  TrackRunner
//

import Foundation

struct RunnerTask: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let runnerId: String
    let clientName: String
    let clientAddress: String
    let clientPhone: String
    let notes: String?
    let destinationLat: Double?
    let destinationLon: Double?
    let priority: TaskPriority?
    let status: TaskStatus
    let createdAt: String
    let documents: [RunnerTaskDocument]
}

struct RunnerTaskDocument: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let name: String
    let collected: Bool
    let collectedAt: String?
}

enum TaskPriority: String, Codable, Equatable, CaseIterable, Sendable {
    case low
    case normal
    case high
    case urgent

    var title: String {
        rawValue.capitalized
    }

    var sortRank: Int {
        switch self {
        case .urgent:
            0
        case .high:
            1
        case .normal:
            2
        case .low:
            3
        }
    }
}

enum TaskStatus: String, Codable, Equatable, CaseIterable, Sendable {
    case sent
    case acknowledged
    case inProgress = "in_progress"
    case completed
    case unableToComplete = "unable_to_complete"

    var title: String {
        switch self {
        case .sent:
            "Sent"
        case .acknowledged:
            "Acknowledged"
        case .inProgress:
            "In Progress"
        case .completed:
            "Completed"
        case .unableToComplete:
            "Unable To Complete"
        }
    }

    var nextStatus: TaskStatus? {
        switch self {
        case .sent:
            .acknowledged
        case .acknowledged:
            .inProgress
        case .inProgress:
            .completed
        case .completed, .unableToComplete:
            nil
        }
    }

    var primaryActionTitle: String? {
        switch self {
        case .sent:
            "Acknowledge Task"
        case .acknowledged:
            "Start Task"
        case .inProgress:
            "Mark Completed"
        case .completed, .unableToComplete:
            nil
        }
    }
}
