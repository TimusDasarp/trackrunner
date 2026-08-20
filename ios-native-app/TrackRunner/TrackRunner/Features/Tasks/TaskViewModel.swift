//
//  TaskViewModel.swift
//  TrackRunner
//

import Combine
import Foundation

@MainActor
final class TaskViewModel: ObservableObject {
    private let apiClient: APIClient
    private var taskChangeObserver: NSObjectProtocol?

    @Published private(set) var tasks: [RunnerTask] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var updatingTaskIDs: Set<String> = []

    var prioritizedTasks: [RunnerTask] {
        tasks.filter { task in
            task.status != .completed && task.status != .unableToComplete
        }
        .sorted { lhs, rhs in
            let leftRank = lhs.priority?.sortRank ?? TaskPriority.normal.sortRank
            let rightRank = rhs.priority?.sortRank ?? TaskPriority.normal.sortRank
            if leftRank == rightRank {
                return lhs.createdAt < rhs.createdAt
            }
            return leftRank < rightRank
        }
    }

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
        taskChangeObserver = NotificationCenter.default.addObserver(
            forName: .runnerTaskDidChange,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let task = notification.object as? RunnerTask else {
                return
            }
            Task { @MainActor [weak self] in
                self?.upsert(task)
            }
        }
    }

    deinit {
        if let taskChangeObserver {
            NotificationCenter.default.removeObserver(taskChangeObserver)
        }
    }

    func loadTasks(showLoading: Bool = true) async {
        if showLoading {
            isLoading = true
        }
        if showLoading || tasks.isEmpty {
            errorMessage = nil
        }
        do {
            tasks = try await apiClient.getTasks()
            errorMessage = nil
        } catch {
            if showLoading || tasks.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
        if showLoading {
            isLoading = false
        }
    }

    func startAutoRefresh() async {
        await loadTasks()

        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            await loadTasks(showLoading: false)
        }
    }

    func task(for id: String) -> RunnerTask? {
        tasks.first { $0.id == id }
    }

    func advance(_ task: RunnerTask) async {
        guard let nextStatus = task.status.nextStatus else {
            return
        }
        await update(task, status: nextStatus)
    }

    func markUnableToComplete(_ task: RunnerTask) async {
        await update(task, status: .unableToComplete)
    }

    func setDocumentCollected(_ task: RunnerTask, document: RunnerTaskDocument, collected: Bool) async {
        let documents = task.documents.map { item in
            RunnerTaskDocumentUpdate(
                id: item.id,
                collected: item.id == document.id ? collected : item.collected
            )
        }
        await update(task, status: task.status, documents: documents)
    }

    private func update(
        _ task: RunnerTask,
        status: TaskStatus,
        documents: [RunnerTaskDocumentUpdate]? = nil
    ) async {
        updatingTaskIDs.insert(task.id)
        errorMessage = nil
        do {
            let updatedTask = try await apiClient.updateTask(
                id: task.id,
                status: status,
                documents: documents
            )
            upsert(updatedTask)
        } catch {
            errorMessage = error.localizedDescription
        }
        updatingTaskIDs.remove(task.id)
    }

    private func upsert(_ task: RunnerTask) {
        if task.status == .completed || task.status == .unableToComplete {
            tasks.removeAll { $0.id == task.id }
            return
        }

        guard let index = tasks.firstIndex(where: { $0.id == task.id }) else {
            tasks.insert(task, at: 0)
            return
        }
        tasks[index] = task
    }
}
