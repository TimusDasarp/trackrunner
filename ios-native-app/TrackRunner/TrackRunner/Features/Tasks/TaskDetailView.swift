//
//  TaskDetailView.swift
//  TrackRunner
//

import SwiftUI

struct TaskDetailView: View {
    @Environment(\.openURL) private var openURL

    let taskID: String
    @ObservedObject var viewModel: TaskViewModel

    @State private var showsNavigationOptions = false
    @State private var mapsError: String?

    private var task: RunnerTask? {
        viewModel.task(for: taskID)
    }

    var body: some View {
        Group {
            if let task {
                List {
                    Section {
                        TaskDetailHeaderView(task: task)
                            .listRowInsets(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
                    }

                    Section {
                        Button {
                            showsNavigationOptions = true
                        } label: {
                            Label("Open Navigation", systemImage: "location.fill")
                                .font(.headline)
                        }
                        .disabled(viewModel.updatingTaskIDs.contains(task.id))

                        LabeledContent("Address", value: task.clientAddress)
                        if let latitude = task.destinationLat, let longitude = task.destinationLon {
                            LabeledContent("Coordinates", value: "\(latitude), \(longitude)")
                        }
                    } header: {
                        Text("Destination")
                    }

                    Section("Client") {
                        if let phoneURL = phoneURL(for: task.clientPhone) {
                            Link(destination: phoneURL) {
                                Label(task.clientPhone, systemImage: "phone.fill")
                            }
                        } else if !task.clientPhone.isEmpty {
                            Label(task.clientPhone, systemImage: "phone.fill")
                        }

                        if let notes = task.notes, !notes.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Notes")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Text(notes)
                                    .font(.body)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }

                    Section {
                        if task.documents.isEmpty {
                            Text("No documents required.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(task.documents) { document in
                                Toggle(
                                    isOn: Binding(
                                        get: { document.collected },
                                        set: { collected in
                                            Task {
                                                await viewModel.setDocumentCollected(
                                                    task,
                                                    document: document,
                                                    collected: collected
                                                )
                                            }
                                        }
                                    )
                                ) {
                                    Label(
                                        document.name,
                                        systemImage: document.collected ? "checkmark.circle.fill" : "circle"
                                    )
                                }
                                .tint(.green)
                                .disabled(viewModel.updatingTaskIDs.contains(task.id))
                            }
                        }
                    } header: {
                        Text("Documents To Collect")
                    }

                    Section {
                        if let actionTitle = task.status.primaryActionTitle {
                            Button {
                                Task {
                                    await viewModel.advance(task)
                                }
                            } label: {
                                Label(actionTitle, systemImage: "arrow.forward.circle.fill")
                                    .font(.headline)
                            }
                            .disabled(viewModel.updatingTaskIDs.contains(task.id))
                        }

                        if task.status != .completed && task.status != .unableToComplete {
                            Button(role: .destructive) {
                                Task {
                                    await viewModel.markUnableToComplete(task)
                                }
                            } label: {
                                Label("Unable To Complete", systemImage: "xmark.octagon.fill")
                            }
                            .disabled(viewModel.updatingTaskIDs.contains(task.id))
                        }
                    } header: {
                        Text("Task Status")
                    } footer: {
                        if viewModel.updatingTaskIDs.contains(task.id) {
                            Text("Saving task changes...")
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                .background(
                    LinearGradient(
                        colors: [
                            Color(.systemGroupedBackground),
                            Color.mint.opacity(0.08),
                            Color.blue.opacity(0.07)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .ignoresSafeArea()
                )
                .navigationTitle(task.clientName)
                .navigationBarTitleDisplayMode(.inline)
            } else {
                ContentUnavailableView(
                    "Task Not Found",
                    systemImage: "tray",
                    description: Text("Refresh assigned tasks and try again.")
                )
            }
        }
        .alert(
            "Maps Unavailable",
            isPresented: Binding(
                get: { mapsError != nil },
                set: { newValue in
                    if !newValue {
                        mapsError = nil
                    }
                }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(mapsError ?? "Could not open driving directions.")
        }
        .confirmationDialog("Open Navigation", isPresented: $showsNavigationOptions, titleVisibility: .visible) {
            if let task {
                Button("Google Maps") {
                    openNavigation(for: task, provider: .googleMaps)
                }
                Button("Apple Maps") {
                    openNavigation(for: task, provider: .appleMaps)
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func openNavigation(for task: RunnerTask, provider: NavigationProvider) {
        guard let destination = navigationDestination(for: task), let url = provider.url(destination: destination) else {
            mapsError = "The task destination could not be opened."
            return
        }

        openURL(url) { accepted in
            if !accepted {
                mapsError = "Could not open \(provider.title)."
            }
        }
    }

    private func navigationDestination(for task: RunnerTask) -> String? {
        if let latitude = task.destinationLat, let longitude = task.destinationLon {
            return "\(latitude),\(longitude)"
        }

        let address = task.clientAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        return address.isEmpty ? nil : address
    }

    private func phoneURL(for phone: String) -> URL? {
        let digits = phone.filter { $0.isNumber || $0 == "+" }
        guard !digits.isEmpty else {
            return nil
        }
        return URL(string: "tel://\(digits)")
    }
}

private enum NavigationProvider {
    case googleMaps
    case appleMaps

    var title: String {
        switch self {
        case .googleMaps:
            "Google Maps"
        case .appleMaps:
            "Apple Maps"
        }
    }

    func url(destination: String) -> URL? {
        switch self {
        case .googleMaps:
            var components = URLComponents(string: "https://www.google.com/maps/dir/")
            components?.queryItems = [
                URLQueryItem(name: "api", value: "1"),
                URLQueryItem(name: "destination", value: destination),
                URLQueryItem(name: "travelmode", value: "driving")
            ]
            return components?.url
        case .appleMaps:
            var components = URLComponents(string: "https://maps.apple.com/")
            components?.queryItems = [
                URLQueryItem(name: "daddr", value: destination),
                URLQueryItem(name: "dirflg", value: "d")
            ]
            return components?.url
        }
    }
}

private struct TaskDetailHeaderView: View {
    let task: RunnerTask

    private var collectedDocumentCount: Int {
        task.documents.filter(\.collected).count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: task.status.iconName)
                    .font(.system(size: 36, weight: .semibold))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(task.status.tint)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 7) {
                    Text(task.clientName)
                        .font(.title3.bold())
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        PriorityBadge(priority: task.priority ?? .normal)
                        StatusBadge(status: task.status)
                    }
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: 10) {
                DetailMetricView(title: "Documents", value: "\(collectedDocumentCount)/\(task.documents.count)", systemImage: "doc.text.fill", tint: .green)
                DetailMetricView(title: "Priority", value: (task.priority ?? .normal).title, systemImage: (task.priority ?? .normal).iconName, tint: (task.priority ?? .normal).tint)
            }
        }
        .padding(.vertical, 4)
        .padding(14)
        .trackRunnerGlass(cornerRadius: 8, tint: task.status.tint.opacity(0.08))
    }
}

private struct DetailMetricView: View {
    let title: String
    let value: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.subheadline.weight(.bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .trackRunnerGlass(cornerRadius: 8, tint: tint.opacity(0.08))
    }
}
