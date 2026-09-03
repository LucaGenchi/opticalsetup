// Copy and paste for the sketch. The pure half lives here so the rules that
// are easy to get quietly wrong -- singletons, and the sensor links that hold
// a detector screen to its detector -- can be tested without a DOM.

const clone = value => JSON.parse(JSON.stringify(value));

// What of a selection can actually be copied. A singleton is excluded: there
// can only ever be one of it, so carrying it would only produce a paste that
// silently dropped part of what was copied.
export function copyableSelection({ els = [], beams = [] }, isSingleton = () => false) {
  const copyable = els.filter(el => !isSingleton(el.type));
  if (!copyable.length && !beams.length) return null;
  return { els: copyable.map(clone), beams: beams.map(clone) };
}

// Build the pasted objects. Ids are reassigned, positions are offset, and any
// reference from one pasted object to another is rewritten to the copy --
// otherwise a detector screen pasted together with its detector would keep
// reading the original, which looks like a working paste until the reading
// disagrees with what is on screen.
export function pasteObjects(clipboard, {
  offset = 30, newId, hasType = () => false, isSingleton = () => false,
} = {}) {
  if (!clipboard) return null;
  const els = (clipboard.els || []).filter(el => !(isSingleton(el.type) && hasType(el.type)));
  const beams = clipboard.beams || [];
  if (!els.length && !beams.length) return null;

  const remap = new Map();
  const newEls = els.map(src => {
    const copy = clone(src);
    copy.id = newId('e');
    remap.set(src.id, copy.id);
    copy.x += offset; copy.y += offset;
    return copy;
  });
  const newBeams = beams.map(src => {
    const copy = clone(src);
    copy.id = newId('b');
    remap.set(src.id, copy.id);
    for (const pt of copy.pts || []) { pt.x += offset; pt.y += offset; }
    return copy;
  });
  for (const el of newEls) {
    const linked = el.params?.sensorId;
    if (linked && remap.has(linked)) el.params.sensorId = remap.get(linked);
  }
  return { els: newEls, beams: newBeams, remap };
}
