import { assertEquals } from "std-assert";
import {
  isHealthProbeMethod,
  shouldNotifyMissingSignature,
} from "./request-guards.ts";

Deno.test("stripe-webhook request guards - health probe methods", () => {
  assertEquals(isHealthProbeMethod("GET"), true);
  assertEquals(isHealthProbeMethod("HEAD"), true);
  assertEquals(isHealthProbeMethod("POST"), false);
});

Deno.test("stripe-webhook request guards - missing signature alert is opt-in", () => {
  assertEquals(shouldNotifyMissingSignature(undefined), false);
  assertEquals(shouldNotifyMissingSignature("false"), false);
  assertEquals(shouldNotifyMissingSignature("true"), true);
});
