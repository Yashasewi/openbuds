// Run with `pnpm test` (node:test, no extra dependencies). Imports the TypeScript directly (Node 22.18+).
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import {
  PROBE_PROFILE,
  PROFILES,
  callGesturePayload,
  diagnosticsReport,
  encode,
  gestureTablePayload,
  holdCyclePayload,
  noiseModePayload,
  profileFor,
  timePayload,
} from "../src/lib/protocol.ts";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const toHex = (bytes) => Buffer.from(bytes).toString("hex");
const tryEncode = (profile, command, sequence, payload) => {
  try {
    return toHex(encode(profile, command, sequence, payload));
  } catch {
    return null;
  }
};

// The Swift twin (native/Sources/BudsKit/Profile.swift) is checked against this same file by
// native/Tests/BudsKitTests, so the two tables cannot drift apart unnoticed.
// Regenerate after an intended change with: UPDATE_FIXTURES=1 pnpm test
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const summary = (p) => ({
  productId: p.productId,
  displayName: p.displayName,
  experimental: p.experimental,
  testedFirmware: p.testedFirmware,
  noiseModes: p.noiseModes,
  holdModes: p.holdModes,
  switchesReadable: sorted(p.switchesReadable),
  switchesWritable: sorted(p.switchesWritable),
  eqPresets: p.eqPresets.map((e) => [e.id, e.label]),
  customEq: p.customEq,
  gestureMenus: Object.fromEntries(
    Object.entries(p.gestureMenus).sort(([a], [b]) => a.localeCompare(b)),
  ),
  callMenus: Object.fromEntries(Object.entries(p.callMenus).sort(([a], [b]) => a.localeCompare(b))),
  gestureWrite: p.gestureWrite,
  gestureFunctions: sorted(p.gestureFunctions),
  commands: sorted(p.commands.keys()),
  // The macOS app has always also asked for id 9, which the web app does not; Swift's test skips this
  // field for Buds 4 (see PROTOCOL.md, "Per-model differences").
  featureQuery: p.featureQuery,
});
test("profile table matches the fixture shared with the Swift tests", () => {
  const actual = Object.fromEntries([...PROFILES.values()].map((p) => [p.productId, summary(p)]));
  const file = new URL("./fixtures/profiles.json", import.meta.url);
  if (process.env.UPDATE_FIXTURES) writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
  assert.deepEqual(actual, JSON.parse(readFileSync(file)));
});

test("profile lookup", () => {
  assert.equal(profileFor("065414").displayName, "OnePlus Buds 4");
  assert.equal(profileFor("065414").experimental, false);
  assert.equal(profileFor("063C14").displayName, "OnePlus Buds 3");
  assert.equal(profileFor("063c14").experimental, true);
  assert.deepEqual(profileFor("063c14").testedFirmware, ["127.127.101"]);
  assert.equal(profileFor("064414"), undefined);
  assert.equal(profileFor("000000"), undefined);
  assert.equal(PROFILES.size, 2);
});

// buds4-golden.json was recorded from the encoder as it was before profiles existed (commit fa10ef8),
// then replayed through the Buds 4 profile: accepted frames stay byte-identical, refused ones stay refused.
test("Buds 4 frames are byte-identical to the pre-profile encoder", () => {
  const buds4 = profileFor("065414");
  const cases = fixture("buds4-golden.json");
  assert.ok(cases.length > 250);
  for (const c of cases)
    assert.equal(
      tryEncode(buds4, c.command, c.sequence, c.payload),
      c.hex,
      `${c.command.toString(16)} seq ${c.sequence} [${c.payload}]`,
    );
});

test("Buds 3 sends what the owner capture shows, and refuses the rest", () => {
  const buds3 = profileFor("063c14");
  for (const c of fixture("buds3-captured-tx.json"))
    assert.equal(tryEncode(buds3, c.command, c.sequence, c.payload), c.accepted ? c.hex : null);
});

