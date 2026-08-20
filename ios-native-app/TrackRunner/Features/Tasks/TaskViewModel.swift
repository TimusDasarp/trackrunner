//
//  TaskViewModel.swift
//  TrackRunner
//

import Foundation
import Observation

@MainActor
@Observable
final class TaskViewModel {
    private let apiClient: APIClient

    private(set) var tasks: [RunnerTask] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var updatingTaskIDs: Set<String> = []

    var prioritizedTasks: [RunnerTask] {
        tasks.sorted { lhs, rhs in
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
    }

    func loadTasks() async {
        isLoading = true
        errorMessage = nil
        do {
            tasks = try await apiClient.getTasks()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
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
            replace(updatedTask)
        } catch {
            errorMessage = error.localizedDescription
        }
        updatingTaskIDs.remove(task.id)
    }

    private func replace(_ task: RunnerTask) {
        guard let index = tasks.firstIndex(where: { $0.id == task.id }) else {
            tasks.append(task)
            return
        }
        tasks[index] = task
    }
}
