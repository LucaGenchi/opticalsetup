# OpticalSetup

OpticalSetup is a qualitative 2D optical-workbench context. Its language distinguishes catalogue-like optical properties from scene relationships and independently placed components.

## Language

**Objective medium**:
The material immediately in front of a microscope objective for which that objective's numerical aperture is specified. It belongs to the objective rather than existing as an independently placed scene element.
_Avoid_: Immersion object, fluid element

**Coupling gap**:
The derived span between an objective's front and a nearby compatible optical target. It follows its endpoints rather than being positioned independently.
It selects an explicit contact from authored geometry, follows that same target during motion, and is neither independently stored nor selectable.
_Avoid_: Snap medium
