const postgresMock = jest.fn();
jest.mock("postgres", () => ({ __esModule: true, default: postgresMock }));

import { closePostgresClient, createPostgresClient } from "../client";

const originalUrl = process.env.DATABASE_URL;

afterEach(() => {
  jest.clearAllMocks();
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
});

it("requires a configured database URL", () => {
  delete process.env.DATABASE_URL;
  expect(() => createPostgresClient()).toThrow("DATABASE_URL is required");
});

it("creates a transaction-pooler-safe client with defaults", () => {
  process.env.DATABASE_URL = "postgres://runtime";
  const sql = { end: jest.fn() };
  postgresMock.mockReturnValue(sql);

  expect(createPostgresClient()).toBe(sql);
  expect(postgresMock).toHaveBeenCalledWith("postgres://runtime", {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
});

it("honours explicit URL and pool sizing and closes gracefully", async () => {
  const sql = { end: jest.fn().mockResolvedValue(undefined) };
  postgresMock.mockReturnValue(sql);
  expect(createPostgresClient({ url: "postgres://migration", max: 1, idleTimeoutSeconds: 7 })).toBe(
    sql
  );
  expect(postgresMock).toHaveBeenCalledWith(
    "postgres://migration",
    expect.objectContaining({ max: 1, idle_timeout: 7 })
  );

  await closePostgresClient(sql as never);
  expect(sql.end).toHaveBeenCalledWith({ timeout: 5 });
});
