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
        let rawBaseURL = ProcessInfo.processInfo.environment["API_BASE_URL"]
            ?? Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String
        guard let rawBaseURL, !rawBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw APIError.missingBaseURL
        }
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

struct RunnerTaskDocumentUpdate: Codable, Equatable, Sendable {
    let id: String
    let collected: Bool
}

private struct LoginRequest: Encodable {
    let email: String
    let password: String
}

private struct UpdateTaskRequest: Encodable {
    let status: TaskStatus
    let documents: [RunnerTaskDocumentUpdate]?
}

private struct TaskListResponse: Decodable {
    let tasks: [RunnerTask]
}

private struct TaskResponse: Decodable {
    let task: RunnerTask
}

private struct APIErrorResponse: Decodable {
    let error: String?
    let message: String?
}

private struct EmptyRequest: Encodable {}
private struct EmptyResponse: Decodable {}
