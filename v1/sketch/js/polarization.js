// Normalized Stokes-vector helpers. s1/s2 describe linear polarization and
// s3 circular handedness; unpolarized light is represented by null.

const D2R = Math.PI / 180;

export function linearStokes(angleDeg = 0) {
  const a = 2 * angleDeg * D2R;
  return { s1: Math.cos(a), s2: Math.sin(a), s3: 0 };
}

export function cloneStokes(stokes) {
  return stokes ? { s1: stokes.s1, s2: stokes.s2, s3: stokes.s3 } : null;
}

export function retarder(stokes, axisDeg, retardanceDeg) {
  if (!stokes) return null;
  const a = 2 * axisDeg * D2R;
  const delta = retardanceDeg * D2R;
  const axis = { x: Math.cos(a), y: Math.sin(a), z: 0 };
  const v = { x: stokes.s1, y: stokes.s2, z: stokes.s3 };
  const c = Math.cos(delta), s = Math.sin(delta);
  const dot = axis.x * v.x + axis.y * v.y;
  const cross = {
    x: axis.y * v.z,
    y: -axis.x * v.z,
    z: axis.x * v.y - axis.y * v.x,
  };
  return {
    s1: v.x * c + cross.x * s + axis.x * dot * (1 - c),
    s2: v.y * c + cross.y * s + axis.y * dot * (1 - c),
    s3: v.z * c + cross.z * s,
  };
}

export function analyzerTransmission(stokes, axisDeg) {
  if (!stokes) return 0.5;
  const a = 2 * axisDeg * D2R;
  return Math.min(1, Math.max(0, 0.5 * (1 + stokes.s1 * Math.cos(a) + stokes.s2 * Math.sin(a))));
}

// The linear-polarization azimuth encoded in a Stokes vector's s1/s2 plane,
// wrapped to [0, 180)° — meaningful for the linear component regardless of
// whether the light is purely linear or elliptical with some circular
// admixture (s3).
export function stokesAngleDeg(stokes) {
  return ((Math.atan2(stokes.s2, stokes.s1) / (2 * D2R)) % 180 + 180) % 180;
}

// Overall degree of polarization: 1 for any pure state, 0 for a fully
// scrambled one. A beam alternating between two orthogonal states (a
// switching EOM at 50% duty, say) averages to the origin of the Poincaré
// sphere, and reporting that as a definite azimuth would be a plain lie —
// the azimuth of a zero-length vector is meaningless.
export const degreeOfPolarization = stokes =>
  (stokes ? Math.min(1, Math.hypot(stokes.s1, stokes.s2, stokes.s3)) : 0);

const DEPOLARIZED = 0.02;

export function legacyPolarization(stokes) {
  if (!stokes) return undefined;
  if (degreeOfPolarization(stokes) < DEPOLARIZED) return undefined;
  if (Math.abs(stokes.s3) > 0.985) return 'c';
  if (Math.abs(stokes.s3) < 0.015) {
    return stokesAngleDeg(stokes);
  }
  return 'e';
}

export function polarizationDescription(stokes) {
  if (!stokes) return 'Unpolarized';
  if (degreeOfPolarization(stokes) < DEPOLARIZED) return 'Unpolarized';
  if (Math.abs(stokes.s3) > 0.985) return stokes.s3 > 0 ? 'Right circular' : 'Left circular';
  const linearDegree = Math.hypot(stokes.s1, stokes.s2);
  const angle = stokesAngleDeg(stokes);
  if (Math.abs(stokes.s3) < 0.015 && linearDegree > 0.985) return `Linear ${Math.round(angle)}°`;
  return `Elliptical ${Math.round(angle)}°`;
}
