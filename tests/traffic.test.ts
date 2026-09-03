import assert from "node:assert/strict";
import test from "node:test";
import { hardersCapacity, vehiclesAcceptedInGap } from "../lib/traffic.ts";

test("counts minor-stream vehicles that fit in each conflicting-stream gap", () => {
  assert.equal(vehiclesAcceptedInGap(6.499, 6.5, 3.5), 0);
  assert.equal(vehiclesAcceptedInGap(6.5, 6.5, 3.5), 1);
  assert.equal(vehiclesAcceptedInGap(9.999, 6.5, 3.5), 1);
  assert.equal(vehiclesAcceptedInGap(10, 6.5, 3.5), 2);
  assert.equal(vehiclesAcceptedInGap(13.5, 6.5, 3.5), 3);
});

test("implements the supplied Harders capacity equation", () => {
  assert.ok(Math.abs(hardersCapacity(500, 6.5, 3.5) - 526.566299990392) < 1e-9);
});

test("rejects nonpositive traffic-engineering inputs", () => {
  assert.throws(() => hardersCapacity(0, 6.5, 3.5), RangeError);
  assert.throws(() => vehiclesAcceptedInGap(10, -1, 3.5), RangeError);
  assert.throws(() => vehiclesAcceptedInGap(10, 6.5, 0), RangeError);
});
