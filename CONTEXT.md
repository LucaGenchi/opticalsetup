# OpticalSetup

OpticalSetup is a qualitative 2D optical-workbench context. Its language distinguishes catalogue-like optical properties from scene relationships and independently placed components.

## Language

**Objective medium**:
The material immediately in front of a microscope objective for which that objective's numerical aperture is specified. It belongs to the objective rather than existing as an independently placed scene element.
_Avoid_: Immersion object, fluid element

**Objective effective focal length**:
The Infinity-corrected objective's catalogue focal-length specification. It combines with the reference tube lens to determine magnification and places an equivalent optical plane independently of working distance; long-working-distance designs may place that plane virtually ahead of the nose.
_Avoid_: Working distance

**Working distance**:
The axial distance from an objective's front boundary to its nominal in-focus specimen plane. In the Infinity-corrected objective it remains distinct from EFL; in the Ideal focusing objective it is also the ideal plane's focal distance.
_Avoid_: Objective model selection

**Ideal focusing objective clear aperture**:
The directly resizable physical opening at the Ideal focusing objective's fixed front plane. It can limit the accepted cone and aperture-limited NA, while the housing height follows it with fixed shell padding.
_Avoid_: Infinity-corrected objective back pupil

**Rated numerical aperture**:
The objective's medium-qualified light-gathering specification. In the Infinity-corrected objective it sets the modeled back pupil; in the Ideal focusing objective it requests an object-space cone that the clear aperture may limit.
_Avoid_: Aperture diameter

**Immersion bridge**:
The derived liquid volume between an immersion objective's front boundary and a nearby compatible optical contact. Its visible boundary is a schematic meniscus that follows its endpoints rather than being positioned independently.
It selects an explicit contact from authored geometry, follows that same target during motion, and is neither independently stored nor selectable.
_Avoid_: Snap medium, coupling gap
