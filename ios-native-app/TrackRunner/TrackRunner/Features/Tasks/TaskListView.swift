//
//  TaskListView.swift
//  TrackRunner
//

import SwiftUI

struct TaskListView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = TaskViewModel()
    @State private var showsLogoutConfirmation = false

    var body: some View {
        NavigationStack {
            List {
                if let errorMessage = viewModel.errorMessage {
                    Section {
                        ContentUnavailableView(
                            "Could Not Load Tasks",
                            systemImage: "exclamationmark.triangle",
                            description: Text(errorMessage)
                        )
                    }
                }

                Section {
                    if viewModel.isLoading && viewModel.tasks.isEmpty {
                        HStack {
                            Spacer()
                            ProgressView("Loading tasks")
                            Spacer()
                        }
                    } else if viewModel.prioritizedTasks.isEmpty {
                        ContentUnavailableView(
                            "No Active Tasks",
                            systemImage: "tray",
                            description: Text("Assigned courier tasks will appear here.")
                        )
                    } else {
                        ForEach(viewModel.prioritizedTasks) { task in
                            NavigationLink(value: task.id) {
                                TaskRowView(
                                    task: task,
                                    isUpdating: viewModel.updatingTaskIDs.contains(task.id)
                                )
                            }
                        }
                    }
                } header: {
                    Text("Assigned Tasks")
                }
            }
            .navigationTitle("TrackRunner")
            .navigationDestination(for: String.self) { taskID in
                TaskDetailView(taskID: taskID, viewModel: viewModel)
            }
            .refreshable {
                await viewModel.loadTasks()
            }
            .task {
                if viewModel.tasks.isEmpty {
                    await viewModel.loadTasks()
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if let user = appState.currentUser {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Welcome back")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(user.displayName ?? user.email)
                                .font(.subheadline.weight(.semibold))
                                .lineLimit(1)
                        }
                    }
                }

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

private struct TaskRowView: View {
    let task: RunnerTask
    let isUpdating: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(task.clientName)
                    .font(.headline)
                    .lineLimit(2)
                Spacer(minLength: 12)
                if isUpdating {
                    ProgressView()
                        .controlSize(.small)
                }
            }

            HStack(spacing: 8) {
                PriorityBadge(priority: task.priority ?? .normal)
                StatusBadge(status: task.status)
            }

            Label(task.clientAddress, systemImage: "mappin.and.ellipse")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            if !task.clientPhone.isEmpty {
                Label(task.clientPhone, systemImage: "phone")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if !task.documents.isEmpty {
                Label("\(task.documents.filter(\.collected).count) of \(task.documents.count) documents collected", systemImage: "doc.text")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }
}

struct PriorityBadge: View {
    let priority: TaskPriority

    var body: some View {
        Label(priority.title, systemImage: iconName)
            .font(.caption.weight(.semibold))
            .labelStyle(.titleAndIcon)
            .foregroundStyle(foregroundStyle)
    }

    private var iconName: String {
        switch priority {
        case .urgent:
            "exclamationmark.octagon.fill"
        case .high:
            "exclamationmark.triangle.fill"
        case .normal:
            "circle.fill"
        case .low:
            "arrow.down.circle.fill"
        }
    }

    private var foregroundStyle: Color {
        switch priority {
        case .urgent:
            .red
        case .high:
            .orange
        case .normal:
            .blue
        case .low:
            .secondary
        }
    }
}

struct StatusBadge: View {
    let status: TaskStatus

    var body: some View {
        Label(status.title, systemImage: iconName)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
    }

    private var iconName: String {
        switch status {
        case .sent:
            "paperplane.fill"
        case .acknowledged:
            "checkmark.message.fill"
        case .inProgress:
            "figure.run"
        case .completed:
            "checkmark.circle.fill"
        case .unableToComplete:
            "xmark.octagon.fill"
        }
    }
}

#Preview {
    TaskListView()
        .environmentObject(AppState())
}
