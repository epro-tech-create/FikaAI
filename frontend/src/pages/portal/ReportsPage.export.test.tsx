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
    students: [{ studentName: "Asha", registrationNumber: "001", daysPresent: 15, lateDays: 2, attendanceRate: 50 }],
  } }).mockResolvedValue({ data: new Blob(["workbook"]) });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ReportsPage role={role} />));
    expect(container.textContent).toContain("50.0%");
    const buttons = Array.from(container.querySelectorAll("button"));
    await act(async () => buttons.find(b => b.textContent === "Export all days (Excel)")!.click());
    expect(api.get).toHaveBeenLastCalledWith(`/${role}/reports/attendance.xlsx`, {
      params: { period: "all" }, responseType: "blob",
    });
    expect(click).toHaveBeenCalled();
    await act(async () => buttons.find(b => b.textContent === "Export Excel")!.click());
    expect(api.get).toHaveBeenLastCalledWith(`/${role}/reports/attendance.xlsx`, {
      params: { period: "monthly", date: "2026-09-15" }, responseType: "blob",
    });
  } finally {
    await act(async () => root.unmount());
  }
});
