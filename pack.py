#!/usr/bin/env python3
# pack.py — the thin Python layer. Compiles a high-level spec into the
# substrate's flat triplet image: the functional split made literal. Python
# packs and routes; the substrate executes. stdlib only.
#
# spec = {
#   "size": 64,
#   "data": {"ONE": {"addr": 6, "value": 1}, ...},   # named data cells
#   "code": [["ONE", "CNT", "heal"], ...],           # operands resolve to data ADDRESSES
#   "labels": {"tick": "op0", ...}                   # aliases onto code positions
# }
import json, sys

def pack(spec):
    size = spec.get("size", 256)
    code = spec.get("code", [])
    data = spec.get("data", {})
    labels = {}
    addr = 0
    for i, _op in enumerate(code):
        labels[f"op{i}"] = addr
        addr += 3
    for name, cell in data.items():
        labels[name] = cell["addr"]
    for alias, target in spec.get("labels", {}).items():
        if isinstance(target, str) and target not in labels:
            raise SystemExit(f"unknown label target {target!r}")
        labels[alias] = labels[target] if isinstance(target, str) else target
    img = [0] * size
    addr = 0
    for op in code:
        if len(op) != 3: raise SystemExit(f"ops are triplets, got {op!r}")
        for operand in op:
            if isinstance(operand, str) and operand in labels:
                img[addr] = labels[operand]
            else:
                try: img[addr] = int(operand)
                except (ValueError, TypeError): raise SystemExit(f"unknown operand {operand!r}")
            addr += 1
    for name, cell in data.items():
        img[cell["addr"]] = cell["value"]
    return {"size": size, "image": img}

if __name__ == "__main__":
    spec_path, out_path = sys.argv[1], sys.argv[2]
    with open(spec_path) as f: spec = json.load(f)
    with open(out_path, "w") as f: json.dump(pack(spec), f)
    print(f"packed {len(spec.get('code', []))} ops -> {out_path}")
