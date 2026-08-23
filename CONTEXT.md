# OpticalSetup

OpticalSetup is a qualitative 2D optical-workbench context. Its language distinguishes catalogue-like optical properties from scene relationships and independently placed components.

## Language

**Objective medium**:
The material immediately in front of a microscope objective for which that objective's numerical aperture is specified. It belongs to the objective rather than existing as an independently placed scene element.
_Avoid_: Immersion object, fluid element

**Objective focus distance (working distance)**:
The axial distance from the objective's fixed front plane to its nominal in-focus specimen plane. In OpticalSetup's deliberately simple ideal-plane model it is also the focal distance, so collimated and point-source tracing are reciprocal.
_Avoid_: Independent EFL, magnification preset

**Objective clear aperture**:
The physical opening inside the fixed objective nose. It can limit the accepted cone and effective NA, but never resizes the outer housing.
_Avoid_: Back-pupil fill

**Rated numerical aperture**:
The objective's medium-qualified requested light-gathering specification. Together with the objective medium's refractive index it determines the requested object-space acceptance half-angle; the clear aperture may lower the effective NA.
_Avoid_: Aperture diameter

**Immersion bridge**:
The derived liquid volume between an immersion objective's front boundary and a nearby compatible optical contact. Its visible boundary is a schematic meniscus that follows its endpoints rather than being positioned independently.
It selects an explicit contact from authored geometry, follows that same target during motion, and is neither independently stored nor selectable.
_Avoid_: Snap medium, coupling gap
