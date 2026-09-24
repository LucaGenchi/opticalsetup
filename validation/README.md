# Reference checks

Separately written implementations of some of the quantitative models the app
ships, and the expected values the JavaScript is tested against. What is
covered, and what is not, is listed in
[docs/validation.md](../docs/validation.md).

A check here shows that the app evaluates the model it claims to evaluate, at
the inputs tested. Except where a case cites a published measurement, it does
not show that the model matches an experiment.

```
validation/
  reference/   one plain-Python module per model: equations, sources, cases
  expected/    generated JSON (inputs, expected outputs, tolerances); committed
  run.py       regenerates expected/ and docs/validation.md; --check verifies
  convergence.py  refines each discretisation and records what moved; the
                  report quotes its numbers, so a convergence claim is a
                  measurement rather than a sentence
```

- `python3 validation/run.py` rewrites the expected files and the report in
  `docs/validation.md`. It needs only Python 3; no packages.
- `npm test` runs `test/validation.test.js`, which calls the app's functions
  with the inputs in `expected/` and asserts agreement within each case's
  tolerance. With `CI=true` or `VALIDATE_PYTHON=1` it also re-runs the
  references and fails if an expected file or the report is out of date.
- How to add a model: `docs/adding-physics.md`.

Coverage is partial: `docs/validation.md` lists both the models checked here
and the ones that ship without a check. A model's absence is a statement
about this suite, not about the model.

The references are written from published sources rather than from the app's
code, and each states its provenance, tested domain, convergence and the
reason for its tolerance. Where a closed form exists it is checked too, since
two programs written from the same idea can share a mistake: finite differences
where the app differentiates analytically, a system matrix where the app has
a closed form, a finer split-step grid where the app uses a coarse one, and
published worked examples wherever a source gives one. Agreement therefore
checks the app's derivations, unit bookkeeping, sign conventions and
discretisation, not the same formula copied twice.
