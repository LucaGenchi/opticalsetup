# Test fixtures

Scenes the test suite traces against.

`mach-zehnder.json` is a single Mach–Zehnder interferometer: a sized
monochromatic CW laser, two beamsplitters, two folding mirrors, a delay line
in one arm, and a camera on each output port. Most of the coherent-tracing
tests are built on it, because it is the smallest scene in which two routes
from one source recombine.

It began as a copy of the bundled example of the same name and is now kept
separately on purpose. The example is a teaching scene and will keep changing
as the app gains things worth showing — it now carries three interferometers
rather than one — while these tests need a fixed geometry with exactly two
ports to make assertions about. Tying them to the example meant every
improvement to it broke twenty tests that had no opinion about the example at
all.

`optiland-cooke-triplet.json` is the lens designer's second check: the Cooke
triplet preset traced by Optiland 0.5.5 (paraxial data, 63 individual rays,
and RMS spots on the app's 64 × 64 pupil grid), written by
`optiland-cooke-triplet.py`. That script needs Optiland and is not run by the
suite; the JSON records what it printed.
