import assert from "node:assert/strict";
import test from "node:test";

import { withSingleRetry } from "../../src/features/cvs/render-retry.ts";

test("PDF rendering retries one transient failure and returns the second result", async () => {
  let attempts = 0;
  const result = await withSingleRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient");
      return "rendered";
    },
    () => true,
  );

  assert.equal(result, "rendered");
  assert.equal(attempts, 2);
});

test("PDF rendering does not retry permanent failures or exceed two attempts", async () => {
  let permanentAttempts = 0;
  await assert.rejects(
    withSingleRetry(
      async () => {
        permanentAttempts += 1;
        throw new Error("permanent");
      },
      () => false,
    ),
    /permanent/,
  );
  assert.equal(permanentAttempts, 1);

  let transientAttempts = 0;
  await assert.rejects(
    withSingleRetry(
      async () => {
        transientAttempts += 1;
        throw new Error(`transient-${transientAttempts}`);
      },
      () => true,
    ),
    /transient-2/,
  );
  assert.equal(transientAttempts, 2);
});
