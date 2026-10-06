import { useEffect, useState, type FormEvent } from "react";
import {
  CardToolbar,
  DataTable,
  PageHeading,
  StatePanel,
  StatCard,
  type TableColumn,
} from "../../components/PortalUI";
import { matchesSearch } from "../../lib/tableSearch";
import type { Role } from "../../lib/auth";
import { api, message } from "../../services/api";

export type ReportPeriod = "daily" | "weekly" | "monthly" | "custom";

type AttendanceRow = Record<string, unknown> & {
  id: string;
  day?: string;
  date?: string;
  studentName: string;
  membershipId?: string | null;
  registrationNumber: string;
  arrivedAt: string | null;
  checkedOutAt: string | null;
  status: string;
};

type StudentSummary = Record<string, unknown> & {
  studentId?: string;
  studentName: string;
  email?: string | null;
  membershipId?: string | null;
  registrationNumber: string;
  yearOfStudy?: number | null;
  status?: string;
  daysPresent: number;
  lateDays: number;
  excusedDays?: number;
  absentDays?: number;
  attendanceRate?: number;
  days?: Record<string, string>;
  daysByDate?: Record<string, string>;
};

type DayMeta = {
  date: string;
  label: string;
  dayNum: string;
  month: string;
  weekday: string;
};

type MonthGroup = { month: string; span: number; dates: string[] };

type ReportPayload = {
  period?: ReportPeriod;
  title?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  days?: DayMeta[];
  monthGroups?: MonthGroup[];
  summary?: {
    totalRecords: number;
    studentsPresent: number;
    totalStudents?: number;
    arrivedEarly: number;
    late: number;
    checkedOut: number;
    excused?: number;
    absent?: number;
  };
  rows?: AttendanceRow[];
  students?: StudentSummary[];
};

type PersonalDay = {
  date: string;
  label: string;
  month: string;
  status: string;
  arrivedAt: string | null;
  checkedOutAt: string | null;
};

type PersonalReport = {
  title?: string;
  startDate?: string;
  endDate?: string;
  student?: {
    studentId: string;
    studentName: string;
    email?: string;
    membershipId?: string | null;
    registrationNumber: string;
    yearOfStudy?: number | null;
    status?: string;
  };
  summary?: {
    totalDays: number;
    daysPresent: number;
    lateDays: number;
    excusedDays: number;
    absentDays: number;
    attendanceRate: number;
  };
  days?: PersonalDay[];
  monthGroups?: MonthGroup[];
};

