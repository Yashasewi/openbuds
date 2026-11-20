// Drives BudsSession against a fake serial port. Replies for the Buds 3 are the owner capture
// (OnePlus Buds 3 fw 127.127.101, 2026-10-12); the unknown model is invented.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Framer } from "../src/lib/protocol.ts";
import { BudsSession } from "../src/lib/session.ts";

function frame(command, sequence, payload) {
  const size = 7 + payload.length;
  return Uint8Array.from([
    0xaa,
    size,
    0,
    0,
    command & 255,
    command >> 8,
    sequence,
    payload.length,
    0,
    ...payload,
  ]);
}
const text = (s) => Array.from(Buffer.from(s));
const GESTURES = [0, 12].concat(
  [1, 2].flatMap((d) =>
    [
      [1, 1],
      [2, 6],
      [3, 5],
      [4, 8],
      [6, 0],
      [5, 7],
    ].flatMap(([a, f]) => [d, 1, a, f]),
  ),
);
const BUDS3 = (command, payload) =>
  ({
    0x0100: [0, 0xff, 0x77, 0x5a, 0xee, 0xe7, 0x0e, 0x22, 0],
    0x0103: [0, 0x14, 0x3c, 0x06],
    0x0105: [0, 5, ...text("1,1,01,1,2,127,2,1,01,2,2,127,3,2,101")],
    0x0200: [0, 9, 1, 2, 3, 4, 8, 11, 0xf1, 0xf2, 0xf3],
    0x0205: [0],
    0x0106: [0, 2, 1, 100, 2, 100],
    0x010c: payload[0] === 4 ? [0, 4, 1, 0x40, 0] : [0, 1, 1, 0x80, 0],
    0x010f: [0, 0],
    0x010d: [0, 3, 6, 0, 4, 1, 17, 1],
    0x0108: GESTURES.slice(0, 1).concat([0], GESTURES.slice(1)).slice(1),
    0x0403: [0],
  })[command];
const UNKNOWN = (command) =>
  ({
    0x0100: [0, 1, 0, 0, 0],
    0x0103: [0, 0x01, 0x02, 0x03],
    0x0105: [0, 5, ...text("1,2,9")],
    0x0200: [0, 1, 1],
    0x010d: [0, 0],
  })[command];

function fakePort(reply) {
  const sent = [];
  const queue = [];
  let wake = null;
  const push = (bytes) => (
    wake ? wake({ value: bytes, done: false }) : queue.push(bytes),
    (wake = null)
  );
  const framer = new Framer((f) => {
    sent.push(f);
    const payload = reply(f.command, f.payload);
    if (payload) push(frame(f.command | 0x8000, f.sequence, payload));
  });
  return {
    sent,
    push,
    getInfo: () => ({}),
    open: async () => {},
    close: async () => {},
    readable: {
      getReader: () => ({
        read: () =>
          queue.length
            ? Promise.resolve({ value: queue.shift(), done: false })
            : new Promise((r) => (wake = r)),
        cancel: async () => wake?.({ done: true }),
        releaseLock() {},
      }),
    },
    writable: { getWriter: () => ({ write: async (b) => framer.push(b), releaseLock() {} }) },
  };
}
const hexOf = (c) => c.toString(16).padStart(4, "0");

test("Buds 3 connects with its profile, reads only what it allows, and refuses everything else", async () => {
  const port = fakePort(BUDS3);
  const s = new BudsSession();
  await s.connect(port);
  assert.equal(s.profile.productId, "063c14");
  assert.equal(s.state.firmware, "127.127.101");
  assert.deepEqual(s.state.features, { 6: 0, 4: 1, 17: 1 });
  assert.equal(s.state.noise.mode, "smart");
  assert.equal(s.state.holdCycle, undefined);
  assert.equal(s.state.unsupported, undefined);
  assert.deepEqual(s.subscribed, [1, 2, 3]);

  const sentCommands = port.sent.map((f) => hexOf(f.command));
  for (const never of [
    "0109",
    "0112",
    "0114",
    "0115",
    "0122",
    "0124",
    "0130",
    "0400",
    "0405",
    "040d",
  ])
    assert.ok(!sentCommands.includes(never), `sent ${never}`);
  assert.ok(!port.sent.some((f) => f.command === 0x010c && f.payload[0] === 2), "hold cycle read");
  const features = port.sent.find((f) => f.command === 0x010d);
  assert.deepEqual(features.payload, [3, 6, 4, 17]);

  const before = port.sent.length;
  await assert.rejects(s.setHoldCycle(["anc"]));
  await assert.rejects(s.setNoise("adaptive"));
  await assert.rejects(s.setSwitch(17, false));
  await assert.rejects(s.setSwitch(24, true));
  await assert.rejects(s.setEq(7));
  await assert.rejects(s.setCallGesture(2, 29));
  await assert.rejects(s.setBass(1));
  await assert.rejects(s.createPreset("x", [{ frequency: 62, gain: 0 }]));
  assert.equal(port.sent.length, before, "a refused change must not reach the wire");

  // An allowed write is sent in the captured form (the fake does not change state, so the read-back fails).
  await assert.rejects(s.setSwitch(6, true));
  const write = port.sent.find((f) => f.command === 0x0403);
  assert.deepEqual(write.payload, [6, 1]);
  await s.close();
});

test("answers 0x0500 on a profiled and an unprofiled model", async (t) => {
  t.mock.method(Date, "now", () => 1_700_000_000_000);
  for (const [name, reply] of [
    ["Buds 3", BUDS3],
    ["unknown", UNKNOWN],
  ]) {
    const port = fakePort(reply);
    const s = new BudsSession();
    await s.connect(port);
    port.push(frame(0x0500, 0x2a, []));
    await new Promise((r) => setTimeout(r, 100));
    const answer = port.sent.find((f) => f.command === 0x8500);
    assert.ok(answer, `no answer to 0x0500 (${String(name)})`);
    assert.equal(answer.sequence, 0x2a);
    assert.deepEqual(answer.payload, [0, 0x00, 0xf1, 0x53, 0x65]); // 1_700_000_000 = 0x6553F100
    await s.close();
  }
});

test("an unknown product id is read-only and produces a diagnostics report", async () => {
  const port = fakePort(UNKNOWN);
  const s = new BudsSession();
  await s.connect(port);
  assert.equal(s.snapshot.connection, "connected");
  assert.equal(s.state.profile, undefined);
  assert.equal(s.state.unsupported.productId, "030201");
  assert.equal(s.state.unsupported.firmware, "9");
  assert.match(s.state.unsupported.report, /Product id: 030201/);
  assert.match(s.state.unsupported.report, /0x8100 bitmap: 01 00 00 00/);
  // Identity reads only: no subscription, no refresh, nothing writable.
  const sentCommands = new Set(port.sent.map((f) => hexOf(f.command)));
  assert.deepEqual(
    [...sentCommands].sort((a, b) => a.localeCompare(b)),
    ["0100", "0103", "0105", "010d", "0200"],
  );
  await assert.rejects(s.setNoise("off"));
  await assert.rejects(s.setSwitch(6, true));
  await assert.rejects(s.setEq(1));
  await s.close();
});
