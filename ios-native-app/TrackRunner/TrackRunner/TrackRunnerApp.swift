//
//  TrackRunnerApp.swift
//  TrackRunner
//

import SwiftUI

@main
struct TrackRunnerApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
    }
}
