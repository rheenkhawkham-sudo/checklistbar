import { defineMcp } from "@lovable.dev/mcp-js";
import listReports from "./tools/list-reports";
import getReport from "./tools/get-report";
import listOutlets from "./tools/list-outlets";

export default defineMcp({
  name: "bar-checklist-mcp",
  title: "Bar Checklist MCP",
  version: "0.1.0",
  instructions:
    "Read-only access to the bar checklist app. Use list_outlets to discover outlet names, list_reports to browse submitted daily/weekly checklists (filter by outlet or date range), and get_report to fetch a single report with all tasks.",
  tools: [listReports, getReport, listOutlets],
});
