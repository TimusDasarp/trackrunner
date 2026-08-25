import { describe, expect, it } from "vitest";
import { beginsToday, taskHealth, type DispatcherTask } from "./taskWorkspace";

const now = Date.parse("2026-08-25T10:00:00.000Z");
const baseTask: DispatcherTask = {
  id: "42",
  runnerId: "11",
  clientName: "Test customer",
  clientAddress: "Test address",
  status: "sent",
  priority: "normal",
};

describe("task workspace health", () => {
  it("puts overdue work ahead of runner availability warnings", () => {
    expect(taskHealth({ ...baseTask, dueAt: "2026-08-25T09:59:00.000Z" }, { runnerId: "11", displayName: "RN 11", online: false, trackingActive: false, status: "offline" }, now))
      .toMatchObject({ label: "Overdue", color: "error" });
  });

  it("flags urgent tasks that have not been acknowledged", () => {
    expect(taskHealth({ ...baseTask, priority: "urgent" }, undefined, now))
      .toMatchObject({ label: "Needs acknowledgement", color: "warning" });
  });

  it("explains a stale runner location without treating the task as overdue", () => {
    expect(taskHealth({ ...baseTask, dueAt: "2026-08-25T18:00:00.000Z" }, { runnerId: "11", displayName: "RN 11", online: true, trackingActive: true, status: "stale" }, now))
      .toMatchObject({ label: "Runner location stale", color: "warning" });
  });

  it("uses the caller supplied date when filtering the today view", () => {
    const today = new Date("2026-08-25T10:00:00.000Z");
    expect(beginsToday("2026-08-25T12:00:00.000Z", today)).toBe(true);
    expect(beginsToday("2026-08-26T00:01:00.000Z", today)).toBe(false);
  });
});
