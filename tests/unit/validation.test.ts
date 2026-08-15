import assert from "node:assert/strict";
import test from "node:test";

import { isUuid } from "../../src/lib/validation.ts";

test("accepts canonical UUIDs and rejects malformed 36-character identifiers", () => {
  assert.equal(isUuid("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isUuid("00000000-0000-0000-0000-000000000000"), false);
  assert.equal(isUuid("------------------------------------"), false);
  assert.equal(isUuid("111111111111411181111111111111111111"), false);
});
