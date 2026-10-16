import { test } from "node:test";
import assert from "node:assert/strict";
import { makeLock, openLock, seal, unseal, isSealed, isLock, toB64, fromB64 } from "../src/vault.js";

// Few iterations keep the tests fast; the app uses KDF_ITERATIONS.
const FAST = 1000;

test("the right password opens a lock, a wrong one doesn't", async () => {
  const { lock } = await makeLock("correct horse", FAST);
  assert.ok(isLock(lock));
  assert.ok(await openLock(lock, "correct horse"));
  assert.equal(await openLock(lock, "Correct horse"), null);
  assert.equal(await openLock(lock, ""), null);
});

test("sealed data round-trips and hides its contents", async () => {
  const { key, lock } = await makeLock("pw123456", FAST);
  const value = { levels: { "newHome.stacking-technique": 1 }, labLevel: 3, note: "ünïcödé" };
  const sealed = await seal(key, value);
  assert.ok(isSealed(sealed));
  assert.ok(!JSON.stringify(sealed).includes("stacking"));
  assert.deepEqual(await unseal(key, sealed), value);
  // A key from the same password opens it again; another password's key doesn't.
  assert.deepEqual(await unseal(await openLock(lock, "pw123456"), sealed), value);
  const other = await makeLock("different", FAST);
  await assert.rejects(unseal(other.key, sealed));
});

test("tampered data is rejected", async () => {
  const { key } = await makeLock("pw123456", FAST);
  const sealed = await seal(key, { a: 1 });
  const bytes = fromB64(sealed.ct);
  bytes[0] ^= 1;
  await assert.rejects(unseal(key, { ...sealed, ct: toB64(bytes) }));
});

test("each save uses a fresh IV", async () => {
  const { key } = await makeLock("pw123456", FAST);
  const a = await seal(key, { x: 1 });
  const b = await seal(key, { x: 1 });
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

test("large saves encode without blowing the stack", async () => {
  const { key } = await makeLock("pw123456", FAST);
  const big = { events: Array.from({ length: 5000 }, (_, i) => ["newHome.wind-power", 1, i, i, 1.5]) };
  assert.deepEqual(await unseal(key, await seal(key, big)), big);
});
