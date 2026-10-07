from datetime import date
from io import BytesIO
from unittest.mock import AsyncMock, Mock
from zipfile import ZipFile
from xml.etree import ElementTree as ET

import pytest

from app.services.excel_report_service import render_attendance_excel
from app.services.report_service import _report_window, parse_period
from tests.test_report_service import _empty_report


def test_excel_contains_months_totals_and_records_without_executable_formulas():
    report = _empty_report("all")
    report["days"] = [{"date": "2025-01-01"}, {"date": "2026-09-01"}]
    report["students"] = [{
        "studentName": '=HYPERLINK("https://example.com")',
        "registrationNumber": "000123", "membershipId": "CCD-001",
        "daysPresent": 1, "lateDays": 0,
        "daysByDate": {"2025-01-01": "Present", "2026-09-01": "Excused"},
    }]
    report["rows"] = [{
        "studentName": "Asha", "registrationNumber": "000123",
        "date": "2025-01-01", "day": "Wed", "status": "PRESENT",
        "arrivedAt": "2025-01-01T05:10:00+00:00", "checkedOutAt": None,
    }]
    with ZipFile(BytesIO(render_attendance_excel(report))) as archive:
        ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        assert [s.attrib["name"] for s in workbook.findall("s:sheets/s:sheet", ns)] == [
            "Summary", "2025-01", "2026-09", "Student totals", "Records",
        ]
        strings = archive.read("xl/sharedStrings.xml").decode()
        assert "000123" in strings
        assert "08:10" in strings
        assert "Excused" in strings
        assert "HYPERLINK" in strings
        for name in archive.namelist():
            if name.startswith("xl/worksheets/"):
                root = ET.fromstring(archive.read(name))
                assert not root.findall(".//s:f", ns)
                assert root.find("s:sheetViews/s:sheetView/s:pane", ns) is not None


@pytest.mark.asyncio
async def test_full_history_is_not_limited_to_custom_range():
    db = AsyncMock()
    db.execute.return_value = Mock()
    db.execute.return_value.one.return_value = (date(2024, 1, 1), date(2026, 10, 7))
    assert parse_period("all") == "all"
    start, end, _ = await _report_window(db, "all", date(2026, 10, 7))
    assert start == date(2024, 1, 1)
    assert end == date(2026, 10, 7)


@pytest.mark.asyncio
async def test_full_history_handles_no_sessions():
    db = AsyncMock()
    db.execute.return_value = Mock()
    db.execute.return_value.one.return_value = (None, None)
    start, end, _ = await _report_window(db, "all", date(2026, 10, 7))
    assert start == end == date(2026, 10, 7)
    assert render_attendance_excel(_empty_report("all")).startswith(b"PK")
