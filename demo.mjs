#!/usr/bin/env node
// demo.mjs — the single-instruction substrate, shown working:
// a counter that breaches and heals by branching; the machine snapshotted to
// a file and resumed bit-identically; an agent rewriting live behavior with
// one integer write. Run: node demo.mjs
import { healProgram, imageHash, Substrate } from "./src/substrate.mjs";
import { writeFileSync, readFileSync } from "node:fs";

const s = healProgram();
s.run(32);
console.log(`ran ${s.steps} steps. halted: ${s.halted} (healing is structural — there is no halt path)`);
console.log(`breaches (branches to 9): ${s.trace.filter((pc) => pc === 9).length}`);
console.log(`counter re-armed: ${s.peek(19) === 5 ? "YES" : "NO"} (${s.peek(19)})   ticks: ${s.peek(21)}`);
console.log(`image hash: ${imageHash(s.image())}`);

// the state image is the machine: write it to disk, reload, resume
writeFileSync("/tmp/substrate.snapshot", JSON.stringify(s.snapshot()));
const resumed = new Substrate(64, { trace: true })
  .restore(JSON.parse(readFileSync("/tmp/substrate.snapshot", "utf8")));
resumed.run(64);
const clean = healProgram(); clean.run(64);
console.log(`\nsnapshot → disk → restored → ran to 64: ${imageHash(resumed.image()) === imageHash(clean.image()) ? "BIT-IDENTICAL to uninterrupted" : "DIVERGED (BUG)"}`);

// an agent rewrites live behavior with a raw array write. no compiler.
const hacked = healProgram();
hacked.poke(2, -1);
hacked.run(64);
console.log(`one integer write (C=-1 at the breach): halted=${hacked.halted} at step ${hacked.steps}, counter never re-armed (${hacked.peek(19)})`);
console.log("\nthe program is an integer array. the state is an integer array. the boundary between code, data, and compute fabric is dissolved at 122 lines.");
