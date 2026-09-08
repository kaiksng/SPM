import { vi } from "vitest";

import "@testing-library/jest-dom/vitest";

// Next.js aliases the real "server-only" package to a no-op for server
// bundles at build time; it always throws when actually executed (that's
// how it flags accidental client bundling). Outside Next's bundler (i.e.
// under Vitest), stub it out so server-only modules stay importable in tests.
vi.mock("server-only", () => ({}));
