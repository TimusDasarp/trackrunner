//
//  TaskDetailView.swift
//  TrackRunner
//

import CoreLocation
import MapKit
import SwiftUI

struct TaskDetailView: View {
    let taskID: String
    let viewModel: TaskViewModel

    @State private var mapsError: String?

    private var task: RunnerTask? {
        viewModel.task(for: taskID)
    }

    var body: some View {
        Group {
            if let task {
                List {
                    Section {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(task.clientName)
                                .font(.title2.bold())
                            HStack(spacing: 8) {
                                PriorityBadge(priority: task.priority ?? .normal)
                                StatusBadge(status: task.status)
                            }
                        }
                        .padding(.vertical, 4)
                    }

                    Section("Destination") {
                        LabeledContent("Address", value: task.clientAddress)
                        if let latitude = task.destinationLat, let longitude = task.destinationLon {
                            LabeledContent("Coordinates", value: "\(latitude), \(longitude)")
                        }
                        Button {
                            Task {
                                await openInMaps(task)
                            }
                        } label: {
                            Label("Open Driving Directions", systemImage: "map")
                        }
                    }

                    Section("Client") {
                        if let phoneURL = phoneURL(for: task.clientPhone) {
                            Link(destination: phoneURL) {
                                Label(task.clientPhone, systemImage: "phone")
                            }
                        } else if !task.clientPhone.isEmpty {
                            Label(task.clientPhone, systemImage: "phone")
                        }

                        if let notes = task.notes, !notes.isEmpty {
                            LabeledContent("Notes", value: notes)
                        }
                    }

                    Section("Documents To Collect") {
                        if task.documents.isEmpty {
                            Text("No documents required.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(task.documents) { document in
                                Toggle(
                                    document.name,
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
                                )
                                .disabled(viewModel.updatingTaskIDs.contains(task.id))
                            }
                        }
                    }

                    Section("Task Status") {
                        if let actionTitle = task.status.primaryActionTitle {
                            Button {
                                Task {
                                    await viewModel.advance(task)
                                }
                            } label: {
                                Label(actionTitle, systemImage: "arrow.forward.circle")
                            }
                            .disabled(viewModel.updatingTaskIDs.contains(task.id))
                        }

                        if task.status != .completed && task.status != .unableToComplete {
                            Button(role: .destructive) {
                                Task {
                                    await viewModel.markUnableToComplete(task)
                                }
                            } label: {
                                Label("Unable To Complete", systemImage: "xmark.octagon")
                            }
                            .disabled(viewModel.updatingTaskIDs.contains(task.id))
                        }
                    }
                }
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
    }

    private func openInMaps(_ task: RunnerTask) async {
        if let latitude = task.destinationLat, let longitude = task.destinationLon {
            openMapItem(
                name: task.clientName,
                coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
            )
            return
        }

        do {
            let placemarks = try await CLGeocoder().geocodeAddressString(task.clientAddress)
            guard let coordinate = placemarks.first?.location?.coordinate else {
                mapsError = "The task address could not be found in Maps."
                return
            }
            openMapItem(name: task.clientName, coordinate: coordinate)
        } catch {
            mapsError = error.localizedDescription
        }
    }

    private func openMapItem(name: String, coordinate: CLLocationCoordinate2D) {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        item.name = name
        item.openInMaps(launchOptions: [
            MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving
        ])
    }

    private func phoneURL(for phone: String) -> URL? {
        let digits = phone.filter { $0.isNumber || $0 == "+" }
        guard !digits.isEmpty else {
            return nil
        }
        return URL(string: "tel://\(digits)")
    }
}
