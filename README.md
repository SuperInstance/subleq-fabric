# subleq-fabric

**The single-instruction execution substrate.** Part of the SuperInstance
fleet; answers the captain's 2026-09-30 11:23 mandate: anchor the architecture
to an application-specific, single-instruction substrate with a thin Python
routing layer, where code generation is a matrix operation, self-healing is a
deterministic conditional jump, and the node's entire state is a flat
memory-mapped integer topology.

One instruction: **SUBLEQ** — subtract and branch if ≤ 0. That is the entire
machine. ~120 lines of dependency-free Node for the reference kernel, a ~50-line
stdlib-only Python packer, 6 pins.

## Run it

```sh
node demo.mjs                        # heal loop + snapshot/resume + live rewrite
node --test test/substrate.pins.mjs  # 6 pins (S1–S6)
python3 pack.py spec.json image.json # the thin Python layer, for real
```

## The three claims, pinned

| the mandate's claim | the pin | mark |
|---|---|---|
| code generation = array operation | S6: `poke(2, -1)` rewrites the breach branch from "heal" to "halt" — behavior changes with one integer write, no compiler, no toolchain | HEWN |
| self-healing = a deterministic conditional jump | S3: the counter breach (value ≤ 0) branches to the recovery cells; counter re-arms to 5; the machine never halts and has no supervisor — the branch IS the healing | HEWN |
| state = flat memory topology | S4: snapshot → disk → restore → resume is **bit-identical** to the uninterrupted run (sha256-pinned) | HEWN (PoC scale) |

S5 pins the functional split: `pack.py` compiles a high-level spec (named data
cells, label aliases, triplet code) into the flat image — the packed machine is
byte-identical to the hand-built one. Python packs and routes; the substrate
executes.

S2 pins the semantics exactly (hand-computed trace `[0,3,0]`, exact memory).
S1 pins determinism end to end.

## What the pins caught (FAIL-first working as designed)

- **Fall-through into data**: the first heal program assumed `ticks+1` would
  branch back — but a positive result falls through, and the CPU "executed" the
  constants at cells 6–8 as instructions, halting on `C=-1`. Real subleq lesson,
  caught by S1: *every op either branches on its subtract or falls to the next
  op — never into data.* Fixed with explicit always-branch ops (`ZED-ZED,0`).
- **Misplaced data in S2's image** (off-by-slot in the flat array) — caught by
  the exact-memory asserts.
- **Label aliasing shifted by one** in the pack spec — caught by the
  byte-identical hash compare against the hand-built machine.

## Marks

| shard | mark | notes |
|---|---|---|
| subleq kernel (Int32Array, traps, trace) | HEWN | S1–S3, S6 |
| snapshot/restore bit-identity | HEWN | S4 — file I/O at PoC scale |
| pack.py (thin Python layer) | HEWN | S5 — stdlib only |
| native mmap kernel (Zig/C++), registers-as-MMIO | DRAWN | the PoC carries pc/steps beside the memory image; a real mmap'd image needs the native kernel. One weekend. |
| ring-buffer DMA ingest, fixed-stride SIMD lanes | DRAWN | deployment-target work: needs the physical boundary defined (NIC? FPGA? which transform sequence?) — the captain's message-3 questions are the right next input |
| Idris 2 dependent-type invariants | SCARF | real, load-bearing idea — but no dependent-type toolchain exists anywhere in the fleet; pinning invariants as TYPES requires bootstrapping Idris. Revisit when a kernel is worth proving. |
| concatenative/homoiconic layer | SHAPED | subleq triplets ARE code-as-data: the program is an integer array you transform with array ops (S6 is the seed). A full Forth/Factor-style stack layer on top is one pack.py upgrade. |
| FPGA bitstream (SpinalHDL/Bluespec) | SCARF | zero hardware target in the fleet; no compiler installed. The substrate semantics here are exactly what such a compiler would target, so the PoC is the specification. |

## Why this is the harmonization, not another silo

- The heal machine's image is a flat integer array → the same content-address
  doctrine as `quilt/cell-receipt@v1` and `fleet-state@v1`: hash the bytes,
  the hash IS the identity. Ground Zero (the captain's message 2) is already
  the fleet's load-bearing law; this repo extends it to the compute fabric.
- `edge-ledger`'s per-node chains could be sealed BY the substrate: an agent
  packing its state transitions into triplets and the triplet array into an
  envelope body. DRAWN, deliberately not built yet — one lane at a time.

## License

MIT.
