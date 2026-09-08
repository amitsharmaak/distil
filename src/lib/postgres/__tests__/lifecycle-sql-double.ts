import type { Sql } from "postgres";

export interface CapturedSql {
  text: string;
  values: unknown[];
}

export function createLifecycleSqlDouble() {
  const scripted: unknown[][] = [];
  const scriptedUnsafe: unknown[][] = [];
  const queries: CapturedSql[] = [];
  const unsafeQueries: CapturedSql[] = [];

  const tagged = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings
      .reduce(
        (result, part, index) => `${result}${part}${index < values.length ? `$${index + 1}` : ""}`,
        ""
      )
      .replace(/\s+/gu, " ")
      .trim();
    queries.push({ text, values });
    if (scripted.length === 0) throw new Error(`Unscripted SQL query: ${text}`);
    return Promise.resolve(scripted.shift());
  };

  const sql = tagged as unknown as Sql;
  sql.unsafe = jest.fn((text: string, values: unknown[] = []) => {
    unsafeQueries.push({ text: text.replace(/\s+/gu, " ").trim(), values });
    return Promise.resolve(scriptedUnsafe.length > 0 ? scriptedUnsafe.shift() : []);
  }) as never;
  sql.json = jest.fn((value: unknown) => ({ encodedJson: value })) as never;
  sql.begin = jest.fn(async (callback: (transaction: Sql) => unknown) => callback(sql)) as never;

  return {
    sql,
    queries,
    unsafeQueries,
    respond(...rows: unknown[][]) {
      scripted.push(...rows);
    },
    respondUnsafe(...rows: unknown[][]) {
      scriptedUnsafe.push(...rows);
    },
    assertExhausted() {
      expect(scripted).toHaveLength(0);
      expect(scriptedUnsafe).toHaveLength(0);
    },
  };
}
