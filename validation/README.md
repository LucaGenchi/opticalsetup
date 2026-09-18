# Validation references

Independent implementations of every quantitative model the app ships, and
the expected values the JavaScript is tested against.

```
validation/
  reference/   one plain-Python module per model: equations, sources, cases
  expected/    generated JSON (inputs, expected outputs, tolerances); committed
  run.py       regenerates expected/ and docs/validation.md; --check verifies
```

- `python3 validation/run.py` rewrites the expected files and the report in
  `docs/validation.md`. It needs only Python 3; no packages.
- `npm test` runs `test/validation.test.js`, which calls the app's functions
  with the inputs in `expected/` and asserts agreement within each case's
  tolerance. With `CI=true` or `VALIDATE_PYTHON=1` it also re-runs the
  references and fails if an expected file or the report is out of date.
- How to add a model: `docs/adding-physics.md`.

The references are written to be independent of the app: finite differences
where the app differentiates analytically, a system matrix where the app has
a closed form, a finer split-step grid where the app uses a coarse one, and
published worked examples wherever a source gives one. Agreement therefore
checks the app's derivations, unit bookkeeping, sign conventions and
discretisation, not the same formula copied twice.
