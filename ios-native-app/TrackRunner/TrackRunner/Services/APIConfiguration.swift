//
//  APIConfiguration.swift
//  TrackRunner
//

import Foundation

nonisolated enum APIConfiguration {
    static func apiBaseURL() throws -> String {
        guard let rawBaseURL = configuredBaseURL(), !rawBaseURL.isEmpty else {
            throw APIError.missingBaseURL
        }
        return rawBaseURL
    }

    static func socketOriginURL() throws -> URL {
        guard var components = URLComponents(string: try apiBaseURL()) else {
            throw APIError.invalidBaseURL
        }
        if components.path.hasSuffix("/api") {
            components.path.removeLast(4)
        }
        guard let url = components.url else {
            throw APIError.invalidBaseURL
        }
        return url
    }

    private static func configuredBaseURL() -> String? {
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

    private static func normalizedBaseURL(_ value: String, appendingAPIPathIfNeeded: Bool = false) -> String {
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
