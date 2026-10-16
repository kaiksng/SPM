import { vi, type Mock } from "vitest";

type QueryResult = { data: unknown; error: unknown };

const CHAIN_METHODS = [
  "select",
  "eq",
  "neq",
  "in",
  "is",
  "lt",
  "lte",
  "gt",
  "gte",
  "order",
  "limit",
  "filter",
  "match",
] as const;

type ChainMethod = (typeof CHAIN_METHODS)[number];

export type QueryBuilderMock = Record<ChainMethod | "maybeSingle" | "single", Mock> &
  PromiseLike<QueryResult>;

/**
 * A fake supabase-js query builder: every filter method returns the same
 * builder (so `.from().select().eq().in()` chains work in any order), and
 * the chain resolves to `result` whether it is awaited directly or ended
 * with `.maybeSingle()` / `.single()`. Each method is a vi.fn, so a test
 * can assert on the filters a service applied.
 *
 * Usage:
 *   const query = queryBuilder({ data: [...], error: null });
 *   supabaseMock.from.mockReturnValue(query);
 *   ...
 *   expect(query.eq).toHaveBeenCalledWith("venue_id", "venue-1");
 */
export function queryBuilder(result: QueryResult): QueryBuilderMock {
  const builder: Record<string, unknown> = {
    then: (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
  };

  for (const method of CHAIN_METHODS) {
    builder[method] = vi.fn(() => builder);
  }

  return builder as QueryBuilderMock;
}
