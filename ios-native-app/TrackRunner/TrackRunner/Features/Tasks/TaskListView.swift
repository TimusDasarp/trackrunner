//
//  TaskListView.swift
//  TrackRunner
//

import SwiftUI

struct TaskListView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var liveLocationService: LiveLocationService
    @StateObject private var viewModel = TaskViewModel()
    @State private var showsLogoutConfirmation = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    DashboardHeaderView(
                        user: appState.currentUser,
                        locationState: liveLocationService.state
                    )

                    if let errorMessage = viewModel.errorMessage {
                        InlineErrorView(message: errorMessage)
                    }

                    TaskSectionView(viewModel: viewModel)
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 28)
            }
            .background(TrackRunnerBackground().ignoresSafeArea())
            .navigationTitle("Tasks")
            .navigationDestination(for: String.self) { taskID in
                TaskDetailView(taskID: taskID, viewModel: viewModel)
            }
            .refreshable {
                await viewModel.loadTasks()
            }
            .task {
                await viewModel.startAutoRefresh()
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showsLogoutConfirmation = true
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .confirmationDialog("Sign out of TrackRunner?", isPresented: $showsLogoutConfirmation) {
                Button("Sign Out", role: .destructive) {
                    Task {
                        await appState.signOut()
                    }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }
}

private struct TrackRunnerBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(.systemBackground),
                Color(.systemGroupedBackground),
                Color.mint.opacity(0.10),
                Color.blue.opacity(0.08)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private struct DashboardHeaderView: View {
    let user: User?
    let locationState: LiveLocationState

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center, spacing: 12) {
                ZStack {
                    Circle()
                        .fill(.blue.opacity(0.14))
                    Image(systemName: "figure.run")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.blue)
                }
                .frame(width: 48, height: 48)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Welcome back")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text(user?.displayName ?? user?.email ?? "Runner")
                        .font(.title3.weight(.semibold))
                        .lineLimit(1)
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: 10) {
                LiveStatusChip(
                    title: "Location",
                    value: locationState.locationDisplayValue,
                    systemImage: locationState.locationDisplayIcon,
                    tint: locationState.locationDisplayTint
                )
                LiveStatusChip(
                    title: "Socket",
                    value: locationState.isConnected ? "Online" : "Retrying",
                    systemImage: locationState.isConnected ? "wifi" : "wifi.exclamationmark",
                    tint: locationState.isConnected ? .green : .orange
                )
                LiveStatusChip(
                    title: "Queued",
                    value: "\(locationState.pendingCount)",
                    systemImage: "arrow.triangle.2.circlepath",
                    tint: locationState.pendingCount == 0 ? .green : .orange
                )
            }

            if let message = locationState.userFacingErrorMessage {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if let detail = locationState.locationDetailMessage {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: "clock.arrow.circlepath")
                        .foregroundStyle(.orange)
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(16)
        .trackRunnerGlass(cornerRadius: 8, tint: .blue.opacity(0.05))
    }
}

