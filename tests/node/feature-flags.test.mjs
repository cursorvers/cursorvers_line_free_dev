import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePlanMode,
  canDispatchToManus,
  normalizeBoolean,
  resolveFeatureFlags,
} from "../../scripts/lib/feature-flags.js";

test("resolvePlanMode returns normal when flags allow Manus", () => {
  const mode = resolvePlanMode({
    manusEnabled: "true",
    degradedMode: "false",
    degradedFlagPresent: false,
  });
  assert.equal(mode, "normal");
});

test("resolvePlanMode respects MANUS_ENABLED=false", () => {
  const mode = resolvePlanMode({
    manusEnabled: "false",
    degradedMode: "false",
    degradedFlagPresent: false,
  });
  assert.equal(mode, "degraded");
});

test("resolvePlanMode respects DEGRADED_MODE=true", () => {
  const mode = resolvePlanMode({
    manusEnabled: "true",
    degradedMode: "true",
    degradedFlagPresent: false,
  });
  assert.equal(mode, "degraded");
});

test("resolvePlanMode handles degraded flag presence", () => {
  const mode = resolvePlanMode({
    manusEnabled: "true",
    degradedMode: "false",
    degradedFlagPresent: true,
  });
  assert.equal(mode, "degraded");
});

test("canDispatchToManus only when development and Manus enabled with normal mode", () => {
  const allowed = canDispatchToManus({
    developmentMode: "true",
    manusEnabled: "true",
    planMode: "normal",
  });
  assert.equal(allowed, true);

  const blockedByMode = canDispatchToManus({
    developmentMode: "true",
    manusEnabled: "true",
    planMode: "degraded",
  });
  assert.equal(blockedByMode, false);

  const blockedByFlag = canDispatchToManus({
    developmentMode: "false",
    manusEnabled: "true",
    planMode: "normal",
  });
  assert.equal(blockedByFlag, false);
});

test("normalizeBoolean converts truthy values (string and boolean)", () => {
  assert.equal(normalizeBoolean("true"), true);
  assert.equal(normalizeBoolean("YES"), true);
  assert.equal(normalizeBoolean(1), true);
});

test("normalizeBoolean converts falsy values", () => {
  assert.equal(normalizeBoolean("false"), false);
  assert.equal(normalizeBoolean("0"), false);
  assert.equal(normalizeBoolean("No"), false);
});

test("normalizeBoolean falls back to default when value is unknown", () => {
  assert.equal(normalizeBoolean("maybe", false), false);
  assert.equal(normalizeBoolean("maybe", true), true);
  assert.equal(normalizeBoolean(undefined, true), true);
});

test("resolveFeatureFlags derives plan mode and dispatch allowance", () => {
  const flags = resolveFeatureFlags({
    MANUS_ENABLED: "true",
    DEGRADED_MODE: "false",
    DEVELOPMENT_MODE: "true",
  });
  assert.equal(flags.planMode, "normal");
  assert.equal(flags.canDispatch, true);

  const degraded = resolveFeatureFlags(
    {
      MANUS_ENABLED: "true",
      DEGRADED_MODE: "false",
      DEVELOPMENT_MODE: "true",
    },
    { degradedFlagPresent: true },
  );
  assert.equal(degraded.planMode, "degraded");
  assert.equal(degraded.canDispatch, false);
});
