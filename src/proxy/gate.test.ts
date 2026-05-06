import { describe, expect, test } from "vitest";
import { Gate } from "./gate.js";

describe("Gate", () => {
  test("starts disabled", () => {
    const gate = new Gate();
    expect(gate.isEnabled()).toBe(false);
  });

  test("can be enabled and disabled", () => {
    const gate = new Gate();
    gate.enable();
    expect(gate.isEnabled()).toBe(true);
    gate.disable();
    expect(gate.isEnabled()).toBe(false);
  });

  test("hold() resolves immediately when gate is disabled", async () => {
    const gate = new Gate();
    const body = { model: "x" };
    const result = await gate.hold("req-1", body);
    expect(result.decision).toBe("approve");
    expect(result.body).toEqual(body);
  });

  test("hold() suspends until approve() is called", async () => {
    const gate = new Gate();
    gate.enable();
    let resolved = false;
    const promise = gate.hold("req-1", { model: "x" }).then((r) => {
      resolved = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(resolved).toBe(false);

    gate.approve("req-1");
    const result = await promise;
    expect(result.decision).toBe("approve");
    expect(result.body).toEqual({ model: "x" });
  });

  test("approve() with edited body returns the edited body", async () => {
    const gate = new Gate();
    gate.enable();
    const original = { model: "x", marker: 1 };
    const edited = { model: "x", marker: 2 };

    const promise = gate.hold("req-1", original);
    gate.approve("req-1", edited);
    const result = await promise;

    expect(result.decision).toBe("approve");
    expect(result.body).toEqual(edited);
  });

  test("cancel() resolves with cancel decision", async () => {
    const gate = new Gate();
    gate.enable();
    const promise = gate.hold("req-1", { model: "x" });
    gate.cancel("req-1");
    const result = await promise;
    expect(result.decision).toBe("cancel");
  });

  test("approve/cancel for unknown requestId is a no-op (does not throw)", () => {
    const gate = new Gate();
    expect(() => gate.approve("ghost")).not.toThrow();
    expect(() => gate.cancel("ghost")).not.toThrow();
  });

  test("queues multiple held requests; only one is current at a time", async () => {
    const gate = new Gate();
    gate.enable();

    const p1 = gate.hold("req-1", { n: 1 });
    const p2 = gate.hold("req-2", { n: 2 });

    expect(gate.currentHeldId()).toBe("req-1");
    expect(gate.queueLength()).toBe(2);

    gate.approve("req-1");
    await p1;

    expect(gate.currentHeldId()).toBe("req-2");
    expect(gate.queueLength()).toBe(1);

    gate.approve("req-2");
    await p2;

    expect(gate.currentHeldId()).toBeNull();
    expect(gate.queueLength()).toBe(0);
  });

  test("disabling the gate releases all held requests as approve and returns their ids", async () => {
    const gate = new Gate();
    gate.enable();

    const p1 = gate.hold("req-1", { n: 1 });
    const p2 = gate.hold("req-2", { n: 2 });

    const releasedIds = gate.disable();

    expect(releasedIds).toEqual(["req-1", "req-2"]);
    const r1 = await p1;
    const r2 = await p2;
    expect(r1.decision).toBe("approve");
    expect(r2.decision).toBe("approve");
    expect(r1.body).toEqual({ n: 1 });
    expect(r2.body).toEqual({ n: 2 });
  });

  test("disabling an empty gate returns an empty array", () => {
    const gate = new Gate();
    gate.enable();
    expect(gate.disable()).toEqual([]);
  });

  test("emits onHold callback when a request becomes the current held request", async () => {
    const gate = new Gate();
    gate.enable();
    const events: string[] = [];
    gate.onHold((id) => events.push(id));

    void gate.hold("req-1", { n: 1 });
    void gate.hold("req-2", { n: 2 });

    expect(events).toEqual(["req-1"]);

    gate.approve("req-1");
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual(["req-1", "req-2"]);
  });
});
