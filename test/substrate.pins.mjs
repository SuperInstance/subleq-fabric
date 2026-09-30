// test/substrate.pins.mjs — FAIL-first pins for the single-instruction substrate.
// S1 determinism: same program, two runs, same image + trace hashes
// S2 semantics: hand-computed triplet program yields exact memory and pc sequence
// S3 SELF-HEAL: breach branches to recovery; re-armed; no halt; the branch IS the healing
// S4 snapshot = the machine: run N, snapshot, restore, resume M == uninterrupted N+M
// S5 the Python split: pack.py compiles a spec; node loads and executes it byte-identically
// S6 code generation = array op: an agent writes C=-1 at the breach branch; machine halts there
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { Substrate, imageHash, traceHash, healProgram } from "../src/substrate.mjs";

test("S1 heal program is deterministic end to end", () => {
  const a = healProgram(); a.run(30);
  const b = healProgram(); b.run(30);
  assert.equal(imageHash(a.image()), imageHash(b.image()));
  assert.equal(traceHash(a.trace), traceHash(b.trace));
  assert.equal(a.steps, b.steps);
  assert.equal(a.halted, false);
});

test("S2 subtract-and-branch semantics are exact", () => {
  const s = new Substrate(16, { trace: true });
  // op0 @0: A=X(9), B=Y(10), C=12 → Y -= X; >0 → fall to 3
  // op1 @3: A=Y(10), B=Z(11), C=0  → Z -= Y; ≤0 → branch 0
  // op2 @6: never reached within budget
  [9, 10, 12, 10, 11, 0, 13, 14, -1, 3, 7, 0, 0, 9, 8, 0].forEach((v, i) => s.poke(i, v));
  s.run(3);
  assert.deepEqual(s.trace, [0, 3, 0]);
  assert.equal(s.peek(10), 1, "Y: 7-3 then 4-3");
  assert.equal(s.peek(11), -4, "Z: 0-4");
  assert.equal(s.halted, false);
});

test("S3 breach heals by a plain deterministic branch — no trap, no supervisor", () => {
  const s = healProgram();
  s.run(32); // budget lands exactly after the second heal's loop-back
  assert.equal(s.halted, false, "the machine must not halt: healing is structural");
  assert.equal(s.trace.filter((pc) => pc === 9).length, 2, "two breaches, both branched to recovery address 9");
  assert.equal(s.peek(19), 5, "counter re-armed to 5 by the recovery cells");
  assert.equal(s.peek(21), 10, "ticks accumulated across both breaches");
});

test("S4 the snapshot IS the machine: dump, restore, resume == uninterrupted", () => {
  const full = healProgram(); full.run(48);
  const split = healProgram(); split.run(16);
  const resumed = new Substrate(64, { trace: true }).restore(split.snapshot());
  resumed.run(48); // absolute cap: 16 carried steps + 32 more
  assert.equal(resumed.steps, full.steps);
  assert.equal(imageHash(resumed.image()), imageHash(full.image()), "resumed machine must be bit-identical to the uninterrupted run");
  assert.equal(resumed.peek(19), full.peek(19));
  assert.equal(resumed.peek(21), full.peek(21));
  assert.equal(resumed.halted, full.halted);
});

test("S5 pack.py (the thin Python layer) compiles a spec the substrate executes byte-identically", () => {
  const spec = {
    size: 64,
    data: {
      ONE: { addr: 18, value: 1 }, CNT: { addr: 19, value: 5 }, M1: { addr: 20, value: -1 },
      TICKS: { addr: 21, value: 0 }, ZED: { addr: 22, value: 0 }, ARM5: { addr: 23, value: -5 },
      ARM: { addr: 24, value: 5 },
    },
    code: [["ONE", "CNT", "heal"], ["M1", "TICKS", "loop"], ["ZED", "ZED", "tick"],
           ["ARM5", "CNT", "healbody"], ["M1", "TICKS", "loop2"], ["ZED", "ZED", "tick"]],
    labels: { tick: "op0", loop: "op2", heal: "op3", healbody: "op4", loop2: "op5" },
  };
  writeFileSync("/tmp/subleq-spec.json", JSON.stringify(spec));
  execFileSync("python3", ["pack.py", "/tmp/subleq-spec.json", "/tmp/subleq-img.json"], { cwd: new URL("..", import.meta.url).pathname });
  const packed = JSON.parse(readFileSync("/tmp/subleq-img.json", "utf8"));
  const s = new Substrate(packed.size, { trace: true });
  packed.image.forEach((v, i) => s.poke(i, v));
  s.run(32);
  const hand = healProgram(); hand.run(32);
  assert.equal(imageHash(s.image()), imageHash(hand.image()), "packed image is byte-identical to the hand-built heal program");
  assert.equal(traceHash(s.trace), traceHash(hand.trace));
});

test("S6 an agent alters behavior with a raw array write — no compiler", () => {
  const s = healProgram();
  s.poke(2, -1); // rewrite the breach branch target: halt instead of heal
  const r = s.run(40);
  assert.equal(r.halted, true, "breach now halts the machine — behavior changed by one integer write");
  assert.equal(s.steps, 13, "halted exactly at the first breach branch");
  assert.ok(!s.trace.includes(9), "recovery address never executed after the rewrite");
  assert.equal(s.peek(19), 0, "counter never re-armed");
});
