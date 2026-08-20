//
//  AppState.swift
//  TrackRunner
//

import Combine
import Foundation

@MainActor
final class AppState: ObservableObject {
    private let apiClient: APIClient
    private let keychainService: KeychainService
    private let liveLocationService: LiveLocationService

    @Published private(set) var sessionState: SessionState = .loading

    var currentUser: User? {
        guard case .signedIn(let user) = sessionState else {
            return nil
        }
        return user
    }

    init(
        apiClient: APIClient = .shared,
        keychainService: KeychainService? = nil,
        liveLocationService: LiveLocationService? = nil
    ) {
        self.apiClient = apiClient
        self.keychainService = keychainService ?? KeychainService.shared
        self.liveLocationService = liveLocationService ?? LiveLocationService.shared

        Task {
            await restoreSession()
        }
    }

    func restoreSession() async {
        do {
            guard let session = try keychainService.loadSession(), !session.token.isEmpty else {
                sessionState = .signedOut
                await apiClient.setAuthToken(nil)
                return
            }
            await apiClient.setAuthToken(session.token)
            sessionState = .signedIn(session.user)
            await liveLocationService.start(user: session.user, token: session.token)
        } catch {
            try? keychainService.clearSession()
            await apiClient.setAuthToken(nil)
            sessionState = .signedOut
        }
    }

    func login(email: String, password: String) async throws {
        let response = try await apiClient.login(
            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
            password: password
        )
        guard response.user.role == .runner else {
            throw APIError.requestFailed("This app is for courier accounts. Please sign in with a runner account.")
        }
        try keychainService.saveSession(StoredSession(token: response.token, user: response.user))
        await apiClient.setAuthToken(response.token)
        sessionState = .signedIn(response.user)
        await liveLocationService.start(user: response.user, token: response.token)
    }

    func signOut() async {
        await liveLocationService.stop()
        await apiClient.logout()
        try? keychainService.clearSession()
        await apiClient.setAuthToken(nil)
        sessionState = .signedOut
    }
}

enum SessionState: Equatable {
    case loading
    case signedOut
    case signedIn(User)
}
