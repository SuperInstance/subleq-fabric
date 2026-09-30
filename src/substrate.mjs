// src/substrate.mjs — the single-instruction execution substrate.
// One instruction: SUBLEQ — subtract and branch if less-or-equal zero.
//   mem[pc..pc+2] = A, B, C   (the code cells HOLD addresses/constants)
//   if A == -1        → mem[B] = input()              (input trap)
//   else if B == -1   → output(mem[A])                (output trap)
//   else              → mem[B] -= mem[A]
//                        next = (mem[B] <= 0) ? C : pc+3
//   next < 0          → halt                          (C == -1 = halt-on-branch)
// That is the ENTIRE machine. The captain's three claims this pins:
//   1. code generation = array operation (the program is an Int32Array;
//      rewriting behavior is a raw memory write — pinned in S6)
//   2. self-healing = a deterministic conditional jump (an error is just a
//      value crossing <= 0; the branch IS the recovery — pinned in S3)
//   3. the state image is the machine (dump the buffer, reload, resume —
//      pinned in S4; real mmap kernel DRAWN, see README marks)
import { createHash } from "node:crypto";

export class Substrate {
  constructor(size = 1024, { input = [], trace = false } = {}) {
    this.mem = new Int32Array(size);
    this.pc = 0;
    this.steps = 0;
    this.halted = false;
    this.in = [...input];       // drained input queue
    this.out = [];              // collected output char codes
    this.traceOn = trace;
    this.trace = [];
  }
  // load a full state image (Buffer, Int32Array, or the JSON-Buffer shape
  // {type:"Buffer", data:[...]} that snapshot files round-trip through)
  loadImage(buf) {
    if (buf && buf.type === "Buffer" && Array.isArray(buf.data)) buf = Buffer.from(buf.data);
    if (buf.byteLength !== this.mem.byteLength) throw new Error(`image size ${buf.byteLength} != mem ${this.mem.byteLength}`);
    const u8 = buf instanceof Int32Array ? new Uint8Array(buf.buffer) : new Uint8Array(buf);
    new Int8Array(this.mem.buffer).set(u8);
    return this;
  }
  image() { return Buffer.from(this.mem.buffer.slice(0)); } // the memory IS this buffer
  snapshot() { return { image: this.image(), pc: this.pc, steps: this.steps }; } // + registers (MMIO in hardware; see README marks)
  restore(snap) { this.loadImage(snap.image); this.pc = snap.pc; this.steps = snap.steps; this.halted = false; return this; }
  poke(addr, v) { this.mem[addr] = v | 0; return this; }
  peek(addr) { return this.mem[addr]; }

  step() {
    if (this.halted) return false;
    const A = this.mem[this.pc], B = this.mem[this.pc + 1], C = this.mem[this.pc + 2];
    let next;
    if (A === -1) { this.mem[B] = this.in.length ? this.in.shift() : 0; next = this.pc + 3; }
    else if (B === -1) { this.out.push(this.mem[A] & 0x7fffffff); next = this.pc + 3; }
    else {
      this.mem[B] = (this.mem[B] - this.mem[A]) | 0;
      next = this.mem[B] <= 0 ? C : this.pc + 3;
    }
    this.steps++;
    if (this.traceOn) this.trace.push(this.pc);
    if (next < 0) { this.halted = true; return false; }
    this.pc = next;
    return true;
  }

  run(maxSteps = 1_000_000) {
    while (!this.halted && this.steps < maxSteps) this.step();
    return { steps: this.steps, halted: this.halted, out: this.out, trace: this.trace };
  }
}

export const imageHash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);
export const traceHash = (t) => createHash("sha256").update(t.join(",")).digest("hex").slice(0, 16);

// The demo machine: a counter that breaches and HEALS by branching.
// Code (triplets) at 0..17, named data at 18.. — no fall-through into data:
// every op either branches on its subtract result or falls to the next op.
//   0: tick     CNT -= 1; ≤0 → 9 (heal)          [18,19,9]
//   3: body     TICKS += 1 (always falls)         [20,21,6]
//   6: loop     ZED -= ZED (0 ≤ 0, always → 0)    [22,22,0]
//   9: heal     CNT -= (-5) → re-armed (falls)    [23,19,12]
//  12: healbody TICKS += 1 (falls)                [20,21,15]
//  15: loop2    ZED -= ZED (always → 0)           [22,22,0]
//  18..24: ONE=1, CNT=5, M1=-1, TICKS=0, ZED=0, ARM5=-5, ARM=5 (documented)
export function healProgram() {
  const s = new Substrate(64, { trace: true });
  [18, 19, 9, 20, 21, 6, 22, 22, 0, 23, 19, 12, 20, 21, 15, 22, 22, 0,
   1, 5, -1, 0, 0, -5, 5].forEach((v, i) => s.poke(i, v));
  return s;
}
