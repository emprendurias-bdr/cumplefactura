# CumpleFactura sidecar smoke

- Generated: 2026-11-19T23:31:59.735Z
- Status: failed
- Binary: `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\target\release\cumplefactura-sidecar.exe`
- Error: sidecar binary not found: C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\target\release\cumplefactura-sidecar.exe

## Checks


## Limits

- The sidecar runs without --allow-aeat, so it cannot reach AEAT.
- It proves process lifecycle, HMAC boundary and fail-closed policy; real mTLS submission is verified manually with tools/homolog-verifactu.mjs.
