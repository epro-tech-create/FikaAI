import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReportsPage from "./ReportsPage";

describe("report download options", () => {
  it.each(["admin", "instructor"] as const)("offers PDF and Excel reports for %s", (role) => {
    const html = renderToStaticMarkup(createElement(ReportsPage, { role }));
    expect(html).toContain("Download PDF");
    expect(html).toContain("Download Excel");
    expect(html).toContain("Export all days (PDF)");
    expect(html).toContain("Export all days (Excel)");
    expect(html).not.toContain("CSV");
    expect(html).toContain("Student preview");
  });
});
