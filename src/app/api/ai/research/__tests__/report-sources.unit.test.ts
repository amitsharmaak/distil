const requireTenantRoute = jest.fn();
jest.mock("@/lib/auth/tenant-route", () => ({
  requireTenantRoute: (...args: unknown[]) => requireTenantRoute(...args),
  tenantRouteFailureResponse: () => Response.json({ error: "auth" }, { status: 401 }),
}));

import { GET as getReport } from "../[id]/route";
import { GET as listReports } from "../list/route";

const citedSources = [
  { id: 1, url: "https://who.int/r", title: "WHO report", domain: "who.int", grounded: true },
  { id: 2, url: "https://nih.gov/a", title: "nih.gov", domain: "nih.gov", grounded: false },
];

function record(id: string, sources: unknown) {
  return {
    id,
    query: "q",
    report: "Claim [1][2].",
    sources: JSON.stringify(sources),
    model: "m",
    status: "completed",
    createdAt: "2026-09-30T10:00:00.000Z",
    completedAt: "2026-09-30T10:05:00.000Z",
    progress: null,
  };
}

const repositories = {
  research: { findReport: jest.fn(), listReports: jest.fn() },
};

beforeEach(() => {
  jest.clearAllMocks();
  requireTenantRoute.mockResolvedValue({ context: {}, repositories });
});

it("passes stored source objects through the report route unchanged", async () => {
  repositories.research.findReport.mockResolvedValue(record("r1", citedSources));
  const response = await getReport(new Request("http://localhost/api/ai/research/r1"), {
    params: Promise.resolve({ id: "r1" }),
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.report.sources).toEqual(citedSources);
  expect(body.report.report).toBe("Claim [1][2].");
});

it("passes object and legacy string sources through the list route", async () => {
  repositories.research.listReports.mockResolvedValue([
    record("r1", citedSources),
    record("r0", ["https://legacy.example/a"]),
  ]);
  const response = await listReports(new Request("http://localhost/api/ai/research/list"));
  const body = await response.json();
  expect(body.reports.map((report: { sources: unknown }) => report.sources)).toEqual([
    citedSources,
    ["https://legacy.example/a"],
  ]);
});
