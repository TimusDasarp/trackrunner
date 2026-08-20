//
//  APIClient.swift
//  TrackRunner
//

import Foundation

actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private var authToken: String?

    init(session: URLSession = .shared) {
        self.session = session
    }

    func setAuthToken(_ token: String?) {
        authToken = token
    }

    func login(email: String, password: String) async throws -> AuthResponse {
        try await request(
            "/auth/login",
            method: "POST",
            body: LoginRequest(email: email, password: password),
            includeAuthorization: false
        )
    }

    func logout() async {
        do {
            let _: EmptyResponse = try await request("/auth/logout", method: "POST")
        } catch {
            // The local session should still be cleared when logout cannot reach the backend.
        }
    }

    func getTasks() async throws -> [RunnerTask] {
        let response: TaskListResponse = try await request("/tasks")
        return response.tasks
    }

    func updateTask(
        id: String,
        status: TaskStatus,
        documents: [RunnerTaskDocumentUpdate]? = nil
    ) async throws -> RunnerTask {
        let response: TaskResponse = try await request(
            "/tasks/\(id)",
            method: "PATCH",
            body: UpdateTaskRequest(status: status, documents: documents)
        )
        return response.task
    }

    private func request<Response: Decodable>(
        _ path: String,
        method: String = "GET",
        includeAuthorization: Bool = true
    ) async throws -> Response {
        try await request(path, method: method, body: Optional<EmptyRequest>.none, includeAuthorization: includeAuthorization)
    }

    private func request<RequestBody: Encodable, Response: Decodable>(
        _ path: String,
        method: String = "GET",
        body: RequestBody?,
        includeAuthorization: Bool = true
    ) async throws -> Response {
        let url = try makeURL(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        if includeAuthorization, let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let apiError = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw APIError.requestFailed(apiError?.message ?? apiError?.error ?? "Request failed (\(httpResponse.statusCode)).")
        }

        if Response.self == EmptyResponse.self {
            return EmptyResponse() as! Response
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }

    private func makeURL(path: String) throws -> URL {
        let rawBaseURL = try APIConfiguration.apiBaseURL()
        guard var components = URLComponents(string: rawBaseURL) else {
            throw APIError.invalidBaseURL
        }

        let basePath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let requestPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        components.path = "/" + [basePath, requestPath]
            .filter { !$0.isEmpty }
            .joined(separator: "/")

        guard let url = components.url else {
            throw APIError.invalidBaseURL
        }
        return url
    }

    private func configuredBaseURL() -> String? {
        if let environmentValue = ProcessInfo.processInfo.environment["API_BASE_URL"] {
            return normalizedBaseURL(environmentValue)
        }
        if let expoOrigin = ProcessInfo.processInfo.environment["EXPO_PUBLIC_API_BASE_URL"] {
            return normalizedBaseURL(expoOrigin, appendingAPIPathIfNeeded: true)
        }
        if let infoPlistValue = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String {
            return normalizedBaseURL(infoPlistValue)
        }
        guard
            let configURL = Bundle.main.url(forResource: "Config", withExtension: "xcconfig"),
            let contents = try? String(contentsOf: configURL, encoding: .utf8)
        else {
            return nil
        }

        return contents
            .split(separator: "\n")
            .compactMap { line -> String? in
                let parts = line.split(separator: "=", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
                guard parts.count == 2, parts[0] == "API_BASE_URL" else {
                    return nil
                }
                return normalizedBaseURL(parts[1])
            }
            .first
    }

    private func normalizedBaseURL(_ value: String, appendingAPIPathIfNeeded: Bool = false) -> String {
        let baseURL = value
            .replacingOccurrences(of: ":/$()/", with: "://")
            .replacingOccurrences(of: "$()", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        guard appendingAPIPathIfNeeded, !baseURL.hasSuffix("/api") else {
            return baseURL
        }
        return "\(baseURL)/api"
    }
}

enum APIError: LocalizedError, Equatable {
    case missingBaseURL
    case invalidBaseURL
    case invalidResponse
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingBaseURL:
            "API_BASE_URL is not configured for this build."
        case .invalidBaseURL:
            "API_BASE_URL is not a valid URL."
        case .invalidResponse:
            "The server returned an invalid response."
        case .requestFailed(let message):
            message
        }
    }
}

nonisolated struct RunnerTaskDocumentUpdate: Codable, Equatable, Sendable {
    let id: String
    let collected: Bool
}

nonisolated private struct LoginRequest: Encodable, Sendable {
    let email: String
    let password: String
}

nonisolated private struct UpdateTaskRequest: Encodable, Sendable {
    let status: TaskStatus
    let documents: [RunnerTaskDocumentUpdate]?
}

nonisolated private struct TaskListResponse: Decodable, Sendable {
    let tasks: [RunnerTask]
}

nonisolated private struct TaskResponse: Decodable, Sendable {
    let task: RunnerTask
}

nonisolated private struct APIErrorResponse: Decodable, Sendable {
    let error: String?
    let message: String?
}

nonisolated private struct EmptyRequest: Encodable, Sendable {}
nonisolated private struct EmptyResponse: Decodable, Sendable {}
