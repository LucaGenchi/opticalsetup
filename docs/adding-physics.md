# Adding a quantitative model

This is the protocol for any change that makes OpticalSetup report a number
a researcher might act on: a duration, a power, a bandwidth, an efficiency,
a spot size. It exists so that "the app says 46.8 fs" always means "an
independent implementation says 46.8 fs too, inside a stated scope". It
applies to new models and to changes that move an existing model's output.
Qualitative or diagram-only behaviour (a mirror folds, a filter dims a beam
by a user-set fraction) does not need it, but must not pretend otherwise.

The steps are ordered on purpose: the reference comes first, the JavaScript
last. Writing the reference first is what makes it independent.

## 1. Write the model statement

Before any code, write down, in the wiki entry of the element (or a new
`docs/physics/<model>.md` for something bigger, as
[hollow-core.md](physics/hollow-core.md) does):

- the equations, with every symbol and unit named;
- the assumptions (scalar, paraxial, single mode, undepleted, ...);
- the parameter ranges inside which the model is valid, and what the app
  reports outside them (it must say "unavailable", never extrapolate);
- the sources, cited so that a reader can check the equations;
- the conventions where the literature offers more than one (sign of the
  chirp, effective-area definition, FWHM versus 1/e² widths, handedness).

## 2. Write the reference implementation

Add `validation/reference/<model>.py`. Plain Python, no dependencies, so it
runs anywhere and in CI. It must be written *without looking at the
JavaScript*: use a different method where one exists (finite differences
where the app uses analytic derivatives, a system matrix where the app uses
a closed form, a finer grid where the app uses a coarse one, a published
worked example wherever the source gives one). The module exposes:

- `MODEL`: id, title, the app functions it checks, the reference method, the
  citations, the fidelity (`computed` for anything in this table) and the
  scope sentence that will appear in `docs/validation.md`;
- `cases()`: a list of `{name, inputs, expected, tolerance}`; add
  `"absolute": True` when a quantity is naturally near zero, and a `note`
  when a tolerance is looser than the method allows for a documented reason.

Choose tolerances from the method, not from what passes: 1e-9 for algebra,
1e-6 for converged numerics, 1e-3 for grid-limited Fourier results. If a
published value is quoted to three figures, the tolerance is 0.3 %.

Register the module in `MODULES` in `validation/run.py` and run
`python3 validation/run.py`, which writes `validation/expected/<model>.json`
and regenerates `docs/validation.md`.

## 3. Implement it in the app

Now write the JavaScript, as a pure function that takes plain numbers with
units in their names (`gddFs2`, `lengthM`, `wavelengthNm`) and returns plain
numbers, so that the validation test can call it directly. Keep it in a
module without DOM access (`sketch/js/glass.js`, `pulse-field.js`,
`fiber.js`, `parametric.js` are the existing homes). Return `null` outside
the stated scope, and let the caller show "unavailable" with the reason.

## 4. Connect the test

Add the mapping from the case inputs to the app function in
`test/validation.test.js` (`APP[<model id>]`) and run `npm test`. Every case
must agree inside its tolerance. If one does not, decide which side is wrong
and fix that side; loosening a tolerance is allowed only with a `note` in
the reference that says why (see the GVD bucket note in `sellmeier.py` for
the shape of an honest one).

## 5. Update the snapshots

If the change moves any number the tracer reports for a bundled scene, run
`node tools/update-golden.mjs`, read the diff of `test/golden/`, and commit
it with the physics reason in the pull request description. A golden diff
without a reason is a bug report.

## 6. Say what the app now claims

- Update the element's wiki entry ("In OpticalSetup" section) and, if the
  README's simulation-scope section lists the behaviour, that paragraph.
- Add a bundled example when the model needs a scene to be understood, with
  a control table like the one in `docs/physics/hollow-core.md`: default
  result, and what each knob is expected to do.
- In the pull request, state: user-visible behaviour, the reference and the
  tolerance, the scope, and the exact checks run.

## What reviewers check

- Is there a reference file, and was it written independently of the app?
- Do the tolerances follow from the method?
- Does the app return `null`/"unavailable" outside the scope, and is the
  scope stated where users read it?
- Are the units in the function names and the JSON fields?
- Do the golden snapshots change only where the description says they should?
