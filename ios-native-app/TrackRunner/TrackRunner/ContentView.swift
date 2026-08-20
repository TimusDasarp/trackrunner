//
//  ContentView.swift
//  TrackRunner
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        switch appState.sessionState {
        case .loading:
            ProgressView("Loading session")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .signedOut:
            LoginView()
        case .signedIn:
            TaskListView()
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
            .environmentObject(AppState())
    }
}
