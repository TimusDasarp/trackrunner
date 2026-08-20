//
//  TrackRunnerApp.swift
//  TrackRunner
//

import SwiftUI

@main
struct TrackRunnerApp: App {
    @StateObject private var liveLocationService = LiveLocationService.shared
    @StateObject private var appState: AppState

    init() {
        let liveLocationService = LiveLocationService.shared
        _liveLocationService = StateObject(wrappedValue: liveLocationService)
        _appState = StateObject(wrappedValue: AppState(liveLocationService: liveLocationService))
    }

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(appState)
                .environmentObject(liveLocationService)
        }
    }
}

private struct AppRootView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var liveLocationService: LiveLocationService
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch appState.sessionState {
            case .loading:
                LoadingSessionView()
            case .signedOut:
                LoginView()
            case .signedIn:
                TaskListView()
            }
        }
        .animation(.snappy, value: appState.sessionState)
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                liveLocationService.appDidBecomeActive()
            }
        }
    }
}

private struct LoadingSessionView: View {
    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "location.north.circle.fill")
                .font(.system(size: 54, weight: .semibold))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(.blue)
            ProgressView("Loading session")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}
