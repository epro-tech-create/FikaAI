"""Excel attendance downloads, using the same data as the report screen."""

from datetime import datetime
from io import BytesIO

from xlsxwriter import Workbook

from app.services.report_service import _format_time, status_label


def render_attendance_excel(report: dict) -> bytes:
    output = BytesIO()
    with Workbook(output, {"in_memory": True, "strings_to_formulas": False,
                           "strings_to_urls": False}) as workbook:
        percentage = workbook.add_format({"num_format": '0.0"%"'})
        header = workbook.add_format({"bold": True, "bg_color": "#DBEAFE", "text_wrap": True})

        def sheet(name, columns, rows, freeze_columns=0):
            page = workbook.add_worksheet(name)
            page.write_row(0, 0, columns, header)
            for index, row in enumerate(rows, 1):
                page.write_row(index, 0, row)
            page.freeze_panes(1, freeze_columns)
            page.autofilter(0, 0, len(rows), len(columns) - 1)
            page.set_column(0, len(columns) - 1, 18)
            page.set_column(0, 0, 30)
            page.set_row(0, 32)
            return page

        sheet("Summary", ["Report", "Value"], [
            ["Title", report["title"]],
            ["Start date", report["startDate"]],
            ["End date", report["endDate"]],
            ["Timezone", report["timezone"]],
            *[[key, value] for key, value in report["summary"].items()],
            ["Legend", "Present / Late / Excused / — = Absent"],
            ["Attendance %", "Days present (including late arrivals) / calendar days in the report × 100"],
        ]).set_column(1, 1, 65)

        students = report.get("students", [])
        days = report.get("days", [])
        # Monthly sheets keep an unlimited history readable and below Excel's column limit.
        months = {}
        for day in days:
            months.setdefault(day["date"][:7], []).append(day["date"])
        for month, dates in months.items():
            sheet(month, ["Student name", "Student ID", "Registration number", "Email", *dates, "Days present (month)", "Attendance % (month)"], [
                [s["studentName"], s.get("membershipId") or "", s["registrationNumber"],
                 s.get("email") or "", *[s.get("daysByDate", {}).get(d, "—") for d in dates],
                 sum(s.get("daysByDate", {}).get(d) in ("Present", "Late") for d in dates),
                 round(sum(s.get("daysByDate", {}).get(d) in ("Present", "Late") for d in dates) / len(dates) * 100, 1)]
                for s in students
            ], 4).set_column(5 + len(dates), 5 + len(dates), 20, percentage)
        sheet("Student totals", ["Student name", "Student ID", "Registration number", "Days present", "Late days", "Excused days", "Absent days", "Attendance rate %"], [
            [s["studentName"], s.get("membershipId") or "", s["registrationNumber"],
             *[s.get(key, 0) for key in ("daysPresent", "lateDays", "excusedDays", "absentDays", "attendanceRate")]]
            for s in students
        ], 3).set_column(7, 7, 20, percentage)

        def local_time(value):
            return _format_time(datetime.fromisoformat(value)) if value else ""

        records = report.get("rows", [])
        # Leave one row for headers and split very large histories across worksheets.
        for offset in range(0, max(1, len(records)), 1_048_575):
            sheet("Records" if offset == 0 else f"Records {offset // 1_048_575 + 1}",
                  ["Student name", "Student ID", "Registration number", "Date", "Day", "Arrival time", "Checkout time", "Status"], [
                      [r["studentName"], r.get("membershipId") or "", r["registrationNumber"],
                       r.get("date", ""), r.get("day", ""), local_time(r.get("arrivedAt")),
                       local_time(r.get("checkedOutAt")), status_label(r["status"])]
                      for r in records[offset:offset + 1_048_575]
                  ], 3)
    return output.getvalue()