const WEEKDAY_COLUMNS: TableColumn[] = [
  { key: "studentName", label: "Student" },
  { key: "membershipId", label: "Student ID" },
  { key: "registrationNumber", label: "Registration no." },
  { key: "days.Mon", label: "Mon" },
  { key: "days.Tue", label: "Tue" },
  { key: "days.Wed", label: "Wed" },
  { key: "days.Thu", label: "Thu" },
  { key: "days.Fri", label: "Fri" },
  { key: "daysPresent", label: "Days" },
];

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function attendanceTime(value: string | null) {
  if (!value) return "Not checked out";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function attendanceStatusLabel(status: string) {
  if (status === "ABSENT") return "—";
  if (status === "EXCUSED") return "Excused";
  if (status === "PRESENT") return "Arrived early";
  if (status === "LATE") return "Late";
  if (status === "CHECKED_OUT") return "Checked out";
  return status.replace(/_/g, " ");
}

function cellShort(v: string) {
  if (v === "Present") return "P";
  if (v === "Late") return "L";
  if (v === "Excused") return "E";
  return "—";
}

function cellStyle(v: string): React.CSSProperties {
  if (v === "Present")
    return { background: "#dcfce7", color: "#166534", fontWeight: 700 };
  if (v === "Late")
    return { background: "#fef9c3", color: "#854d0e", fontWeight: 700 };
  if (v === "Excused")
    return { background: "#e0e7ff", color: "#3730a3", fontWeight: 700 };
  return { color: "#94a3b8" };
}

export function attendanceCsv(
  rows: AttendanceRow[],
  period: ReportPeriod = "daily",
) {
  const includeDay = period !== "daily";
  const header = includeDay
    ? [
        "Student name",
        "Student ID",
        "Registration number",
        "Day",
        "Date",
        "Arrival time",
        "Checkout time",
        "Status",
      ]
    : [
        "Student name",
        "Student ID",
        "Registration number",
        "Arrival time",
        "Checkout time",
      ];
  return [
    header,
    ...rows.map((row) => {
      const cells = [
        row.studentName,
        row.membershipId || "",
        row.registrationNumber,
        ...(includeDay ? [row.day || "", row.date || ""] : []),
        attendanceTime(row.arrivedAt),
        row.checkedOutAt ? attendanceTime(row.checkedOutAt) : "",
        ...(includeDay ? [attendanceStatusLabel(row.status)] : []),
      ];
      return cells;
    }),
  ]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");
}

export function matrixCsv(students: StudentSummary[], days: DayMeta[]) {
  const header = [
    "Student name",
    "Student ID",
    "Registration number",
    "Email",
    ...days.map((d) => d.date),
    "Days present",
    "Late",
    "Absent",
    "Rate %",
  ];
  const lines = [header];
  for (const s of students) {
    lines.push([
      s.studentName,
      s.membershipId || "",
      s.registrationNumber,
      (s.email as string) || "",
      ...days.map((d) => s.daysByDate?.[d.date] || "—"),
      String(s.daysPresent),
      String(s.lateDays),
      String(s.absentDays ?? ""),
      String(s.attendanceRate ?? ""),
    ]);
  }
  return lines.map((l) => l.map(csvCell).join(",")).join("\n");
}

export default function ReportsPage({
  role,
}: {
  role: Extract<Role, "admin" | "instructor">;
}) {
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [reportDate, setReportDate] = useState("");
  const [monthInput, setMonthInput] = useState(""); // yyyy-mm
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [report, setReport] = useState<ReportPayload>({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<StudentSummary | null>(null);
  const [personal, setPersonal] = useState<PersonalReport | null>(null);
  const [personalLoading, setPersonalLoading] = useState(false);

  const rows = Array.isArray(report.rows) ? report.rows : [];
  const students = Array.isArray(report.students) ? report.students : [];
  const days = Array.isArray(report.days) ? report.days : [];
  const monthGroups = Array.isArray(report.monthGroups)
    ? report.monthGroups
    : [];

  function buildParams(date = reportDate, selectedPeriod = period) {
    const params: Record<string, string> = { period: selectedPeriod };
    if (selectedPeriod === "monthly" && monthInput) {
      params.date = `${monthInput}-15`;
    } else if (date) {
      params.date = date;
    }
    if (selectedPeriod === "custom") {
      if (startInput) params.startDate = startInput;
      if (endInput) params.endDate = endInput;
    }
    return params;
  }

  async function load(date = reportDate, selectedPeriod = period) {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/${role}/reports/attendance`, {
        params: buildParams(date, selectedPeriod),
      });
      const payload = (response.data || {}) as ReportPayload;
      setReport(payload);
      if (payload.date) setReportDate(String(payload.date));
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("");
  }, [role]);

  function downloadCsv() {
    const content =
      period === "monthly" || period === "custom"
        ? matrixCsv(filteredStudents, days)
        : attendanceCsv(rows, period);
    const blob = new Blob([`\uFEFF${content}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ccd-attendance-${period}-${report.startDate || reportDate}-to-${report.endDate || ""}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPdf() {
    setDownloading(true);
    setError("");
    try {
      const response = await api.get(`/${role}/reports/attendance.pdf`, {
        params: buildParams(),
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ccd-attendance-${period}-${report.startDate || reportDate}-to-${report.endDate || ""}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setDownloading(false);
    }
  }

  async function openPersonal(student: StudentSummary) {
    setSelected(student);
    setPersonal(null);
    if (!student.studentId) {
      // fallback: build from matrix data already loaded
      return;
    }
    setPersonalLoading(true);
    try {
      const res = await api.get(
        `/${role}/reports/student/${student.studentId}`,
        {
          params: buildParams(),
        },
      );
      setPersonal(res.data as PersonalReport);
    } catch (e) {
      setError(message(e));
    } finally {
      setPersonalLoading(false);
    }
  }

  async function downloadPersonalPdf() {
    if (!selected?.studentId) return;
    setDownloading(true);
    try {
      const res = await api.get(
        `/${role}/reports/student/${selected.studentId}.pdf`,
        {
          params: buildParams(),
          responseType: "blob",
        },
      );
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ccd-student-${selected.registrationNumber}-${report.startDate}-to-${report.endDate}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(message(e));
    } finally {
      setDownloading(false);
    }
  }

  function downloadPersonalCsv() {
    const data = personal?.days || [];
    const header = ["Date", "Month", "Status", "Arrival", "Checkout"];
    const lines = [header];
    for (const d of data) {
      lines.push([
        d.date,
        d.month,
        d.status,
        d.arrivedAt ? attendanceTime(d.arrivedAt) : "",
        d.checkedOutAt ? attendanceTime(d.checkedOutAt) : "",
      ]);
    }
    const csv = lines.map((l) => l.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ccd-student-${selected?.registrationNumber || "report"}-${report.startDate}-to-${report.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function applySearch(event?: FormEvent) {
    event?.preventDefault();
    setSearchQuery(searchInput);
  }

  function changePeriod(next: ReportPeriod) {
    setPeriod(next);
    setSelected(null);
    setPersonal(null);
    void load(reportDate, next);
  }

  const rangeLabel =
    report.startDate && report.endDate && report.startDate !== report.endDate
      ? `${report.startDate} – ${report.endDate}`
      : reportDate || "Today";

  const tableSource: (AttendanceRow | StudentSummary)[] =
    period === "daily" ? rows : students;
  const visibleItems = tableSource.filter((item) =>
    matchesSearch(item, searchQuery, [
      "studentName",
      "membershipId",
      "registrationNumber",
      "email",
      "status",
    ]),
  );
  const filteredStudents = students.filter((item) =>
    matchesSearch(item, searchQuery, [
      "studentName",
      "membershipId",
      "registrationNumber",
      "email",
      "status",
    ]),
  );

  const dailyRows = (visibleItems as AttendanceRow[]).map((row) => ({
    ...row,
    arrivedAt: attendanceTime(String(row.arrivedAt || "")),
    checkedOutAt: row.checkedOutAt
      ? attendanceTime(row.checkedOutAt as string)
      : "—",
    status: attendanceStatusLabel(String(row.status || "")),
  }));

  const showMatrix = period === "monthly" || period === "custom";
  const emptyCopy =
    period === "weekly"
      ? "No student attendance was recorded for this week."
      : showMatrix
        ? "No attendance in this range. All students show Absent (—)."
        : "No student attendance was recorded for this date.";
  const heading =
    period === "weekly"
      ? "Weekly attendance"
      : period === "monthly"
        ? "Monthly attendance"
        : period === "custom"
          ? "Custom period attendance"
          : "Daily attendance";

  return (
    <main className="portal-content">
      <PageHeading
        eyebrow="ATTENDANCE RECORDS"
        title="Reports"
        description="Daily, weekly, monthly or custom-range reports. Monthly/custom show every day (P/L/E/—) with month names on top. Click a student for personal report."
        action={
          <div className="report-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={!(rows.length || students.length)}
              onClick={downloadCsv}
            >
              Download CSV
            </button>
            <button
              type="button"
              className="portal-primary"
              disabled={downloading}
              onClick={() => void downloadPdf()}
            >
              {downloading ? "Preparing PDF..." : "Download PDF"}
            </button>
          </div>
        }
      />
      <section className="content-card report-controls">
        <div
          className="report-period"
          role="tablist"
          aria-label="Report period"
        >
          {(["daily", "weekly", "monthly", "custom"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={period === item}
              className={period === item ? "is-active" : ""}
              onClick={() => changePeriod(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {period === "monthly" ? (
          <label>
            Month
            <input
              type="month"
              value={monthInput}
              onChange={(e) => setMonthInput(e.target.value)}
            />
          </label>
        ) : period === "custom" ? (
          <>
            <label>
              From
              <input
                type="date"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
              />
            </label>
          </>
        ) : (
          <label>
            {period === "weekly" ? "Any day in the week" : "Attendance date"}
            <input
              type="date"
              value={reportDate}
              onChange={(event) => setReportDate(event.target.value)}
            />
          </label>
        )}
        <button
          className="secondary-button"
          disabled={
            loading ||
            (period === "custom" && (!startInput || !endInput)) ||
            (period === "monthly" && !monthInput && !reportDate)
          }
          onClick={() => void load()}
        >
          {loading ? "Loading..." : "View report"}
        </button>
      </section>
      {error && <StatePanel kind="error">{error}</StatePanel>}
      {report.summary && (
        <section
          className="stat-grid report-summary"
          aria-label="Report summary"
        >
          <StatCard
            label="Students"
            value={`${report.summary.studentsPresent}/${report.summary.totalStudents ?? report.summary.studentsPresent}`}
            note={rangeLabel}
          />
          <StatCard
            label="Arrived early"
            value={report.summary.arrivedEarly}
            note="All arrivals before 09:30"
          />
          <StatCard
            label="Late"
            value={report.summary.late}
            note="All arrivals from 09:30"
          />
          <StatCard
            label="Checked out"
            value={report.summary.checkedOut}
            note="Recorded departures"
          />
        </section>
      )}
      <section className="content-card">
        <CardToolbar
          title={heading}
          meta={`${searchQuery ? `${visibleItems.length} of ${tableSource.length} students` : `${tableSource.length} students`} · ${rangeLabel}`}
          search={{
            value: searchInput,
            onChange: setSearchInput,
            onSubmit: () => applySearch(),
            placeholder: "Name, student ID, registration, email…",
            label: "Search attendance report",
          }}
          onRefresh={() => void load()}
        />
        {loading ? (
          <StatePanel kind="loading" />
        ) : showMatrix ? (
          filteredStudents.length ? (
            <div style={{ overflowX: "auto" }}>
              <table
                className="portal-table matrix-table"
                style={{ minWidth: Math.max(700, 220 + days.length * 52) }}
              >
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      style={{
                        minWidth: 170,
                        position: "sticky",
                        left: 0,
                        background: "var(--panel)",
                        zIndex: 2,
                      }}
                    >
                      Student
                    </th>
                    <th rowSpan={2} style={{ minWidth: 110 }}>
                      Student ID
                    </th>
                    {monthGroups.map((g) => (
                      <th
                        key={g.month}
                        colSpan={g.span}
                        style={{
                          textAlign: "center",
                          background: "#0b1520",
                          color: "#fff",
                        }}
                      >
                        {g.month}
                      </th>
                    ))}
                    <th rowSpan={2}>Tot</th>
                  </tr>
                  <tr>
                    {days.map((d) => (
                      <th
                        key={d.date}
                        title={`${d.date} · ${d.month}`}
                        style={{ minWidth: 48, textAlign: "center" }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 800 }}>
                          {d.dayNum}
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>
                          {d.label}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => (
                    <tr
                      key={(s.studentId as string) || s.registrationNumber}
                      onClick={() => void openPersonal(s)}
                      style={{ cursor: "pointer" }}
                      title="Click for personal report"
                    >
                      <td
                        style={{
                          position: "sticky",
                          left: 0,
                          background: "var(--panel)",
                          fontWeight: 600,
                        }}
                      >
                        {s.studentName}
                        <div
                          style={{
                            fontSize: 11,
                            opacity: 0.65,
                            fontWeight: 400,
                          }}
                        >
                          {(s.email as string) || ""}
                        </div>
                      </td>
                      <td>{s.membershipId || "—"}</td>
                      {days.map((d) => {
                        const v = s.daysByDate?.[d.date] || "—";
                        return (
                          <td
                            key={d.date}
                            title={`${d.date}: ${v}`}
                            style={{ textAlign: "center", ...cellStyle(v) }}
                          >
                            {cellShort(v)}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: "center", fontWeight: 700 }}>
                        {s.daysPresent}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                Legend: P = Present, L = Late, E = Excused, — = Absent. Click
                any row for full personal report.
              </p>
            </div>
          ) : (
            !error && (
              <StatePanel kind="empty">
                {tableSource.length
                  ? "No attendance records match this search."
                  : emptyCopy}
              </StatePanel>
            )
          )
        ) : visibleItems.length ? (
          <DataTable
            columns={
              period === "weekly"
                ? WEEKDAY_COLUMNS
                : [
                    { key: "studentName", label: "Student" },
                    { key: "membershipId", label: "Student ID" },
                    { key: "registrationNumber", label: "Registration no." },
                    { key: "arrivedAt", label: "Arrival time" },
                    { key: "checkedOutAt", label: "Checkout time" },
                    { key: "status", label: "Status" },
                  ]
            }
            items={period === "daily" ? dailyRows : visibleItems}
          />
        ) : (
          !error && (
            <StatePanel kind="empty">
              {tableSource.length
                ? "No attendance records match this search."
                : emptyCopy}
            </StatePanel>
          )
        )}
        {period === "weekly" && visibleItems.length > 0 && (
          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
            Click a student row to open personal report (same as monthly view).
          </p>
        )}
      </section>

      {selected && (
        <div
          className="portal-dialog-backdrop"
          onClick={() => {
            setSelected(null);
            setPersonal(null);
          }}
        >
          <div
            className="portal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 720,
              width: "92vw",
              maxHeight: "86vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 18px 0",
              }}
            >
              <h3 style={{ margin: 0 }}>
                Personal report — {selected.studentName}
              </h3>
              <button
                onClick={() => {
                  setSelected(null);
                  setPersonal(null);
                }}
                style={{
                  border: "1px solid var(--line)",
                  background: "var(--panel)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
            <div style={{ padding: 18 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                <div>
                  <b>Student ID:</b> {selected.membershipId || "—"}
                </div>
                <div>
                  <b>Registration:</b> {selected.registrationNumber}
                </div>
                <div>
                  <b>Email:</b>{" "}
                  {(selected.email as string) ||
                    (personal?.student?.email ?? "—")}
                </div>
                <div>
                  <b>Year:</b>{" "}
                  {String(
                    selected.yearOfStudy ??
                      personal?.student?.yearOfStudy ??
                      "—",
                  )}
                </div>
                <div>
                  <b>Range:</b> {report.startDate} → {report.endDate}
                </div>
                <div>
                  <b>Rate:</b>{" "}
                  {String(
                    selected.attendanceRate ??
                      personal?.summary?.attendanceRate ??
                      "—",
                  )}
                  %
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <span className="stat-chip">
                  Present:{" "}
                  {personal?.summary?.daysPresent ?? selected.daysPresent}
                </span>
                <span className="stat-chip">
                  Late: {personal?.summary?.lateDays ?? selected.lateDays}
                </span>
                <span className="stat-chip">
                  Absent:{" "}
                  {personal?.summary?.absentDays ?? selected.absentDays ?? "—"}
                </span>
                <span className="stat-chip">
                  Excused:{" "}
                  {personal?.summary?.excusedDays ?? selected.excusedDays ?? 0}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button
                  className="secondary-button"
                  onClick={downloadPersonalCsv}
                  disabled={!personal?.days?.length}
                >
                  Download CSV
                </button>
                <button
                  className="portal-primary"
                  onClick={() => void downloadPersonalPdf()}
                  disabled={downloading || !selected.studentId}
                >
                  {downloading ? "Preparing…" : "Download PDF"}
                </button>
              </div>
              {personalLoading ? (
                <StatePanel kind="loading" />
              ) : personal?.days ? (
                <div style={{ overflowX: "auto" }}>
                  <table className="portal-table" style={{ minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Month</th>
                        <th>Status</th>
                        <th>Arrival</th>
                        <th>Checkout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {personal.days.map((d) => (
                        <tr key={d.date}>
                          <td>{d.label}</td>
                          <td style={{ opacity: 0.7, fontSize: 12 }}>
                            {d.month}
                          </td>
                          <td>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: 999,
                                ...cellStyle(
                                  d.status === "Present"
                                    ? "Present"
                                    : d.status === "Late"
                                      ? "Late"
                                      : d.status === "Excused"
                                        ? "Excused"
                                        : "—",
                                ),
                              }}
                            >
                              {d.status}
                            </span>
                          </td>
                          <td>
                            {d.arrivedAt ? attendanceTime(d.arrivedAt) : "—"}
                          </td>
                          <td>
                            {d.checkedOutAt
                              ? attendanceTime(d.checkedOutAt)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ fontSize: 13, opacity: 0.7 }}>
                  Loading day-by-day breakdown…
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
