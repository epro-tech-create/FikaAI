// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import ReportsPage from "./ReportsPage";
import { api } from "../../services/api";

vi.mock("../../services/api", () => ({
  api: { get: vi.fn() },
  message: () => "Export failed",
}));

afterEach(() => vi.restoreAllMocks());

it.each(["admin", "instructor"] as const)("exports all days without month filters for %s", async (role) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(api.get).mockResolvedValueOnce({ data: {
    date: "2026-09-15", startDate: "2026-09-01", endDate: "2026-09-30",
    students: [{ studentId: "student-1", studentName: "Asha", registrationNumber: "001", daysPresent: 15, lateDays: 2, attendanceRate: 50 }],
  } }).mockResolvedValue({ data: new Blob(["workbook"]) });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ReportsPage role={role} />));
    expect(container.textContent).toContain("Student preview");
    expect(container.textContent).toContain("Asha");
    expect(container.textContent).not.toContain("50.0%");
    expect(container.querySelectorAll("thead th")).toHaveLength(5);
    expect(container.querySelector('input[type="date"]')).toBeNull();
    const buttons = Array.from(container.querySelectorAll("button"));
    await act(async () => buttons.find(b => b.textContent === "Export all days (PDF)")!.click());
    expect(api.get).toHaveBeenLastCalledWith(`/${role}/reports/attendance.pdf`, {
      params: { period: "all" }, responseType: "blob",
    });
    await act(async () => buttons.find(b => b.textContent === "Download PDF")!.click());
    expect(api.get).toHaveBeenLastCalledWith(`/${role}/reports/attendance.pdf`, {
      params: { period: "monthly", date: "2026-09-15" }, responseType: "blob",
    });
    await act(async () => buttons.find(b => b.textContent === "All-days PDF")!.click());
    expect(api.get).toHaveBeenLastCalledWith(`/${role}/reports/student/student-1.pdf`, {
      params: { period: "all" }, responseType: "blob",
    });
    expect(container.querySelector("tbody td")?.textContent).toBe("1");
    expect(click).toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});
