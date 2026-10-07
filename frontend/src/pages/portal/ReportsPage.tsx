import { useEffect, useState, type FormEvent } from "react";
import {
  CardToolbar,
  PageHeading,
  StatePanel,
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

export default function ReportsPage({
  role,
}: {
  role: Extract<Role, "admin" | "instructor">;
}) {
  const period: ReportPeriod = "monthly";
  const [reportDate, setReportDate] = useState("");
  const [monthInput, setMonthInput] = useState(""); // yyyy-mm
  const [report, setReport] = useState<ReportPayload>({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const students = Array.isArray(report.students) ? report.students : [];
  function buildParams(date = reportDate) {
    const params: Record<string, string> = { period: "monthly" };
    if (monthInput) {
      params.date = `${monthInput}-15`;
    } else if (date) {
      params.date = date;
    }
    return params;
  }

  async function load(date = reportDate) {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/${role}/reports/attendance`, {
        params: buildParams(date),
      });
      const payload = (response.data || {}) as ReportPayload;
      setReport(payload);
      if (payload.date) {
        setReportDate(String(payload.date));
        setMonthInput(String(payload.date).slice(0, 7));
      }
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("");
  }, [role]);

  async function downloadExcel(allDays = false) {
    setDownloading(true);
    setError("");
    try {
      const response = await api.get(`/${role}/reports/attendance.xlsx`, {
        params: allDays ? { period: "all" } : { period: "monthly", date: report.date || reportDate },
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = allDays
        ? "ccd-attendance-all-days.xlsx"
        : `ccd-attendance-${report.startDate}-to-${report.endDate}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setDownloading(false);
    }
  }

  async function downloadPdf() {
    setDownloading(true);
    setError("");
    try {
      const response = await api.get(`/${role}/reports/attendance.pdf`, {
        params: { period: "monthly", date: report.date || reportDate },
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

  async function downloadStudentPdf(student: StudentSummary) {
    if (!student.studentId) return;
    setDownloading(true);
    setError("");
    try {
      const response = await api.get(`/${role}/reports/student/${student.studentId}.pdf`, {
        params: { period: "monthly", date: report.date || reportDate },
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ccd-student-${student.registrationNumber}-${report.startDate}-to-${report.endDate}.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setDownloading(false);
    }
  }

  function applySearch(event?: FormEvent) {
    event?.preventDefault();
    setSearchQuery(searchInput);
  }

  const rangeLabel =
    report.startDate && report.endDate && report.startDate !== report.endDate
      ? `${report.startDate} – ${report.endDate}`
      : reportDate || "Today";

  const filteredStudents = students.filter((item) =>
    matchesSearch(item, searchQuery, [
      "studentName",
      "membershipId",
      "registrationNumber",
      "email",
      "status",
    ]),
  );

  const emptyCopy = "No students available for this report.";

  return (
    <main className="portal-content reports-page">
      <PageHeading
        eyebrow="ATTENDANCE RECORDS"
        title="Reports"
        description="Preview your students below. Download a report for daily attendance, arrival times and attendance percentages."
      />
      <section className="report-download-panel" aria-label="Report downloads">
        <div className="content-card report-download-main">
          <div className="report-panel-heading">
            <span className="report-section-label">SELECTED PERIOD</span>
            <h2>Monthly report</h2>
            <p>Choose your reporting month and download as Excel or PDF.</p>
          </div>
          <form className="report-controls" onSubmit={(event) => { event.preventDefault(); void load(); }}>
            <label>
              Report month
              <input type="month" value={monthInput} onChange={(event) => setMonthInput(event.target.value)} />
            </label>
            <button type="submit" className="secondary-button" disabled={loading || !monthInput}>
              {loading ? "Loading..." : "Apply month"}
            </button>
          </form>
          <div className="report-download-footer">
            <p><span className="report-range-label">Report covers</span>{report.startDate ? rangeLabel : "Loading report…"}</p>
            <div className="report-actions" aria-label="Monthly downloads">
              <button type="button" className="portal-primary" disabled={downloading || loading || !report.date} onClick={() => void downloadExcel()}>Export Excel</button>
              <button type="button" className="secondary-button" disabled={downloading || loading || !report.date} onClick={() => void downloadPdf()}>Download PDF</button>
            </div>
          </div>
        </div>
        <div className="content-card report-download-history">
          <span className="report-history-label">COMPLETE HISTORY</span>
          <h2>All days, one download</h2>
          <p>Download the complete attendance history in one Excel workbook.</p>
          <ul className="report-includes" aria-label="Included in the full report"><li>All months</li><li>Student totals</li><li>Attendance %</li></ul>
          <button type="button" className="secondary-button" disabled={downloading} onClick={() => void downloadExcel(true)}>Export all days (Excel)</button>
        </div>
      </section>
      {downloading && <p className="report-download-status" role="status">Preparing your download…</p>}
      {error && <StatePanel kind="error">{error}</StatePanel>}
      <section className="content-card">
        <CardToolbar
          title="Student preview"
          meta={`${searchQuery ? `${filteredStudents.length} of ${students.length} students` : `${students.length} students`} · ${rangeLabel}`}
          search={{
            value: searchInput,
            onChange: setSearchInput,
            onSubmit: () => applySearch(),
            placeholder: "Search students…",
            label: "Search attendance report",
          }}
          onRefresh={() => void load()}
        />
        {loading ? (
          <StatePanel kind="loading" />
        ) : filteredStudents.length ? (
          <div className="report-student-list">
            <table className="portal-table report-student-table">
              <thead>
                <tr><th>Student</th><th>Student ID</th><th>Registration number</th><th>Report</th></tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.studentId || student.registrationNumber}>
                    <td><span className="report-student-name">{student.studentName}</span><span className="report-student-email">{student.email || "—"}</span></td>
                    <td>{student.membershipId || "—"}</td>
                    <td>{student.registrationNumber}</td>
                    <td><button type="button" className="secondary-button" disabled={downloading || !student.studentId} aria-label={`Download PDF for ${student.studentName}`} onClick={() => void downloadStudentPdf(student)}>Download PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="report-preview-note">Student list preview only. Downloads include the full attendance details and percentages for the selected period.</p>
          </div>
        ) : (
          !error && (
            <StatePanel kind="empty">
              {students.length
                ? "No attendance records match this search."
                : emptyCopy}
            </StatePanel>
          )
        )}
      </section>

    </main>
  );
}
