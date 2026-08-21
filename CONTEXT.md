# OpticalSetup

OpticalSetup is a qualitative 2D optical-workbench context. Its language distinguishes catalogue-like optical properties from scene relationships and independently placed components.

## Language

**Objective medium**:
The material immediately in front of a microscope objective for which that objective's numerical aperture is specified. It belongs to the objective rather than existing as an independently placed scene element.
_Avoid_: Immersion object, fluid element

**Objective effective focal length**:
The objective's catalogue focal-length specification. For an infinity-corrected objective it combines with the reference tube lens to determine magnification; it does not locate an internal principal plane in OpticalSetup's black-box trace model.
_Avoid_: Working distance

**Working distance**:
The axial distance from the objective's front boundary to its nominal in-focus specimen plane. It is an objective design property, distinct from effective focal length and not determined by the objective medium alone.
_Avoid_: Focal length

**Rated numerical aperture**:
The objective's medium-qualified light-gathering specification. Together with the objective medium's refractive index it determines the object-space acceptance half-angle.
_Avoid_: Aperture diameter

**Immersion bridge**:
The derived liquid volume between an immersion objective's front boundary and a nearby compatible optical contact. Its visible boundary is a schematic meniscus that follows its endpoints rather than being positioned independently.
It selects an explicit contact from authored geometry, follows that same target during motion, and is neither independently stored nor selectable.
_Avoid_: Snap medium, coupling gap
