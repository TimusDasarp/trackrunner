//
//  User.swift
//  TrackRunner
//

import Foundation

nonisolated struct User: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let email: String
    let role: UserRole
    let displayName: String?
    let organizationId: String
}

nonisolated enum UserRole: String, Codable, Equatable, Sendable {
    case runner
    case dispatcher
    case admin
}

nonisolated struct AuthResponse: Codable, Equatable, Sendable {
    let token: String
    let user: User
}
