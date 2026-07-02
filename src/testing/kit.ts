import { createApiKit, type ApiKit, type ApiKitOptions } from "../kit";

import { silentLogger } from "./logger";

/**
 * Build an `ApiKit` wired for tests: silent logger and `service: "test"` by
 * default. Any option can be overridden (pass your own `logger` to assert on
 * logs, e.g. `spyLogger()`).
 */
export function createTestKit(overrides: Partial<ApiKitOptions> = {}): ApiKit {
  return createApiKit({
    service: "test",
    environment: "test",
    logger: silentLogger(),
    ...overrides,
  });
}
