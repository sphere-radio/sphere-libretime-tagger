import { describe, expect, it } from "vitest";
import { planTrim } from "../src/domain/trim";

describe("planTrim", () => {
  it("cuts leading and trailing silence and keeps a little padding", () => {
    const plan = planTrim(100, [{ start: 0, end: 10 }, { start: 90, end: 100 }]);
    expect(plan.window).toEqual({ start: 9.75, end: 90.25 });
    expect(plan.outcome).toEqual({ kind: "trimmed", startSeconds: 9.75, endSeconds: 9.75 });
  });

  it("can trim only one end", () => {
    expect(planTrim(100, [{ start: 90, end: 100 }]).window).toEqual({ start: 0, end: 90.25 });
  });

  it("leaves pauses inside the recording alone", () => {
    expect(planTrim(100, [{ start: 40, end: 45 }])).toEqual({ outcome: { kind: "none" }, window: null });
  });

  it("does nothing when the edge silence is shorter than the padding", () => {
    expect(planTrim(100, [{ start: 0, end: 0.2 }]).window).toBeNull();
  });

  it("skips audio that is silent from start to end", () => {
    expect(planTrim(100, [{ start: 0, end: 100 }])).toEqual({ outcome: { kind: "skipped", reason: "too-quiet" }, window: null });
  });

  it("skips a trim that would remove more than half", () => {
    const plan = planTrim(100, [{ start: 0, end: 30 }, { start: 60, end: 100 }]);
    expect(plan).toEqual({ outcome: { kind: "skipped", reason: "too-much" }, window: null });
  });
});