test("Buds 3 refuses everything outside its profile", () => {
  const p = profileFor("063c14");
  const refused = (command, payload) =>
    assert.throws(
      () => encode(p, command, 9, payload),
      undefined,
      `${command.toString(16)} [${payload}]`,
    );
  refused(0x0404, holdCyclePayload(["anc"])); // hold cycle write
  refused(0x0404, [2, 1, 2]);
  refused(0x010c, [2, 1]); // hold cycle read
  refused(0x0404, noiseModePayload("adaptive")); // Adaptive
  refused(0x0403, [17, 0]); // dual connection write
  refused(0x0403, [17, 1]);
  for (const id of [11, 24, 27, 28, 29, 5, 0]) refused(0x0403, [id, 1]); // any other switch
  refused(0x010d, [2, 6, 24]); // read of an id outside 6, 4, 17
  refused(0x0406, [4]); // beyond preset 3
  refused(0x0418, [1, 250, 6, 0, 1, 65, 1, 62, 0, 0]); // custom EQ
  refused(0x041b, [0xfb, 5, 1]); // BassWave
  refused(0x0122, []);
  refused(0x0109, []); // wear was never queried
  for (const c of [0x0112, 0x0114, 0x0115, 0x0124, 0x0130, 0x040e]) refused(c, []);
  for (const c of [0x0400, 0x0405]) refused(c, [1]);
  // What is allowed still goes through its payload check.
  assert.doesNotThrow(() => encode(p, 0x0404, 9, noiseModePayload("smart")));
  assert.doesNotThrow(() => encode(p, 0x0403, 9, [6, 1]));
  assert.doesNotThrow(() => encode(p, 0x0403, 9, [4, 0]));
  assert.doesNotThrow(() => encode(p, 0x010c, 9, [4, 1]));
  assert.doesNotThrow(() => encode(p, 0x0406, 9, [3]));
  assert.throws(() => encode(p, 0x0403, 9, [6, 2]));
});

test("Buds 3 gesture writes are one slot; its menus have no game mode and no call group", () => {
  const p = profileFor("063c14");
  const slot = (device, action, fn) => ({
    device,
    button: 1,
    action,
    fn,
    side: device === 1 ? "Left" : "Right",
  });
  const table = [
    slot(1, 1, 1),
    slot(1, 2, 6),
    slot(1, 3, 5),
    slot(1, 4, 8),
    slot(1, 5, 7),
    slot(2, 2, 6),
  ];
  assert.deepEqual(gestureTablePayload(p, table, "Left", 2, 3), [1, 1, 1, 2, 3]); // the captured write
  assert.throws(() => gestureTablePayload(p, table, "Left", 2, 17));
  assert.throws(() => callGesturePayload(p, 2, 29));
  assert.deepEqual(p.callMenus, {});
  // Buds 4 still writes the whole table.
  const q = profileFor("065414");
  assert.equal(gestureTablePayload(q, table, "Left", 2, 0).length, 1 + table.length * 4);
});

test("a model without a profile can only read its identity", () => {
  assert.doesNotThrow(() => encode(PROBE_PROFILE, 0x0100, 1));
  assert.doesNotThrow(() => encode(PROBE_PROFILE, 0x0103, 2));
  assert.doesNotThrow(() => encode(PROBE_PROFILE, 0x0105, 3));
  assert.doesNotThrow(() => encode(PROBE_PROFILE, 0x0200, 4));
  assert.doesNotThrow(() => encode(PROBE_PROFILE, 0x010d, 5, [3, 6, 4, 17]));
  for (const [command, payload] of [
    [0x0404, [1, 1, 1]],
    [0x0403, [6, 1]],
    [0x0406, [1]],
    [0x0401, [1, 1, 1, 1, 1]],
    [0x0205, [1, 1]],
    [0x0108, []],
    [0x0106, []],
    [0x010c, [1, 1]],
    [0x010d, [1, 24]],
  ])
    assert.throws(
      () => encode(PROBE_PROFILE, command, 4, payload),
      undefined,
      command.toString(16),
    );
});

test("0x0500 answer frame: 0x8500 00 <unix u32 LE>, echoing the request sequence", () => {
  assert.deepEqual(timePayload(0x01020304), [0, 4, 3, 2, 1]);
  assert.deepEqual(timePayload(0xfffffffe), [0, 0xfe, 0xff, 0xff, 0xff]);
  for (const profile of [profileFor("065414"), profileFor("063c14"), PROBE_PROFILE])
    for (const seq of [0, 1, 0x2a, 254, 255])
      assert.equal(
        toHex(encode(profile, 0x8500, seq, timePayload(0x01020304))),
        `aa0c00000085${seq.toString(16).padStart(2, "0")}05000004030201`,
      );
  const buds4 = profileFor("065414");
  assert.throws(() => encode(buds4, 0x8500, 1, [0]));
  assert.throws(() => encode(buds4, 0x8500, 1, [1, 0, 0, 0, 0]));
  assert.throws(() => encode(buds4, 0x8500, 256, timePayload(1)));
  // Ordinary commands keep the 1..254 sequence rule.
  assert.throws(() => encode(buds4, 0x0100, 255));
  assert.throws(() => encode(buds4, 0x0100, 0));
});

test("diagnostics report carries protocol replies only", () => {
  const text = diagnosticsReport({
    productId: "ab1234",
    firmware: "1.2.3",
    bitmap: [255, 1],
    offeredEvents: [1, 2],
    features: [0, 1, 6, 0],
  });
  assert.match(text, /Product id: ab1234/);
  assert.match(text, /Firmware: 1\.2\.3/);
  assert.match(text, /bitmap: ff 01/);
  assert.match(text, /offered events: 01 02/);
  assert.match(text, /reply \(ids 6, 4, 17\): 00 01 06 00/);
});