private struct LiveStatusChip: View {
    let title: String
    let value: String
    let systemImage: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(tint)
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 11)
        .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct InlineErrorView: View {
    let message: String

    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.footnote)
            .foregroundStyle(.red)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct TaskSectionView: View {
    @ObservedObject var viewModel: TaskViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center) {
                Text("Assigned Tasks")
                    .font(.headline)
                Spacer()
                if viewModel.isLoading && !viewModel.tasks.isEmpty {
                    ProgressView()
                        .controlSize(.small)
                }
            }
            .padding(.horizontal, 2)

            if viewModel.isLoading && viewModel.tasks.isEmpty {
                LoadingTasksView()
            } else if viewModel.prioritizedTasks.isEmpty {
                ContentUnavailableView(
                    "No Active Tasks",
                    systemImage: "tray",
                    description: Text("Assigned courier tasks will appear here.")
                )
                .frame(maxWidth: .infinity)
                .padding(.vertical, 28)
                .trackRunnerGlass(cornerRadius: 8)
            } else {
                ForEach(viewModel.prioritizedTasks) { task in
                    NavigationLink(value: task.id) {
                        TaskCardView(
                            task: task,
                            isUpdating: viewModel.updatingTaskIDs.contains(task.id)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct LoadingTasksView: View {
    var body: some View {
        HStack(spacing: 12) {
            ProgressView()
            Text("Loading assigned tasks")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .padding(.vertical, 24)
        .trackRunnerGlass(cornerRadius: 8)
    }
}

private struct TaskCardView: View {
    let task: RunnerTask
    let isUpdating: Bool

    private var priority: TaskPriority {
        task.priority ?? .normal
    }

    private var collectedDocumentCount: Int {
        task.documents.filter(\.collected).count
    }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(priority.tint)
                .frame(width: 5)

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(task.clientName)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(2)

                        HStack(spacing: 8) {
                            PriorityBadge(priority: priority)
                            StatusBadge(status: task.status)
                        }
                    }

                    Spacer(minLength: 8)

                    if isUpdating {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                            .padding(.top, 4)
                    }
                }

                Label(task.clientAddress, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 12) {
                    if !task.clientPhone.isEmpty {
                        InfoPill(systemImage: "phone.fill", text: task.clientPhone)
                    }

                    if !task.documents.isEmpty {
                        InfoPill(systemImage: "doc.text.fill", text: "\(collectedDocumentCount)/\(task.documents.count) docs")
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(priority.tint.opacity(0.05), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .trackRunnerGlass(cornerRadius: 8, tint: priority.tint.opacity(0.04), interactive: true)
    }
}

private struct InfoPill: View {
    let systemImage: String
    let text: String

    var body: some View {
        Label(text, systemImage: systemImage)
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.78)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Color(.tertiarySystemGroupedBackground), in: Capsule())
    }
}

struct PriorityBadge: View {
    let priority: TaskPriority

    var body: some View {
        Label(priority.title, systemImage: priority.iconName)
            .font(.caption.weight(.semibold))
            .labelStyle(.titleAndIcon)
            .foregroundStyle(priority.tint)
            .lineLimit(1)
    }
}

struct StatusBadge: View {
    let status: TaskStatus

    var body: some View {
        Label(status.title, systemImage: status.iconName)
            .font(.caption.weight(.semibold))
            .foregroundStyle(status.tint)
            .lineLimit(1)
    }
}

private extension LiveLocationState {
    var locationDisplayValue: String {
        if status == .permissionDenied || status == .configurationMissing || status == .waitingForPermission || status == .stopped {
            return status.title
        }
        if isConnected && isLocationFresh {
            return "Live"
        }
        if isConnected {
            return "Waiting"
        }
        return "Retrying"
    }

    var locationDisplayIcon: String {
        if isConnected && isLocationFresh {
            return "location.fill"
        }
        if isConnected {
            return "location"
        }
        return "location.slash"
    }

    var locationDisplayTint: Color {
        if isConnected && isLocationFresh {
            return .green
        }
        if isConnected {
            return .orange
        }
        return .red
    }

    var locationDetailMessage: String? {
        guard status != .permissionDenied, status != .configurationMissing else {
            return nil
        }

        if isConnected && !isLocationFresh {
            if let locationAgeDescription {
                return "Connected, waiting for a fresh GPS point. Last location was \(locationAgeDescription)."
            }
            return "Connected, waiting for the first GPS point."
        }
        if isConnected && isLocationFresh && !backgroundUpdatesEnabled {
            return "Location is live while the app is open. Background live tracking needs Always permission and Location Updates enabled for this build."
        }
        return nil
    }

    var userFacingErrorMessage: String? {
        guard let errorMessage, !errorMessage.isEmpty else {
            return nil
        }

        let lowercased = errorMessage.lowercased()
        if lowercased.contains("session id unknown") || lowercased.contains("cancelled") || lowercased.contains("canceled") {
            return "Live connection is reconnecting. Location updates are queued until it is back online."
        }
        return errorMessage
    }
}

struct TaskListView_Previews: PreviewProvider {
    static var previews: some View {
        TaskListView()
            .environmentObject(AppState())
            .environmentObject(LiveLocationService.shared)
    }
}
