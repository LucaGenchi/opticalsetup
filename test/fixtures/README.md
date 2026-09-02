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
