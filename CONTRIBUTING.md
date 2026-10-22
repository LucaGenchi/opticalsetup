# Contributing to OpticalSetup

Thank you for wanting to help. OpticalSetup is a free, browser-based 2D
optical workbench: people use it to draw a setup, see how light goes through
it, and make a figure or a share link. Contributions of every size are
welcome, from a corrected sentence in the wiki to a new optical element.

This page says what the project is trying to be, how accurate it must be, and
how a contribution travels from an idea to the public site. The detailed
guides it links to win wherever they say more.

## What OpticalSetup is, and is not

OpticalSetup **informs and educates**. It computes what it shows, within
stated limits: rays come from the surfaces on the canvas, dispersion from
catalogue glass data, and readings from the traced light. It is meant for
designing, understanding and communicating setups. It is **not** a
replacement for optical design software: it works in 2D and does not do
tolerancing, lens optimisation, or full diffraction and wave propagation.

That purpose sets what a good contribution looks like:

- **A simple model the user can tune beats a complex model nobody can
  check.** An element should give a clear first-order behaviour with
  parameters the user sets. The more accurate models from the literature
  belong in the element's wiki article, with sources and a recipe for
  approximating them with the available settings, rather than in the code.
- **Honest beats impressive.** A clear note that says "this is not modelled"
  is better than behaviour that looks right but is not. Do not add physics
  just to make a component look functional.
- **The figure is the user's.** The app must keep working offline, without an
  account, with no server storing anyone's setups.

## The accuracy bar

Every component is one of three kinds, and the UI says which:

| Kind | Meaning | What a contribution must keep true |
| --- | --- | --- |
| **Simulated** | The tracer computes its effect on the light | The behaviour matches the model stated in its wiki article |
| **Needs setup** | It works once the user sets the parameters it needs | It says what it is waiting for, instead of guessing |
| **Diagram only** | An annotation (arrows, labels, frames) | It never absorbs, blocks or redirects light |

Beyond that:

1. **Qualitative unless calibrated.** Behaviour is described as qualitative
   unless it has been checked. UI text, wiki pages and the README must claim
   exactly what the tracer does, no more.
2. **Any number someone might act on is validated.** A duration, power,
   bandwidth, efficiency or spot size follows
   [docs/adding-physics.md](docs/adding-physics.md): a written model
   statement, an independent Python reference written from the sources (not
   from the JavaScript), tolerances chosen from the method, then the app code
   and a test. Results are listed in [docs/validation.md](docs/validation.md).
3. **Sources are real and checked.** Cite only sources whose full text you
   have read, give enough detail (edition, equation, figure, table) for a
   reader to find the number, and do not cite a paper for something it does
   not say.
4. **Limits are stated.** Each model's assumptions and validity range are
   written in its wiki article or in [docs/model-details.md](docs/model-details.md).
   Outside that range the app says the value is unavailable, with a reason,
   rather than returning a confident wrong number.
5. **Nothing non-finite reaches the screen.** User inputs are clamped where
   they enter, and no NaN or infinite coordinate, direction or power may
   reach rendering or export.
6. **Saved setups keep opening.** A scene saved or shared today must still
   open in later versions, either because the format stayed compatible or
   because the app converts it on load. It is not promised the same result
   forever: when a later version fixes a bug or corrects the physics, an old
   scene shows the corrected behaviour, and the pull request says which
   results change and why. If a scene cannot be opened at all, the app shows
   a clear "unsupported version" message naming what is missing, never a
   silent wrong result.

## Ways to contribute

### Without writing code

- **Share a setup.** Press **Propose** in the app toolbar. It sends your
  current sketch and description for review; accepted setups get their own
  page in the Community section. Please write a short text description: what
  the setup is, what it is used for, and anything a reader should notice in
  it, with citations to the papers or books it comes from where relevant.
  You choose whether to publish it under CC BY 4.0 with credit, and it stays
  yours. (The same submission can be made from GitHub with the *Propose a
  community setup* issue form.)
- **Suggest a built-in example.** Open an issue describing the setup and the
  literature it comes from; built-in examples are curated and cite their
  sources.
- **Report a bug or a physics error.** Open an issue with the steps, the
  browser, and if possible a share link or the saved `.json`. For a physics
  error, say what you expected and cite the source.
- **Improve the wiki.** Wiki articles explain the real physics of each
  component and how the app simplifies it. Corrections, clearer wording and
  better sources are very welcome; the text lives in
  `tools/wiki-content.mjs`.

### With code

For anything larger than a small fix, **open an issue first** so the scope
and the model can be agreed before you invest time.

1. **Set up.** Fork the repository, then:

   ```bash
   npm ci          # dev dependencies (KaTeX) for the page generators
   node serve.mjs  # http://localhost:5182 (landing) and /sketch/ (app)
   npm test        # full regression suite
   ```

   The app itself needs no build step and no packages; please keep it that
   way. A new dependency needs a maintainer's explicit approval.
2. **Branch.** Work on a focused branch, one topic per pull request.
3. **Find your route.** [docs/contributor-workflow.md](docs/contributor-workflow.md)
   lists, for each kind of change (wiki text, example, calculator, new
   element, quantitative model...), which files to edit, which generators to
   run and what is easy to miss. Never edit a generated file by hand; commit
   it together with its source.
4. **Test.** New physics or a new surface kind needs a deterministic
   regression test covering normal behaviour and at least one boundary or
   failure case. Never loosen a tolerance or regenerate snapshots just to
   make a test pass; if bundled readings move, explain each change.
5. **Check in a browser.** For UI changes, try the interaction at desktop
   width and near 1024 px, with no console errors and nothing overflowing.
6. **Run the checks** before opening the pull request:

   ```bash
   npm test
   git diff --check
   for file in sketch/js/*.js serve.mjs; do node --check "$file"; done
   ```

## Pull requests and review

A pull request description states:

- what changes for the user;
- the physics scope and its limits (what is modelled, what is not);
- if the saved-scene format is touched, how old scenes keep opening;
- the exact checks you ran.

The `CI / test` check must pass and the branch must be up to date with
`main`. A maintainer then asks for a review; reviews inform the decision, and
the project lead decides when to merge.

**Merging is not publishing.** opticalsetup.com changes only when a release
is cut, by hand, from `main` (see [docs/release-policy.md](docs/release-policy.md)).
Your merged change goes out with the next release.

## AI-assisted contributions

Much of OpticalSetup is developed with AI coding assistants, and you are
welcome to use them too. You remain responsible for what you submit: read
every line, run the checks yourself, and verify every source and number the
assistant produced. Agents working in this repository must follow
[AGENTS.md](AGENTS.md).

## Licence

OpticalSetup is free software under the GNU General Public License,
version 3 or (at your option) any later version; see [LICENSE](LICENSE). By
contributing code or content to the program, you agree that it is
distributed under the same terms. Do not add code or content under a licence
that is incompatible with the GPL.

Community setups are the exception: a submitted scene and its description
stay their author's, and are published under CC BY 4.0 with credit only when
the author chose that on the submission form.

## Citing and credit

If you use OpticalSetup in a publication, please cite it:
[doi.org/10.5281/zenodo.23191537](https://doi.org/10.5281/zenodo.23191537)
(see [CITATION.cff](CITATION.cff)).

Contributors are credited through the project's history: commits and pull
requests carry your name, and the copyright notice covers "Luca Genchi and
the OpticalSetup contributors". Community setups are credited on their own
page, as the author chose on the submission form.

## Questions

Open an issue on
[github.com/LucaGenchi/opticalsetup](https://github.com/LucaGenchi/opticalsetup/issues).
