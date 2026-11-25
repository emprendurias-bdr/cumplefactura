// Los verificadores del gate buscan los binarios en CARGO_TARGET_DIR si existe.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { cargoTargetDir, root } from "../../tools/lib.mjs";

test("sin CARGO_TARGET_DIR usa <repo>/target", () => {
  assert.equal(cargoTargetDir({}), resolve(root, "target"));
  assert.equal(cargoTargetDir({ CARGO_TARGET_DIR: "  " }), resolve(root, "target"));
});

test("CARGO_TARGET_DIR relativo se resuelve desde la raíz del repo", () => {
  assert.equal(cargoTargetDir({ CARGO_TARGET_DIR: "../_target" }), resolve(root, "../_target"));
});

test("CARGO_TARGET_DIR absoluto se respeta", () => {
  const abs = resolve(root, "..", "otro", "target");
  assert.equal(cargoTargetDir({ CARGO_TARGET_DIR: abs }), abs);
});
