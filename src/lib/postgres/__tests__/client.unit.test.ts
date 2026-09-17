const postgresMock = jest.fn();
jest.mock("postgres", () => ({ __esModule: true, default: postgresMock }));

import { closePostgresClient, createPostgresClient, getSharedPostgresClient } from "../client";

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
    debug: expect.any(Function),
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

describe("getSharedPostgresClient", () => {
  const registryKey = Symbol.for("distil.postgres.clients");
  const clearRegistry = () => {
    delete (globalThis as Record<symbol, unknown>)[registryKey];
  };

  beforeEach(clearRegistry);
  afterAll(clearRegistry);

  it("memoises one client per URL and keeps different URLs apart", () => {
    postgresMock.mockImplementation(() => ({ end: jest.fn() }));

    const runtime = getSharedPostgresClient("postgres://runtime");
    expect(getSharedPostgresClient("postgres://runtime")).toBe(runtime);
    expect(getSharedPostgresClient("postgres://runtime", { max: 1 })).toBe(runtime);
    expect(postgresMock).toHaveBeenCalledTimes(1);

    const controlPlane = getSharedPostgresClient("postgres://control-plane", { max: 1 });
    expect(controlPlane).not.toBe(runtime);
    expect(getSharedPostgresClient("postgres://control-plane")).toBe(controlPlane);
    expect(postgresMock).toHaveBeenCalledTimes(2);
    expect(postgresMock).toHaveBeenLastCalledWith(
      "postgres://control-plane",
      expect.objectContaining({ max: 1 })
    );
  });

  it("survives a module reload because the registry lives on globalThis", async () => {
    postgresMock.mockImplementation(() => ({ end: jest.fn() }));
    const before = getSharedPostgresClient("postgres://reload");

    jest.resetModules();
    jest.doMock("postgres", () => ({ __esModule: true, default: postgresMock }));
    const reloaded: typeof import("../client") = await import("../client");

    expect(reloaded.getSharedPostgresClient).not.toBe(getSharedPostgresClient);
    expect(reloaded.getSharedPostgresClient("postgres://reload")).toBe(before);
    expect(postgresMock).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty URL without echoing configuration", () => {
    expect(() => getSharedPostgresClient("")).toThrow("DATABASE_URL is required");
    expect(postgresMock).not.toHaveBeenCalled();
  });
});
