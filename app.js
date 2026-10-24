/* ============================================================
   Qubit Survival Quest — game logic
   ------------------------------------------------------------
   File map (top to bottom):
     1. PHYSICS  Complex 2-vectors. A qubit's state vector and a photon's
                 Jones (polarization) vector are the same mathematical
                 object, so one set of math serves both qubit styles:
                 |0>=H, |1>=V, |+>=+45deg, |->=-45deg, |+i>=L, |-i>=R.
                 |+-i> = (|0> +- i|1>)/sqrt2, the standard QI definitions
                 (|+i> is Y's +1 eigenstate). Handedness names follow the
                 lab's optics (Hecht) convention, where right-circular is
                 (1, -i)/sqrt2 — so |+i> is LEFT-circular here. Under the
                 helicity convention the names would swap; the physics
                 wouldn't.
     2. STATES   The six states the game can ever reach (every object
                 maps this set back into itself — verified in testing).
     3. DECK     Every object is ONE abstract card with three renderings
                 (Bra-Ket, Polarization and Analogy). Gameplay only ever touches
                 the abstract card, which is why the qubit style can be
                 switched mid-game without changing anything about the
                 run: switching only re-renders.
     4. RULES    Drawing, resolving a play, par. Same rules as the
                 Superposition and Measurement Lab's Game mode.
     5. MARKUP   Pure functions turning a state/card into HTML/SVG for
                 any style (design notes inline).
     6. UI       Screens, rendering, input, pacing. Only starts in a
                 browser (guarded at the very bottom), so sections 1–4
                 can be loaded headless for simulation/testing.

   Security notes:
     - Rendering uses innerHTML for speed and brevity. That is safe ONLY
       because every string inserted is built from constants in this file
       (CARDS, STATES, TEXT, KET_SYM, ...) and numbers the code generates.
       Nothing typed, pasted, loaded from the URL, or read from storage
       ever reaches markup. If you ever add user-provided text (a player
       name, a URL parameter), set it with textContent, or escape it,
       never splice it into these templates.
     - Values read back from the page (data-* attributes on buttons) are
       validated before use: see playCard() and setDomain().
     - index.html sets a strict Content-Security-Policy (no inline script,
       no eval, no network requests). Keep all script in .js files, and
       don't put style="..." attributes in generated markup; set
       element.style from code instead, which the policy allows.
   ============================================================ */
'use strict';

/* ===================== 1. PHYSICS ===================== */

// Minimal complex arithmetic. A complex number is a plain { re, im } object;
// a 2-component state (qubit or Jones vector) is { x: complex, y: complex }.
function toRad(deg){ return deg * Math.PI / 180; }
function cx(re, im){ return { re: re, im: im || 0 }; }
function cAdd(a, b){ return cx(a.re + b.re, a.im + b.im); }
function cScale(a, k){ return cx(a.re * k, a.im * k); }
function cMul(a, b){ return cx(a.re*b.re - a.im*b.im, a.re*b.im + a.im*b.re); }
function cConj(a){ return cx(a.re, -a.im); }
function cAbs2(a){ return a.re*a.re + a.im*a.im; }

// Linear state at `deg` degrees: 0 = |0> (horizontal), 90 = |1> (vertical),
// +45 = |+>, -45 = |->. Real amplitudes, (cos, sin).
function vecLinear(deg){
  const r = toRad(deg);
  return { x: cx(Math.cos(r)), y: cx(Math.sin(r)) };
}
// Circular state. Uses the optics (Hecht) handedness convention, in which
// 'R' = (1, -i)/sqrt2 and 'L' = (1, i)/sqrt2 — so 'L' is |+i> and 'R' is |-i>
// (see the STATES table and the section-1 header).
function vecCircular(h){
  const a = Math.SQRT1_2;
  return h === 'R' ? { x: cx(a), y: cx(0, -a) } : { x: cx(a), y: cx(0, a) };
}
// <a|v>
function inner(a, v){ return cAdd(cMul(cConj(a.x), v.x), cMul(cConj(a.y), v.y)); }

// Projective measurement onto `axis`: Born-rule survival probability,
// and on survival the state collapses to the axis itself.
function project(v, axis){ return { prob: cAbs2(inner(axis, v)), out: axis }; }

// Half-wave plate with fast axis at `deg` (Z at 0, X at 45, H at 22.5).
function applyHWP(v, deg){
  const r = toRad(deg), c2 = Math.cos(2*r), s2 = Math.sin(2*r);
  return { prob: 1, out: {
    x: cAdd(cScale(v.x, c2), cScale(v.y, s2)),
    y: cAdd(cScale(v.x, s2), cScale(v.y, -c2))
  }};
}
// Quarter-wave plate with fast axis at `deg` (basis changes X<->Y at 0,
// Z<->Y at 45) — same matrix as the lab's.
function applyQWP(v, deg){
  const r = toRad(deg), c = Math.cos(r), s = Math.sin(r);
  const c2 = c*c, s2 = s*s, sc = s*c;
  const M00 = cx(c2, s2), M01 = cx(-sc, sc), M11 = cx(s2, c2);
  return { prob: 1, out: {
    x: cAdd(cMul(M00, v.x), cMul(M01, v.y)),
    y: cAdd(cMul(M01, v.x), cMul(M11, v.y))
  }};
}
// Pauli Y. Its eigenstates are |+i> and |-i> (right/left circular), with
// eigenvalues +1 and -1: a pi phase shift between the two circular
// components. That is circular birefringence, i.e. optical activity, which
// rotates linear polarization by half the phase difference: 90 degrees.
// So Y = i * R(90deg), a 90-degree rotation up to an unobservable global
// phase; its Polarization twin is an optically active material — maple
// syrup (a sugar solution) of the right thickness. At exactly 90 degrees
// the rotation's direction doesn't matter: R(-90) = -R(90). (A half-wave
// plate can't do this — its matrix is a reflection, determinant -1.)
function applyY(v){
  return { prob: 1, out: { x: cMul(cx(0, -1), v.y), y: cMul(cx(0, 1), v.x) } };
}
// Analogy style's basis changes. Bra-Ket and Polarization use real
// quarter-wave plates, which turn the sphere a quarter-turn: Z <-> Y comes
// out as |0> -> |+i> but |+i> -> |1>, i.e. one direction arrives flipped.
// Analogy instead exchanges the two bases exactly, the way Hadamard
// exchanges Z and X: Z <-> Y (|0> <-> |+i>, |1> <-> |-i>) or X <-> Y
// (|+> <-> |+i>, |-> <-> |-i>), and, like Hadamard, flips the third basis.
// That is a half-turn about an axis halfway between the two swapped ones
// (swapping two bases WITHOUT flipping the third would be a mirror image of
// the sphere, which no gate can do). Physically it is a half-wave plate
// followed by a quarter-wave plate. Because the two versions differ, an
// Analogy run can't switch to the other styles mid-game (see setDomain).
function applySwapZY(v){ return applyQWP(applyHWP(v, 0).out, 45); }
function applySwapXY(v){ return applyQWP(applyHWP(v, 45).out, 0); }
// Identity gate / clear glass: always passes, state unchanged.
function applyIdentity(v){ return { prob: 1, out: v }; }

/* ===================== 2. STATES ===================== */

// `pol` describes how the state is DRAWN in Polarization style: a
// double-headed arrow at `angle`, or a circle with handedness arrows.
// `an` is the Analogy style's one known box and its bit: each basis's +1
// eigenstate reads 0 and its -1 eigenstate reads 1 (the other two boxes
// are random).
const STATES = [
  { key: '0',  vec: vecLinear(0),     pol: { name: 'Horizontal',    angle: 0 },   an: ['Z', 0] },
  { key: '1',  vec: vecLinear(90),    pol: { name: 'Vertical',      angle: 90 },  an: ['Z', 1] },
  { key: '+',  vec: vecLinear(45),    pol: { name: '+45\u00b0 diagonal', angle: 45 },  an: ['X', 0] },
  { key: '-',  vec: vecLinear(-45),   pol: { name: '\u221245\u00b0 diagonal', angle: -45 }, an: ['X', 1] },
  { key: '+i', vec: vecCircular('L'), pol: { name: 'Left circular',  circ: 'L' }, an: ['Y', 0] },
  { key: '-i', vec: vecCircular('R'), pol: { name: 'Right circular', circ: 'R' }, an: ['Y', 1] }
];

// Which canonical state a vector is, up to global phase (|<s|v>|^2 = 1).
function stateKeyOf(v){
  for (const s of STATES){
    if (Math.abs(cAbs2(inner(s.vec, v)) - 1) < 1e-6) return s.key;
  }
  return null; // never happens for reachable states
}
// Look up one of the six canonical states by its key ('0', '1', '+', '-', '+i', '-i').
function stateByKey(key){ return STATES.find(s => s.key === key); }

/* ===================== 3. DECK ===================== */

// One entry per object. `cat` drives the rules (projector = measurement
// that can absorb; unitary = always passes). `bk`, `pol` and `an` are the
// three twin renderings; `complexOnly` objects are removed in Real-only games
// (they are exactly the ones that reach the |+-i> / circular states).
// `an` (Analogy style) says what the object does to the X/Y/Z boxes:
// declare [box, bit], or swap [[a, b]] then flip [boxes]. An `an.apply`
// replaces `apply` in Analogy runs (only the two basis changes have one).
// Testing checks every `an` entry against its matrix on all six states.
const CARDS = {
  P0:   { cat: 'projector', apply: v => project(v, vecLinear(0)),     bk: { sym: '0' },  pol: { type: 'polarizer', angle: 0,   name: 'Horizontal Polarizer' }, an: { declare: ['Z', 0] } },
  P1:   { cat: 'projector', apply: v => project(v, vecLinear(90)),    bk: { sym: '1' },  pol: { type: 'polarizer', angle: 90,  name: 'Vertical Polarizer' },   an: { declare: ['Z', 1] } },
  PP:   { cat: 'projector', apply: v => project(v, vecLinear(45)),    bk: { sym: '+' },  pol: { type: 'polarizer', angle: 45,  name: '+45\u00b0 Polarizer' },  an: { declare: ['X', 0] } },
  PM:   { cat: 'projector', apply: v => project(v, vecLinear(-45)),   bk: { sym: '-' },  pol: { type: 'polarizer', angle: -45, name: '\u221245\u00b0 Polarizer' }, an: { declare: ['X', 1] } },
  PR:   { cat: 'projector', apply: v => project(v, vecCircular('R')), bk: { sym: '-i' }, pol: { type: 'polarizer', circ: 'R', name: 'Right-Circular Polarizer' }, an: { declare: ['Y', 1] }, complexOnly: true },
  PL:   { cat: 'projector', apply: v => project(v, vecCircular('L')), bk: { sym: '+i' }, pol: { type: 'polarizer', circ: 'L', name: 'Left-Circular Polarizer' },  an: { declare: ['Y', 0] }, complexOnly: true },
  GZ:   { cat: 'unitary', apply: v => applyHWP(v, 0),    bk: { gate: 'Z',   name: 'Pauli-Z Gate' },  pol: { type: 'hwp', angle: 0,    name: 'Half Wave-Plate (0\u00b0)' },   an: { flip: ['X', 'Y'] } },
  GX:   { cat: 'unitary', apply: v => applyHWP(v, 45),   bk: { gate: 'X',   name: 'Pauli-X Gate' },  pol: { type: 'hwp', angle: 45,   name: 'Half Wave-Plate (45\u00b0)' },  an: { flip: ['Z', 'Y'] } },
  GY:   { cat: 'unitary', apply: applyY,                 bk: { gate: 'Y',   name: 'Pauli-Y Gate' },  pol: { type: 'syrup',            name: 'Maple Syrup (optically active)' }, an: { flip: ['Z', 'X'] } },
  GH:   { cat: 'unitary', apply: v => applyHWP(v, 22.5), bk: { gate: 'H',   name: 'Hadamard Gate' }, pol: { type: 'hwp', angle: 22.5, name: 'Half Wave-Plate (22.5\u00b0)' }, an: { swap: [['X', 'Z']], flip: ['Y'] } },
  GUZY: { cat: 'unitary', apply: v => applyQWP(v, 45),   bk: { gate: 'UZY', name: 'Basis Change (Z\u2194Y)' }, pol: { type: 'qwp', angle: 45, name: 'Quarter Wave-Plate (45\u00b0)' }, an: { swap: [['Z', 'Y']], flip: ['X'], apply: applySwapZY }, complexOnly: true },
  GUXY: { cat: 'unitary', apply: v => applyQWP(v, 0),    bk: { gate: 'UXY', name: 'Basis Change (X\u2194Y)' }, pol: { type: 'qwp', angle: 0,  name: 'Quarter Wave-Plate (0\u00b0)' },  an: { swap: [['X', 'Y']], flip: ['Z'], apply: applySwapXY }, complexOnly: true },
  GI:   { cat: 'unitary', apply: applyIdentity,          bk: { gate: 'I',   name: 'Identity Gate' }, pol: { type: 'glass',            name: 'Clear Glass' },                  an: {} }
};
const CARD_ORDER = ['P0', 'P1', 'PP', 'PM', 'PL', 'PR', 'GZ', 'GX', 'GY', 'GH', 'GUZY', 'GUXY', 'GI'];

/* ===================== 4. RULES ===================== */

// The deck for a Numbers setting: all 13 objects for Complex; Real-only drops
// the four complexOnly objects (circular projectors, basis changes), leaving 9.
// Order follows CARD_ORDER; drawing is uniform within each category.
function poolFor(complex){
  return CARD_ORDER.filter(id => complex || !CARDS[id].complexOnly);
}

// Same weighting as the lab's Game mode: projectors are drawn twice as
// often as gates (a 1-in-3 chance of drawing from the gate category),
// uniform within each category.
function drawCard(complex, rng){
  rng = rng || Math.random;
  const pool = poolFor(complex);
  const projectors = pool.filter(id => CARDS[id].cat === 'projector');
  const unitaries = pool.filter(id => CARDS[id].cat === 'unitary');
  const from = rng() < 1/3 ? unitaries : projectors;
  return from[Math.floor(rng() * from.length)];
}

// Buckets a Born-rule probability into certain pass / certain loss / coin
// flip. Every probability this deck can produce is exactly 0, 1/2 or 1 (the
// states form a closed set); the 0.01 margins only absorb floating-point error.
function classify(prob){
  if (prob > 0.99) return 'transmit';
  if (prob < 0.01) return 'absorbed';
  return 'random';
}

// The matrix a card applies: its Analogy version in Analogy runs, if it has
// one (the basis changes), otherwise the shared one.
function applyFor(id, analogy){
  const c = CARDS[id];
  return (analogy && c.an.apply) || c.apply;
}

// Resolves playing card `id` on state `v` (`analogy`: an Analogy run).
// `outcome` is exactly one of the lab's message kinds: success | lucky |
// rotated | unchanged (the qubit survived) or unlucky | orthogonal (it was
// lost, and why).
function resolvePlay(v, id, rng, analogy){
  rng = rng || Math.random;
  const card = CARDS[id];
  const r = applyFor(id, analogy)(v);
  const cls = classify(r.prob);
  const survives = cls === 'transmit' ? true : (cls === 'absorbed' ? false : rng() < r.prob);
  let outcome;
  if (!survives) outcome = cls === 'random' ? 'unlucky' : 'orthogonal';
  else if (card.cat === 'unitary') outcome = stateKeyOf(v) === stateKeyOf(r.out) ? 'unchanged' : 'rotated';
  else outcome = cls === 'random' ? 'lucky' : 'success';
  return { survives: survives, out: r.out, prob: r.prob, outcome: outcome };
}

// Par = mean streak (rounded) for a careful player who always plays a
// guaranteed-safe object when holding one, else a 50/50 object — from a
// 500,000-game Monte Carlo per setting. Bra-Ket and Polarization share one
// deck, so they share par. (Matches the lab's Bra-Ket par values.) Analogy's
// exact-swap basis changes nudge the Three Box mean up by about 0.1 (about
// 5.4 -> 5.45 over 300,000 games each), which still rounds to the same par;
// Two Box has no basis changes, so it is identical to Real-only.
const PAR = { real: 7, complex: 5 };

/* ===================== 5. MARKUP ===================== */
/* Design reference — how every tile is built:
   - A "tile" is a square box (.tile) sized by the --tile variable of
     whatever contains it (stage, hand card, history strip, preview).
     Everything inside scales with it (container-query units).
   - STATE tiles (.tile-state) are the qubit itself: dark glass with a
     glowing cyan edge. In Bra-Ket style they hold a ket (|0>, ...); in
     Polarization style, a cyan double-headed arrow (linear) or a circle
     with handedness arrows (circular).
   - OBJECT tiles follow the lab's color convention: dark = measurement
     (projector / polarizer), pale blue = transformation (gate, wave-plate,
     maple syrup is amber, like the real thing), pale pink = quarter-wave
     plate, near-white = identity
     (clear glass). Polarization objects are drawn as SVG (viewBox
     -36..36, a 56-unit rounded square that ROTATES with the object's
     angle, exactly like the lab); Bra-Ket objects are HTML text on an
     inset rounded square of the same proportions. Analogy objects are
     SVG on the same square, never rotated (see the Analogy notes below).
   - Arrowheads come from the hidden <marker> library at the top of
     index.html (ids qsq-arrow-*), shared by every SVG on the page. */

const KET_SYM = { '0': '0', '1': '1', '+': '+', '-': '\u2212', '+i': '+<sub>i</sub>', '-i': '\u2212<sub>i</sub>' };
// Spoken forms for screen readers ("ket plus i"), used in aria-labels.
const KET_SPOKEN = { '0': 'ket 0', '1': 'ket 1', '+': 'ket plus', '-': 'ket minus', '+i': 'ket plus i', '-i': 'ket minus i' };

// Kets are drawn with a CSS bar and an SVG angle bracket (instead of font
// glyphs or KaTeX) so the bar and bracket are always exactly the same
// height, and nothing needs to load from a CDN — the game works offline.
const ANGLE_R = '<svg class="k-angle" viewBox="0 0 8 30" aria-hidden="true"><polyline points="1.2,1 6.8,15 1.2,29"/></svg>';
const ANGLE_L = '<svg class="k-angle" viewBox="0 0 8 30" aria-hidden="true"><polyline points="6.8,1 1.2,15 6.8,29"/></svg>';
// A ket |k> as HTML: CSS bar + symbol + SVG right angle bracket. Scales with
// the surrounding font size, so it works in tiles, card names and captions.
function ketHTML(k){
  return '<span class="ket" role="img" aria-label="' + KET_SPOKEN[k] + '"><span class="k-bar"></span><span class="k-sym">' + KET_SYM[k] + '</span>' + ANGLE_R + '</span>';
}
// A projector |k><k| as HTML, built from the same bar/bracket pieces as ketHTML.
function projectorHTML(k){
  return '<span class="ket" role="img" aria-label="projector onto ' + KET_SPOKEN[k] + '"><span class="k-bar"></span><span class="k-sym">' + KET_SYM[k] + '</span>' + ANGLE_R +
         ANGLE_L + '<span class="k-sym">' + KET_SYM[k] + '</span><span class="k-bar"></span></span>';
}

// ---- Polarization SVG pieces (ported from the lab's icon code) ----
const ARC_RANGES = [[25, 155], [205, 335]]; // two ~130-degree arcs on opposite sides
function arcD(r, t1, t2, clockwise){
  const from = clockwise ? t2 : t1, to = clockwise ? t1 : t2;
  let d = '';
  for (let k = 0; k <= 10; k++){
    const t = toRad(from + (to - from) * (k / 10));
    d += (k === 0 ? 'M' : 'L') + (r * Math.cos(t)).toFixed(2) + ',' + (-r * Math.sin(t)).toFixed(2) + ' ';
  }
  return d.trim();
}
// A circle of radius r with two handedness arrows just outside it.
function circleWithArcs(r, clockwise, circleClass, arcClass, marker){
  return '<circle class="' + circleClass + '" cx="0" cy="0" r="' + r + '"/>' +
    ARC_RANGES.map(([a, b]) => '<path class="' + arcClass + '" d="' + arcD(r + 4, a, b, clockwise) + '" marker-end="url(#' + marker + ')"/>').join('');
}
// Objects use a 72-unit canvas around their 56-unit square, leaving room
// for the square to rotate without crowding its label; state pictures sit
// inside the glowing state tile, so they use a tighter 64-unit canvas.
function svgWrap(inner, half){
  half = half || 36;
  return '<svg class="face-svg" viewBox="' + (-half) + ' ' + (-half) + ' ' + (2*half) + ' ' + (2*half) + '" aria-hidden="true">' + inner + '</svg>';
}
const SQUARE = (cls) => '<rect class="sq ' + cls + '" x="-28" y="-28" width="56" height="56" rx="11"/>';

// SVG face for a Polarization-style object (see the design reference above).
// `pol` is the object's `pol` entry in CARDS: type + angle/circ.
function polCardSVG(pol){
  if (pol.type === 'polarizer'){
    if (pol.circ){
      return svgWrap(SQUARE('sq-meas') + circleWithArcs(11, pol.circ === 'R', 'circ-icon', 'circ-arc', 'qsq-arrow-white'));
    }
    return svgWrap('<g transform="rotate(' + (-pol.angle) + ')">' + SQUARE('sq-meas') +
      '<line class="pol-axis" x1="-19" y1="0" x2="19" y2="0" marker-start="url(#qsq-arrow-white)" marker-end="url(#qsq-arrow-white)"/></g>');
  }
  if (pol.type === 'hwp' || pol.type === 'qwp'){
    return svgWrap('<g transform="rotate(' + (-pol.angle) + ')">' + SQUARE(pol.type === 'qwp' ? 'sq-qwp' : 'sq-hwp') +
      '<line class="wp-slow" x1="0" y1="-24" x2="0" y2="24"/><line class="wp-fast" x1="-24" y1="0" x2="24" y2="0"/></g>');
  }
  if (pol.type === 'syrup'){
    // Maple syrup: an amber square with syrup dripping from its top edge
    // (drips clipped to the square's rounded shape via #qsq-square-clip),
    // plus a counter-clockwise 270-degree "rotate" arrow around "90°" so
    // what it does stays readable. The gradient and clip live in the
    // shared <defs> in index.html.
    const r = 12.5, cy = 7;
    const p = (deg) => (r * Math.cos(toRad(deg))).toFixed(2) + ',' + (cy - r * Math.sin(toRad(deg))).toFixed(2);
    return svgWrap(
      '<g clip-path="url(#qsq-square-clip)">' +
        '<rect x="-28" y="-28" width="56" height="56" fill="url(#qsq-syrup-fill)"/>' +
        '<path class="syrup-drip" d="M-28,-28 H28 V-19 C25,-19 24.5,-13 22,-13 C19.5,-13 19,-19 16,-19 H4 ' +
          'C1.5,-19 1.5,-11 -1,-11 C-3.5,-11 -3.5,-19 -6,-19 H-15 C-17,-19 -17,-14 -19,-14 C-21,-14 -21,-19 -28,-19 Z"/>' +
        '<path class="syrup-shine" d="M-21,-6 L-21,16"/>' +
      '</g>' +
      SQUARE('sq-syrup') +
      '<path class="rot-arc" d="M' + p(60) + ' A' + r + ' ' + r + ' 0 1 0 ' + p(330) + '" marker-end="url(#qsq-arrow-ink)"/>' +
      '<text class="rot-text syrup-text" x="0" y="' + (cy + 0.5) + '">90\u00b0</text>');
  }
  // glass
  return svgWrap(SQUARE('sq-glass') + '<path class="glass-glare" d="M-17,6 L6,-17 M-9,14 L14,-9"/>');
}

// SVG face for a Polarization-style STATE: a cyan double-headed arrow at the
// polarization angle, or a circle with handedness arrows for circular light.
// Uses the tighter 64-unit canvas because it sits inside the state tile.
function polStateSVG(pol){
  if (pol.circ) return svgWrap(circleWithArcs(10, pol.circ === 'R', 'state-circ', 'state-arc', 'qsq-arrow-state-small'), 32);
  return svgWrap('<g transform="rotate(' + (-pol.angle) + ')"><line class="state-axis" x1="-19" y1="0" x2="19" y2="0" ' +
    'marker-start="url(#qsq-arrow-state)" marker-end="url(#qsq-arrow-state)"/></g>', 32);
}

// Inner content of a Bra-Ket-style object tile: a projector's |k><k|, the blue
// "U" for the two basis changes, or the gate's letter.
function bkCardInner(bk){
  if (bk.sym !== undefined) return projectorHTML(bk.sym);
  if (bk.gate === 'UXY' || bk.gate === 'UZY') return '<span class="gate-letter gate-u">U</span>';
  return '<span class="gate-letter">' + bk.gate + '</span>';
}

// Display name of an object in the given style. plain=true returns text only
// (for aria-labels); otherwise projector names include a rendered ket.
function cardName(id, domain, plain, three){
  const c = CARDS[id];
  if (domain === 'polarization') return c.pol.name;
  if (domain === 'analogy') return anCardName(c.an, anThree(three), plain);
  if (c.cat === 'projector') return 'Projector onto ' + (plain ? KET_SPOKEN[c.bk.sym] : ketHTML(c.bk.sym));
  return c.bk.name;
}
// Bra-Ket caption: the state written out in the |0>,|1> basis, e.g.
// (|0> + i|1>) over sqrt(2) as a stacked fraction; |0> and |1> are just
// themselves. Polarization caption: the polarization's name.
function basisHTML(key){
  if (key === '0' || key === '1') return ketHTML(key);
  const sign = (key === '+' || key === '+i') ? '+' : '\u2212';
  const i = key.endsWith('i') ? '<i class="imag">i</i>' : '';
  const spoken = 'ket 0 ' + (sign === '+' ? 'plus' : 'minus') + (i ? ' i' : '') + ' ket 1, over square root of 2';
  return '<span class="frac" role="img" aria-label="' + spoken + '"><span class="frac-num">' + ketHTML('0') + '<span class="op">' + sign + '</span>' + i + ketHTML('1') + '</span>' +
         '<span class="frac-den"><span class="sqrt">\u221a<span class="sqrt-arg">2</span></span></span></span>';
}
// Spoken name of a state, for announcements.
function stateSpoken(key, domain){
  if (domain === 'analogy') return anStateText(key, anThree(), true);
  return domain === 'polarization' ? stateByKey(key).pol.name.toLowerCase() + ' polarization' : KET_SPOKEN[key];
}
function stateName(key, domain){
  if (domain === 'analogy') return anStateText(key, anThree());
  return domain === 'polarization' ? stateByKey(key).pol.name : basisHTML(key);
}

// Whole tiles. `extra` adds modifier classes (e.g. "dull" for the prior state).
// `three` (Analogy only) overrides the Two/Three Box setting; see anThree().
function cardTileHTML(id, domain, extra, three){
  const c = CARDS[id];
  const label = cardName(id, domain, true, three);
  let face;
  if (domain === 'polarization'){
    face = '<div class="face">' + polCardSVG(c.pol) + '</div>';
  } else if (domain === 'analogy'){
    face = '<div class="face">' + anCardSVG(c.an, anThree(three)) + '</div>';
  } else {
    face = '<div class="face face-bk ' + (c.cat === 'projector' ? 'face-meas' : (c.bk.gate === 'I' ? 'face-glass' : 'face-gate')) + '">' + bkCardInner(c.bk) + '</div>';
  }
  return '<div class="tile tile-object ' + (extra || '') + '" role="img" aria-label="' + label + '">' + face + '</div>';
}
// A whole STATE tile (the glowing qubit box) for any style. `extra` adds
// modifier classes: 'dull' (prior state), 'pop-in', 'mini' (history strip).
function stateTileHTML(key, domain, extra){
  const s = stateByKey(key);
  const face = domain === 'polarization' ? '<div class="face">' + polStateSVG(s.pol) + '</div>'
    : domain === 'analogy' ? '<div class="face">' + anStateSVG(key, anThree()) + '</div>'
    : '<div class="face face-ket">' + ketHTML(key) + '</div>';
  const label = stateSpoken(key, domain);
  return '<div class="tile tile-state ' + (extra || '') + '" role="img" aria-label="' + label + '">' + face + '</div>';
}

/* ---- Analogy style ----
   The qubit is three boxes, one per measurement basis: X (red), Y (green),
   Z (blue). Exactly one box is known (0 or 1); the other two are random.
   Real-only games ("Two Box") never reach the Y basis, so Y is hidden
   everywhere: on cards, the stage and in names.
   Card faces use one fixed layout: Y on top, X bottom-left, Z bottom-right
   (or just X and Z side by side), so each pair of boxes shares an edge. A
   double arrow on an edge = the two boxes exchange values; a ring of arrows
   around a box = its value flips; a dashed outline = unaffected. When a
   card does both, swaps happen first, then flips (no card ever swaps and
   flips the same box). The big stage boxes are HTML (see anBoxesHTML), so
   they can animate. */
const AN_POS = {
  3: { Y: [0, -15], X: [-16, 12], Z: [16, 12] },
  2: { X: [-14, 0], Z: [14, 0] }
};
// Which boxes a game shows: all three, or X and Z for Two Box games.
// `three` is explicit for pictures that ignore the setting (the equivalents
// table always shows all three); otherwise it follows the Numbers setting.
function anThree(three){ return three !== undefined ? three : settings.complex; }
function anBoxes(three){ return three ? ['X', 'Y', 'Z'] : ['X', 'Z']; }

// One card-face box: `mode` is 'blank' (dashed: unaffected), 'on' (touched
// by the gate), or 'declare' (a bigger filled box reading e.g. "Z=1").
function anBoxSVG(b, p, s, mode, bit){
  const x = p[0] - s/2, y = p[1] - s/2;
  const rect = (cls) => '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" rx="' + (s * 0.24).toFixed(1) + '"/>';
  if (mode === 'blank') return rect('an-blank');
  if (mode === 'blank-dark') return rect('an-blank on-dark');
  if (mode === 'declare') return rect('an-solid an-col-' + b) + '<text class="an-dtext" x="' + p[0] + '" y="' + (p[1] + 0.5) + '">' + b + '=' + bit + '</text>';
  return rect('an-tint an-col-' + b) + '<text class="an-letter an-ink-' + b + '" x="' + p[0] + '" y="' + (p[1] + 0.5) + '">' + b + '</text>';
}
// Flip: two arcs of arrows circling the box.
function anRingSVG(p, r){
  return [[30, 150], [210, 330]].map(([a, b]) => {
    const pt = (deg) => (p[0] + r * Math.cos(toRad(deg))).toFixed(2) + ',' + (p[1] - r * Math.sin(toRad(deg))).toFixed(2);
    return '<path class="an-ring" d="M' + pt(a) + ' A' + r + ' ' + r + ' 0 0 0 ' + pt(b) + '" marker-end="url(#qsq-arrow-ink)"/>';
  }).join('');
}
// Swap: a double-headed arrow along the edge between two boxes, starting
// just outside each box's square.
function anSwapSVG(p, q, s){
  const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const o = (s / 2) / Math.max(Math.abs(ux), Math.abs(uy)) + 2.6;
  return '<line class="an-swap" x1="' + (p[0] + ux*o).toFixed(2) + '" y1="' + (p[1] + uy*o).toFixed(2) + '" x2="' + (q[0] - ux*o).toFixed(2) + '" y2="' + (q[1] - uy*o).toFixed(2) +
    '" marker-start="url(#qsq-arrow-ink-both)" marker-end="url(#qsq-arrow-ink-both)"/>';
}
// SVG face for an Analogy-style object. Declarations are dark (measurement)
// squares, gates pale blue, the identity near-white: the lab's colors again.
function anCardSVG(an, three){
  const n = three ? 3 : 2, pos = AN_POS[n], s = n === 3 ? 13 : 15, vis = anBoxes(three);
  const swaps = (an.swap || []).filter(pr => pr.every(b => vis.includes(b)));
  const flips = (an.flip || []).filter(b => vis.includes(b));
  const touched = swaps.flat().concat(flips);
  let inner = SQUARE(an.declare ? 'sq-meas' : (touched.length ? 'sq-hwp' : 'sq-glass'));
  vis.forEach(b => {
    if (an.declare) inner += b === an.declare[0] ? anBoxSVG(b, pos[b], n === 3 ? 19 : 22, 'declare', an.declare[1]) : anBoxSVG(b, pos[b], s, 'blank-dark');
    else inner += anBoxSVG(b, pos[b], s, touched.includes(b) ? 'on' : 'blank');
  });
  swaps.forEach(([a, b]) => { inner += anSwapSVG(pos[a], pos[b], s); });
  flips.forEach(b => { inner += anRingSVG(pos[b], s * 0.78); });
  return svgWrap(inner);
}
// SVG picture of a STATE for small tiles (history, preview): the known box
// filled with its bit, the random ones faint with a blurred 0 over 1.
function anStateSVG(key, three){
  const n = three ? 3 : 2, s = n === 3 ? 17 : 20, known = stateByKey(key).an;
  const pos = n === 3 ? { Y: [0, -13], X: [-14, 11], Z: [14, 11] } : { X: [-12, 0], Z: [12, 0] };
  return svgWrap(anBoxes(three).map(b => {
    const p = pos[b], x = p[0] - s/2, y = p[1] - s/2;
    const rect = (cls) => '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" rx="' + (s * 0.24).toFixed(1) + '"/>';
    if (b === known[0]) return rect('an-solid an-col-' + b) + '<text class="an-bit" x="' + p[0] + '" y="' + (p[1] + 0.8) + '">' + known[1] + '</text>';
    return rect('an-tint an-col-' + b) + '<g class="an-fogbits" filter="url(#qsq-fog-blur)"><text x="' + p[0] + '" y="' + (p[1] - 3.6) + '">0</text><text x="' + p[0] + '" y="' + (p[1] + 4.6) + '">1</text></g>';
  }).join(''), 32);
}

// Names. plain=true swaps the arrow for a word, for aria-labels.
function anCardName(an, three, plain){
  if (an.declare) return 'Declare ' + an.declare[0] + ' = ' + an.declare[1];
  const vis = anBoxes(three);
  const parts = (an.swap || []).filter(pr => pr.every(b => vis.includes(b))).map(pr => 'Swap ' + pr[0] + (plain ? ' and ' : ' ↔ ') + pr[1]);
  const flips = (an.flip || []).filter(b => vis.includes(b));
  if (flips.length) parts.push((parts.length ? 'flip ' : 'Flip ') + flips.join(plain ? ' and ' : ' & '));
  return parts.length ? parts.join(', ') : 'Nothing changes';
}
// "Z = 0", or spoken: "Z is 0; X and Y are random".
function anStateText(key, three, spoken){
  const k = stateByKey(key).an;
  if (!spoken) return k[0] + ' = ' + k[1];
  const others = anBoxes(three).filter(b => b !== k[0]);
  return k[0] + ' is ' + k[1] + '; ' + others.join(' and ') + (others.length > 1 ? ' are' : ' is') + ' random';
}

// The big stage boxes. Each box is a fixed colored frame plus a "token"
// holding its contents (a bit, or the sliding foggy reel). Tokens sit
// exactly over their frames; during a play they move (swap) or spin
// (flip) on their own, so values visibly travel between boxes. `key` null
// = the qubit was lost (frames greyed, tokens hidden, an X over them).
function anTokenHTML(b, bit){
  return bit === null
    ? '<div class="an-tok an-pos-' + b + ' is-fog" data-b="' + b + '"><span class="an-reel"><span>0</span><span>1</span><span>0</span></span></div>'
    : '<div class="an-tok an-pos-' + b + ' is-known" data-b="' + b + '"><span class="an-val">' + bit + '</span></div>';
}
function anBoxesHTML(key, three, extra){
  const known = key === null ? null : stateByKey(key).an;
  const vis = anBoxes(three);
  const label = key === null ? 'Lost' : anStateText(key, three, true);
  return '<div class="an-boxes ' + (three ? 'an-three' : 'an-two') + (key === null ? ' is-lost' : '') + ' ' + (extra || '') + '" role="img" aria-label="' + label + '">' +
    vis.map(b => '<div class="an-box an-pos-' + b + ' an-col-' + b + (known && known[0] === b ? ' is-known' : '') + '" data-b="' + b + '"><span class="an-lab" aria-hidden="true">' + b + '</span></div>').join('') +
    (key === null ? '' : vis.map(b => anTokenHTML(b, known[0] === b ? known[1] : null)).join('')) +
    (key === null ? '<div class="an-lost" aria-hidden="true">✕</div>' : '') +
    '</div>';
}

/* ===================== 6. UI ===================== */

// Per-style wording. Everything here matches the lab's Game mode text.
const TEXT = {
  braket: {
    neutral: 'Play an object from your hand and try to help the qubit survive.',
    lost: 'Qubit Lost!',
    unlucky: 'You got unlucky and the qubit was absorbed',
    orthogonal: 'The projector was orthogonal to the state',
    rotated: 'State transformed!',
    priorCap: 'Prior state', currentCap: 'Current state', lostLabel: 'Lost'
  },
  polarization: {
    neutral: 'Play an object from your hand and try to help the photon survive.',
    lost: 'Photon Lost!',
    unlucky: 'You got unlucky and the photon was absorbed',
    orthogonal: 'The polarizer was orthogonal to the state',
    rotated: 'Polarization state rotated!',
    priorCap: 'Prior photon state', currentCap: 'Current photon state', lostLabel: 'Absorbed'
  },
  analogy: {
    neutral: 'Play an object from your hand and try to help the qubit survive.',
    lost: 'Qubit Lost!',
    unlucky: 'That box was random and came up the other way',
    orthogonal: 'That declaration was false',
    rotated: 'Boxes changed!',
    priorCap: 'Prior state', currentCap: 'Current state', lostLabel: 'Lost'
  }
};
const HINT = 'Play another object to increase your streak';
const DOMAIN_NOTES = {
  braket: 'Play with Dirac bra-ket notation for gates and states.',
  polarization: 'Play with polarization states and rotators.',
  analogy: 'Play with three boxes: one known bit, and two that are random until you check.'
};
// Follows DOMAIN_NOTES on the setup screen: what can change mid-game.
const DOMAIN_SWITCH_NOTES = {
  braket: 'Switch to Polarization at any time.',
  polarization: 'Switch to Bra-Ket at any time.',
  analogy: 'Fixed for the whole quest.'
};
const DOMAINS = ['braket', 'polarization', 'analogy'];
// The Numbers setting's labels. Analogy calls Real-only / Complex "Two Box"
// / "Three Box", since that is all the setting changes there.
const NUMBERS_LABELS = {
  standard: { field: 'Numbers', real: 'Real-Only', complex: 'Complex' },
  analogy: { field: 'Boxes', real: 'Two Box', complex: 'Three Box' }
};

// Pacing of the play animation (ms). A survived play takes about half a
// second end to end, a loss about 0.8s — enough to follow the qubit, short
// enough to keep a fast player moving. With Animations off, plays resolve
// instantly.
//   depart  — pause while the new object drops in, before the qubit leaves
//   travel  — qubit travels from the current state into the object
//   shift   — qubit emerges and the whole stage slides one step left
//   flash   — on a loss, how long the object flashes red before the slide
const TIMING = { depart: 90, travel: 180, shift: 240, flash: 320, milestoneDelay: 380 };

const settings = { domain: 'braket', complex: true, sound: true, animations: true, theme: 'dark' };
const bestStreak = { real: 0, complex: 0 }; // per session, per numbers setting (par differs)
let game = null;
let refocusSlot = null; // hand slot to re-focus after the hand re-renders (keyboard users)

// Short DOM helpers.
function $(id){ return document.getElementById(id); }
function modeKey(){ return settings.complex ? 'complex' : 'real'; }

/* ---------- Screens ---------- */

// Shows one top-level screen (#setup-screen or #game-screen), hides the other.
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}

/* ---------- Setup screen ---------- */

function numbersNote(){
  const par = PAR[modeKey()];
  // Returns HTML: kets are drawn with ketHTML() so |+i> shows its i as a
  // subscript, matching the kets everywhere else in the game.
  if (settings.domain === 'analogy'){
    return settings.complex ? 'Includes the green Y box, its declarations, and the swaps that reach it.'
                            : 'Only the red X and blue Z boxes appear.';
  }
  if (settings.complex){
    return (settings.domain === 'polarization'
      ? 'Includes circular polarization and quarter-wave plates'
      : 'Includes the ' + ketHTML('+i') + ' and ' + ketHTML('-i') + ' states and the basis-change gates') + '.';
  }
  return (settings.domain === 'polarization'
    ? 'Linear polarization only: horizontal, vertical, and \u00b145\u00b0'
    : 'Only ' + ketHTML('0') + ', ' + ketHTML('1') + ', ' + ketHTML('+') + ' and ' + ketHTML('-') + ' can appear') + '.';
}

// The welcome screen's preview: one short sequence (|0> -> Hadamard ->
// |+> -> projector onto |+>) drawn in the chosen style, so switching
// styles on the setup screen visibly swaps every piece for its twin.
function renderPreview(){
  const d = settings.domain;
  const slot = (tile, name) => '<div class="slot"><div class="slot-cap"></div>' + tile + '<div class="slot-name">' + name + '</div></div>';
  $('setup-preview').innerHTML =
    slot(stateTileHTML('0', d), stateName('0', d)) + '<div class="beam lit"></div>' +
    slot(cardTileHTML('GH', d), cardName('GH', d)) + '<div class="beam lit"></div>' +
    slot(stateTileHTML('+', d), stateName('+', d)) + '<div class="beam lit"></div>' +
    slot(cardTileHTML('PP', d), cardName('PP', d));
}

// Builds the welcome screen's "Object twins" table straight from CARDS, so
// it always matches the actual deck: one row per object, all three
// renderings (Analogy always with all three boxes).
function renderTwinsTable(){
  const cell = (id, d) => '<td><div class="twin-cell">' + cardTileHTML(id, d, '', true) + '<span>' + cardName(id, d, false, true) + '</span></div></td>';
  const rows = CARD_ORDER.map(id =>
    '<tr>' + cell(id, 'braket') + cell(id, 'polarization') + cell(id, 'analogy') +
    '<td class="twin-note">' + (CARDS[id].complexOnly ? 'Complex /<br>Three Box only' : '') + (CARDS[id].an.apply ? '<br>Analogy: exact swap*' : '') + '</td></tr>').join('');
  $('twins-table').innerHTML = '<thead><tr><th>Bra-Ket</th><th>Polarization</th><th>Analogy</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
}

// Syncs every welcome-screen control and note with `settings`. Called after
// any setting changes (including from the game header), so the welcome
// screen is already correct when the player returns to it.
function renderSetup(){
  setPillGroup($('setup-domain'), settings.domain);
  setPillGroup($('setup-numbers'), settings.complex ? 'complex' : 'real');
  [['sound-toggle', settings.sound], ['anim-toggle', settings.animations], ['theme-toggle', settings.theme === 'dark']].forEach(([swId, on]) => {
    const sw = $(swId);
    sw.classList.toggle('active', on);
    sw.setAttribute('aria-checked', String(on));
  });
  $('domain-note').textContent = DOMAIN_NOTES[settings.domain] + ' ' + DOMAIN_SWITCH_NOTES[settings.domain];
  const nl = NUMBERS_LABELS[settings.domain === 'analogy' ? 'analogy' : 'standard'];
  $('setup-numbers-label').textContent = nl.field;
  $('setup-numbers').querySelectorAll('.pill').forEach(p => { p.textContent = nl[p.dataset.value]; });
  $('numbers-note').innerHTML = numbersNote();
  renderPreview();
}

// Marks the pill whose data-value matches `value` as active (and sets
// aria-pressed for screen readers); clears the rest.
function setPillGroup(group, value){
  group.querySelectorAll('.pill').forEach(p => {
    const on = p.dataset.value === value;
    p.classList.toggle('active', on);
    p.setAttribute('aria-pressed', String(on));
  });
}
// Calls onChange(data-value) whenever a pill in the group is clicked.
function wirePillGroup(group, onChange){
  group.querySelectorAll('.pill').forEach(p => p.addEventListener('click', () => onChange(p.dataset.value)));
}

/* ---------- Game lifecycle ---------- */

// Starts a fresh run (the qubit back in |0>, a new hand of three). Fields:
//   state           current state vector
//   hand            three card ids (keys of CARDS)
//   streak/history  objects survived this run (history = their ids, in order)
//   phase           'ready' (nothing played yet) | 'success' | 'lost'
//   lastCard, lastStateBefore
//                   the most recent play, drawn as prior state -> object
//   message         what the message banner shows ({ kind, reason })
//   bestAtStart     best streak before this run, for the "New best!" milestone
//   parBeaten, newBest
//                   milestone flags, each fires once per run
//   busy            true while a play animation runs; blocks input
//   analogy         an Analogy run: its basis changes are exact swaps, so
//                   it can't switch to Bra-Ket / Polarization (or back)
function startRun(){
  game = {
    analogy: settings.domain === 'analogy',
    state: STATES[0].vec,
    hand: [drawCard(settings.complex), drawCard(settings.complex), drawCard(settings.complex)],
    streak: 0,
    history: [],
    phase: 'ready',          // ready | success | lost
    lastCard: null,
    lastStateBefore: null,
    message: { kind: 'neutral' },
    bestAtStart: bestStreak[modeKey()],
    parBeaten: false,
    newBest: false,
    busy: false
  };
  renderGame({ msgAnim: true });
}

// Plays hand card `idx` (0-2), or starts a new run if the qubit was lost.
// The outcome, including any randomness, is decided immediately; the
// animation (if enabled) only reveals it.
function playCard(idx){
  if (!game || game.busy) return;
  if (!(Number.isInteger(idx) && idx >= 0 && idx < 3)) return; // only ever 0-2 (buttons / keys 1-3)
  if (game.phase === 'lost'){ SFX.cardFlip(); startRun(); return; }

  const id = game.hand[idx];
  const before = game.state;
  const result = resolvePlay(before, id, undefined, game.analogy); // randomness is decided here, up front
  // Re-rendering replaces the card buttons; if a card had keyboard focus,
  // put focus back on the same slot afterwards (see renderHand).
  refocusSlot = document.activeElement && document.activeElement.classList.contains('hand-card') ? idx : null;
  SFX.cardFlip();

  if (!settings.animations){
    const hits = commitPlay(idx, id, before, result);
    outcomeSound(result);
    milestoneSound(hits);
    renderGame({ msgAnim: true, pop: result.survives, dealtIdx: result.survives ? idx : undefined,
                 newMilestones: hits, lostFx: !result.survives });
    return;
  }
  if (settings.domain === 'analogy') animatePlayAnalogy(idx, id, before, result);
  else animatePlay(idx, id, before, result);
}

// Applies a resolved play to the game state (no rendering). Returns any
// milestones reached, each of which fires once per run.
function commitPlay(idx, id, before, result){
  game.lastCard = id;
  game.lastStateBefore = before;
  if (!result.survives){
    game.phase = 'lost';
    game.message = { kind: 'lost', reason: result.outcome };
    return [];
  }
  game.state = result.out;
  game.history.push(id);
  game.hand[idx] = drawCard(settings.complex);
  game.streak++;
  const key = modeKey();
  bestStreak[key] = Math.max(bestStreak[key], game.streak);
  const hits = [];
  if (!game.parBeaten && game.streak > PAR[key]){ game.parBeaten = true; hits.push('par'); }
  if (!game.newBest && game.bestAtStart > 0 && game.streak > game.bestAtStart){ game.newBest = true; hits.push('best'); }
  game.phase = 'success';
  game.message = { kind: result.outcome };
  return hits;
}

// Sound for a play's outcome: fail on loss, whoosh when a gate changed the
// state, a soft blip when it didn't, a chime for a measurement survived.
function outcomeSound(result){
  if (!result.survives) SFX.fail();
  else if (result.outcome === 'rotated') SFX.thwip();
  else if (result.outcome === 'unchanged') SFX.neutral();
  else SFX.win();
}
// Plays the fanfare (par beaten) or arpeggio (new best) shortly after the
// outcome sound, so the two don't collide. Par wins if both happen at once.
function milestoneSound(hits){
  if (hits.length) setTimeout(() => (hits.includes('par') ? SFX.parBeaten() : SFX.newBest()), TIMING.milestoneDelay);
}

/* ---------- The play animation ----------
   The stage is a fixed-width window (.stage, overflow hidden) over a
   horizontal track of slots. Normally the track holds exactly four:
     [prior] [object] [current] [next]
   To animate a play, the track is rebuilt with six:
     [prior] [object] [current] [NEW OBJECT] [NEW STATE or X] [next]
   so the new object lands where "next" was, and the two extra slots sit
   just outside the window's right edge. Then:
     1. A copy of the current state (the "token", inside the track) shrinks
        and travels into the new object, passing BEHIND it (objects sit
        above the token in z-order).
     2. Hidden behind the object, the token swaps to the new state (or, on
        a loss, fades while the object flashes red).
     3. The token emerges toward the new-state slot while the whole track
        slides left by two slots. Because the token lives inside the track,
        the slide carries it along, so it reads as the qubit leaving the
        object while everything shifts into its new place.
   When the slide ends, the six-slot track looks exactly like the normal
   four-slot stage for the new position, so a plain renderStage() swaps
   it in with no visible jump. */
function animatePlay(idx, id, before, result){
  const g = game, d = settings.domain, t = TEXT[d];
  g.busy = true;
  const alive = () => game === g; // stop quietly if the player left for the menu
  lockHand(idx);

  const beforeKey = stateKeyOf(before);
  const outKey = result.survives ? stateKeyOf(result.out) : null;
  const lead = leadingSlots(d); // built before commitPlay changes lastCard
  const litLead = g.phase === 'ready' ? '' : 'lit';

  const stage = $('stage');
  stage.innerHTML = '<div class="track">' +
    lead[0] + beamHTML(litLead) + lead[1] + beamHTML(litLead) +
    slotHTML(t.currentCap, stateTileHTML(beforeKey, d), stateName(beforeKey, d), 'anim-from') + beamHTML('anim-b2') +
    slotHTML('Object', cardTileHTML(id, d, 'arriving'), cardName(id, d), 'anim-object') + beamHTML('anim-b3') +
    (result.survives
      ? slotHTML(t.currentCap, stateTileHTML(outKey, d), stateName(outKey, d), 'anim-to hold')
      : slotHTML(t.lostLabel, LOST_TILE, '', 'anim-to hold')) +
    beamHTML(result.survives ? 'to-next' : 'to-next off') +
    (result.survives ? slotHTML('Next object', NEXT_TILE, '') : slotHTML('', GHOST_TILE, '', 'is-ghost')) +
    '<div class="token" id="token">' + stateTileHTML(beforeKey, d) + '</div>' +
    '</div>';

  const track = stage.querySelector('.track');
  const q = (sel) => track.querySelector(sel);
  const fromTile = q('.anim-from .tile'), objTile = q('.anim-object .tile'), toTile = q('.anim-to .tile');
  const token = $('token');

  // Geometry, measured in track coordinates.
  const trackLeft = track.getBoundingClientRect().left;
  const fr = fromTile.getBoundingClientRect();
  const intoObject = objTile.getBoundingClientRect().left - fr.left;
  const intoTarget = toTile.getBoundingClientRect().left - fr.left;
  // Sliding by (current slot - first slot) = two slots puts every slot
  // exactly where the one two places to its left was.
  const slideDistance = fr.left - track.querySelector('.slot .tile').getBoundingClientRect().left;
  token.style.left = (fr.left - trackLeft) + 'px';
  token.style.top = (fr.top - track.getBoundingClientRect().top) + 'px';

  const hits = commitPlay(idx, id, before, result);

  setTimeout(() => {
    if (!alive()) return;
    // 1. The qubit leaves the current state, which becomes the prior state.
    fromTile.classList.add('dull');
    q('.anim-from .slot-cap').textContent = t.priorCap;
    q('.anim-b2').className = 'beam lit firing anim-b2';
    token.style.transition = 'transform ' + TIMING.travel + 'ms cubic-bezier(.55,0,.6,1)';
    token.style.transform = 'translateX(' + intoObject + 'px) scale(0.6)';

    setTimeout(() => {
      if (!alive()) return;
      renderMessage({ msgAnim: true });
      outcomeSound(result);

      if (result.survives){
        // 2-3. Hidden behind the object, become the new state, then emerge
        //      while the stage slides left.
        token.innerHTML = stateTileHTML(outKey, d);
        objTile.classList.remove('arriving');
        objTile.classList.add('processing');
        q('.anim-b3').className = 'beam lit anim-b3';
        token.style.transition = 'transform ' + TIMING.shift + 'ms cubic-bezier(.3,0,.25,1)';
        token.style.transform = 'translateX(' + intoTarget + 'px) scale(1)';
        slideTrack(track, slideDistance, () => {
          if (!alive()) return;
          finishAnimatedPlay(idx, hits, true);
        });
      } else {
        // 2. Absorbed: the object flashes red and the qubit fades inside it.
        objTile.classList.remove('arriving');
        objTile.classList.add('flash-red');
        token.style.transition = 'transform 200ms ease, opacity 200ms ease';
        token.style.transform = 'translateX(' + intoObject + 'px) scale(0.3)';
        token.style.opacity = '0';
        q('.anim-b3').className = 'beam broken anim-b3';
        // Start the X's pop now, while it's still clipped just outside the
        // window, so it has finished by the time the slide ends.
        toTile.parentElement.classList.remove('hold');
        toTile.classList.add('pop-in');
        const panel = $('stage-panel');
        panel.classList.remove('lost-fx'); void panel.offsetWidth; panel.classList.add('lost-fx');
        setTimeout(() => {
          if (!alive()) return;
          // 3. Slide left, bringing the X into place.
          slideTrack(track, slideDistance, () => {
            if (!alive()) return;
            finishAnimatedPlay(idx, hits, false);
          });
        }, TIMING.flash);
      }
    }, TIMING.travel);
  }, TIMING.depart);
}

// Disables the hand for the length of a play animation, and sends the
// played card up out of the hand.
function lockHand(idx){
  $('hand').querySelectorAll('.hand-card').forEach((c, i) => {
    c.disabled = true;
    if (i === idx) c.classList.add('played');
  });
}

/* ---------- The Analogy play animation ----------
   Analogy's stage is not a sliding track but one big set of boxes that
   changes in place: [object] -> [boxes] -> [next]. A play:
     1. The new object drops into the object slot.
     2. Gate: the contents of swapped boxes slide along their shared edge
        into each other's box, while flipped boxes spin over and change
        bit. Random boxes travel and spin too, still foggy.
        Declaration: a "Z = 1" stamp lands on its box. A known box that
        matches pulses gold; one that doesn't flashes red. A random box
        stops sliding and shows what it came up as: on a win, that box
        becomes the known one and the previously known box fogs over.
     3. On a loss, the stage shakes and the boxes grey out under an X.
   Tokens end exactly where the resting stage draws them, so the final
   renderStage() swaps in with no visible jump. Same total time as the
   beam animation (TIMING). */
function animatePlayAnalogy(idx, id, before, result){
  const g = game, an = CARDS[id].an, three = anThree();
  g.busy = true;
  const alive = () => game === g;
  lockHand(idx);

  const beforeKey = stateKeyOf(before);
  const stage = $('stage');
  stage.className = 'stage stage-an';
  stage.innerHTML = anStageHTML(id, 'arriving', beforeKey, false, 'lit');
  const boxes = stage.querySelector('.an-boxes');
  const frame = (b) => boxes.querySelector('.an-box[data-b="' + b + '"]');
  const token = (b) => boxes.querySelector('.an-tok[data-b="' + b + '"]');
  const known = stateByKey(beforeKey).an;
  const hits = commitPlay(idx, id, before, result);

  setTimeout(() => {
    if (!alive()) return;
    if (an.declare){
      const [b, bit] = an.declare;
      boxes.insertAdjacentHTML('beforeend', '<div class="an-stampwrap an-pos-' + b + '"><span class="an-stamp an-col-' + b + '">' + b + ' = ' + bit + '</span></div>');
    }
    setTimeout(() => {
      if (!alive()) return;
      renderMessage({ msgAnim: true });
      outcomeSound(result);
      const vis = anBoxes(three);
      if (CARDS[id].cat === 'unitary'){
        (an.swap || []).filter(pr => pr.every(b => vis.includes(b))).forEach(([a, b]) => {
          const ra = frame(a).getBoundingClientRect(), rb = frame(b).getBoundingClientRect();
          const dx = rb.left - ra.left, dy = rb.top - ra.top;
          token(a).style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
          token(b).style.transform = 'translate(' + (-dx) + 'px,' + (-dy) + 'px)';
        });
        (an.flip || []).filter(b => vis.includes(b)).forEach(b => {
          const tk = token(b);
          tk.classList.add('an-flipping');
          const val = tk.querySelector('.an-val');
          if (val) setTimeout(() => { val.textContent = String(1 - Number(val.textContent)); }, TIMING.shift / 2);
        });
        setTimeout(() => { if (alive()) finishAnimatedPlay(idx, hits, true); }, TIMING.shift + 120);
        return;
      }
      // A declaration.
      const [b, bit] = an.declare;
      const cls = classify(result.prob);
      if (cls === 'random'){
        const shown = result.survives ? bit : 1 - bit;
        const tk = token(b);
        tk.className = 'an-tok an-pos-' + b + ' is-known an-reveal';
        tk.innerHTML = '<span class="an-val">' + shown + '</span>';
        if (result.survives){
          frame(known[0]).classList.remove('is-known');
          frame(b).classList.add('is-known');
          const old = token(known[0]);
          old.outerHTML = anTokenHTML(known[0], null).replace('is-fog', 'is-fog an-fogin');
        }
      }
      if (result.survives){
        frame(b).classList.add('an-hit');
        setTimeout(() => { if (alive()) finishAnimatedPlay(idx, hits, true); }, TIMING.shift + 120);
      } else {
        frame(b).classList.add('an-miss');
        stage.querySelector('.an-object .tile').classList.add('flash-red');
        setTimeout(() => { if (alive()) finishAnimatedPlay(idx, hits, false, { lostFx: true }); }, TIMING.flash + 160);
      }
    }, TIMING.travel);
  }, TIMING.depart);
}

// Slides the track left and calls `done` once the slide has actually
// finished (transitionend), so the swap to the resting stage never catches
// it a few pixels short. A timer backs this up in case the event never
// fires (e.g. the tab was hidden mid-slide).
function slideTrack(track, distance, done){
  let finished = false;
  const finish = () => { if (!finished){ finished = true; done(); } };
  track.addEventListener('transitionend', function onEnd(e){
    if (e.target === track && e.propertyName === 'transform'){ track.removeEventListener('transitionend', onEnd); finish(); }
  });
  setTimeout(finish, TIMING.shift + 120);
  track.style.transition = 'transform ' + TIMING.shift + 'ms cubic-bezier(.3,0,.25,1)';
  track.style.transform = 'translateX(' + (-distance) + 'px)';
}

// Last step of an animated play: release the input lock and swap the slid
// six-slot track for the normal four-slot stage (pixel-identical, so no
// jump), then update everything that waited for the animation.
function finishAnimatedPlay(idx, hits, survived, stageOpts){
  game.busy = false;
  renderStage(stageOpts || {}); // seamless: same picture as the slid track
  renderHistory();
  renderScore({ pop: survived, newMilestones: hits });
  renderHand({ dealtIdx: survived ? idx : undefined });
  milestoneSound(hits);
}

// Switches the qubit style (Bra-Ket / Polarization / Analogy). Bra-Ket and
// Polarization share one physics, so a run can switch between them with
// nothing changing but the drawing. Analogy's basis changes differ (see
// applySwapZY), so mid-game it can't be switched to or from; that choice
// is made on the setup screen.
function setDomain(d){
  if (!DOMAINS.includes(d)) return; // values come from data-* attributes; accept only known styles
  if (game && game.busy) return; // re-rendering mid-animation would tear down the sliding track
  if (game && $('game-screen').classList.contains('active') && (d === 'analogy') !== game.analogy) return;
  settings.domain = d;
  if ($('game-screen').classList.contains('active')) renderGame({ flip: true });
  renderSetup();
}

/* ---------- Game rendering ---------- */

// Redraws the whole game screen from `game` and `settings`. Options:
//   msgAnim     animate the message banner in
//   pop         pop the streak counter and the new current state
//   dealtIdx    hand slot that just received a new card (deal animation)
//   newMilestones  milestones reached this play (their chips pop)
//   lostFx      shake the stage and pop the X (loss without animation)
//   flip        flip every tile (after a style switch)
function renderGame(opts){
  opts = opts || {};
  renderHeader();
  renderScore(opts);
  renderMessage(opts);
  renderStage(opts);
  renderHistory();
  renderHand(opts);
  if (opts.flip){
    document.querySelectorAll('#game-screen .tile').forEach(t => t.classList.add('flip-in'));
  }
}

// Syncs the header controls: style toggle, theme switch, mute button.
function renderHeader(){
  setPillGroup($('domain-toggle'), settings.domain);
  // Only the styles this run can switch to are enabled (see setDomain).
  $('domain-toggle').querySelectorAll('.pill').forEach(p => {
    const locked = (p.dataset.value === 'analogy') !== game.analogy;
    p.disabled = locked;
    p.title = locked ? (game.analogy ? 'Analogy runs stay in Analogy. Choose another style from the main menu.'
                                     : 'Analogy is chosen from the main menu, before a quest starts.') : '';
  });
  const th = $('theme-toggle-header');
  th.classList.toggle('active', settings.theme === 'dark');
  th.setAttribute('aria-checked', String(settings.theme === 'dark'));
  const mute = $('mute-btn');
  mute.textContent = settings.sound ? '\ud83d\udd0a' : '\ud83d\udd07';
  mute.setAttribute('aria-label', settings.sound ? 'Mute sound' : 'Unmute sound');
  mute.title = mute.getAttribute('aria-label');
}

// Streak, par, best streak, and the milestone chips.
function renderScore(opts){
  const num = $('streak-num');
  num.textContent = game.streak;
  if (opts.pop){ num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop'); }
  $('par-num').textContent = PAR[modeKey()];
  $('best-num').textContent = bestStreak[modeKey()];
  const chips = [];
  if (game.parBeaten) chips.push('<span class="milestone milestone-par' + (opts.newMilestones && opts.newMilestones.includes('par') ? ' fresh' : '') + '">Par beaten!</span>');
  if (game.newBest) chips.push('<span class="milestone milestone-best' + (opts.newMilestones && opts.newMilestones.includes('best') ? ' fresh' : '') + '">New best!</span>');
  $('milestones').innerHTML = chips.join('');
}

// The message banner. Text comes from TEXT (per style) and matches the
// lab's Game mode exactly; the CSS class picks the colour.
function renderMessage(opts){
  const t = TEXT[settings.domain];
  const m = game.message;
  let cls, html;
  if (m.kind === 'neutral'){
    cls = 'neutral'; html = '<div class="msg-neutral">' + t.neutral + '</div>';
  } else if (m.kind === 'lost'){
    cls = 'lost'; html = '<div class="msg-title">' + t.lost + '</div><div class="msg-sub">' + (m.reason === 'unlucky' ? t.unlucky : t.orthogonal) + '</div>';
  } else if (m.kind === 'rotated'){
    cls = 'rotated'; html = '<div class="msg-title">' + t.rotated + '</div><div class="msg-sub">' + HINT + '</div>';
  } else if (m.kind === 'unchanged'){
    cls = 'unchanged'; html = '<div class="msg-title">Nothing happens!</div><div class="msg-sub">' + HINT + '</div>';
  } else if (m.kind === 'lucky'){
    cls = 'success'; html = '<div class="msg-title">Successful Transmission!</div><div class="msg-sub">You got lucky that time! ' + HINT + '</div>';
  } else {
    cls = 'success'; html = '<div class="msg-title">Successful Transmission!</div><div class="msg-sub">' + HINT + '</div>';
  }
  const box = $('message');
  box.className = 'message ' + cls + (opts.msgAnim ? ' msg-in' : '');
  box.innerHTML = html;
  // Screen readers: one announcement per new outcome — the message, then
  // the new state and the streak (the banner and counter themselves are
  // not live regions, so nothing is read twice).
  if (opts.msgAnim){
    // Join the banner's parts with spaces (textContent would run the title
    // into the hint) and make sure each part ends with punctuation.
    let line = Array.from(box.children).map(c => c.textContent.trim()).filter(Boolean)
      .map(t => /[.!?]$/.test(t) ? t : t + '.').join(' ');
    if (m.kind !== 'neutral'){
      if (game.phase !== 'lost') line += ' Current state: ' + stateSpoken(stateKeyOf(game.state), settings.domain) + '.';
      line += ' Streak ' + game.streak + '.';
    }
    $('sr-status').textContent = line;
  }
}

// Shared stage pieces (used by the static stage and the play animation).
function slotHTML(cap, tile, name, cls){
  return '<div class="slot ' + (cls || '') + '"><div class="slot-cap">' + cap + '</div>' + tile + '<div class="slot-name">' + name + '</div></div>';
}
function beamHTML(cls){ return '<div class="beam ' + (cls || '') + '"></div>'; }
const GHOST_TILE = '<div class="tile tile-ghost"></div>';
const NEXT_TILE = '<div class="tile tile-next"><span>?</span></div>';
const LOST_TILE = '<div class="tile tile-lost"><span>\u2715</span></div>';

// The two slots left of the current state: prior state and the last
// object played, or faint placeholders before the first play.
function leadingSlots(d){
  const t = TEXT[d];
  if (!game.lastCard) return [slotHTML('', GHOST_TILE, '', 'is-ghost'), slotHTML('', GHOST_TILE, '', 'is-ghost')];
  const pk = stateKeyOf(game.lastStateBefore);
  return [slotHTML(t.priorCap, stateTileHTML(pk, d, 'dull'), stateName(pk, d)),
          slotHTML('Object', cardTileHTML(game.lastCard, d), cardName(game.lastCard, d))];
}

// The resting stage: always the same four slots, so nothing jumps around:
//   prior state -> object -> current state (or the loss) -> next object
function renderStage(opts){
  opts = opts || {};
  const d = settings.domain, t = TEXT[d];
  if (d === 'analogy'){ renderAnalogyStage(opts); return; }
  $('stage').className = 'stage';
  const lead = leadingSlots(d);
  const lit = game.lastCard ? 'lit' : '';
  let current, beam2, beam3, next;
  if (game.phase === 'lost'){
    current = slotHTML(t.lostLabel, opts.lostFx ? LOST_TILE.replace('tile-lost', 'tile-lost pop-in') : LOST_TILE, '');
    beam2 = beamHTML('broken');
    beam3 = beamHTML('to-next off');
    next = slotHTML('', GHOST_TILE, '', 'is-ghost');
  } else {
    const k = stateKeyOf(game.state);
    current = slotHTML(t.currentCap, stateTileHTML(k, d, opts.pop ? 'pop-in' : ''), stateName(k, d));
    beam2 = beamHTML(lit);
    beam3 = beamHTML('to-next');
    next = slotHTML('Next object', NEXT_TILE, '');
  }
  $('stage').innerHTML = '<div class="track">' + lead[0] + beamHTML(lit) + lead[1] + beam2 + current + beam3 + next + '</div>';
  stagePanelFx(opts);
}

// The stage panel's loss styling (red tint, and a shake when it happens).
function stagePanelFx(opts){
  const panel = $('stage-panel');
  if (opts.lostFx){ panel.classList.remove('lost-fx'); void panel.offsetWidth; panel.classList.add('lost-fx'); }
  panel.classList.toggle('is-lost', game.phase === 'lost');
}

// Analogy's stage: [object] -> [the boxes] -> [next object]. `card` is the
// object to show (null = a faint placeholder, before the first play),
// `key` the state (ignored when `lost`).
function anStageHTML(card, cardCls, key, lost, lit){
  const t = TEXT.analogy, three = anThree();
  const obj = card ? slotHTML('Object', cardTileHTML(card, 'analogy', cardCls), cardName(card, 'analogy'), 'an-object')
                   : slotHTML('', GHOST_TILE, '', 'is-ghost an-object');
  const name = lost ? '' : anStateText(key, three) + ' · ' + anBoxes(three).filter(b => b !== stateByKey(key).an[0]).join(' and ') + (three ? ' are' : ' is') + ' random';
  const center = '<div class="an-center"><div class="slot-cap">' + (lost ? t.lostLabel : t.currentCap) + '</div>' +
    anBoxesHTML(lost ? null : key, three, settings.animations ? '' : 'still') +
    '<div class="slot-name">' + name + '</div></div>';
  return '<div class="an-row">' + obj + beamHTML(lost ? 'broken' : lit) + center +
    beamHTML(lost ? 'to-next off an-next' : 'to-next an-next') + (lost ? slotHTML('', GHOST_TILE, '', 'is-ghost an-next') : slotHTML('Next object', NEXT_TILE, '', 'an-next')) + '</div>';
}
function renderAnalogyStage(opts){
  const stage = $('stage');
  stage.className = 'stage stage-an';
  const lost = game.phase === 'lost';
  stage.innerHTML = anStageHTML(game.lastCard, '', lost ? null : stateKeyOf(game.state), lost, game.lastCard ? 'lit' : '');
  if (opts.pop && !lost) stage.querySelector('.an-tok.is-known').classList.add('an-reveal');
  if (opts.lostFx && lost) stage.querySelector('.an-lost').classList.add('pop-in');
  if (opts.flip) stage.querySelector('.an-boxes').classList.add('flip-in');
  stagePanelFx(opts);
}

// The "This run" strip: the starting |0> state, then every object survived,
// in order. Scrolled to the end so the latest is always visible.
function renderHistory(){
  const d = settings.domain;
  const minis = [stateTileHTML('0', d, 'mini')].concat(game.history.map(id => cardTileHTML(id, d, 'mini')));
  const strip = $('history-strip');
  strip.innerHTML = minis.join('');
  strip.scrollLeft = strip.scrollWidth;
}

// The three hand cards (or three "Start New Game" cards after a loss). Each
// card's data-idx is its hand position, which playCard() validates.
function renderHand(opts){
  opts = opts || {};
  const d = settings.domain;
  const hand = $('hand');
  if (game.phase === 'lost'){
    hand.innerHTML = [0, 1, 2].map(i =>
      '<button type="button" class="hand-card lost-card" data-idx="' + i + '" aria-label="Start new game" aria-keyshortcuts="' + (i + 1) + '"><span class="card-key" aria-hidden="true">' + (i + 1) + '</span>' +
      '<span class="lost-text">Start New Game</span></button>').join('');
  } else {
    hand.innerHTML = game.hand.map((id, i) =>
      '<button type="button" class="hand-card' + (opts.dealtIdx === i ? ' dealt' : '') + '" data-idx="' + i + '" aria-label="Play ' + cardName(id, d, true) + '" aria-keyshortcuts="' + (i + 1) + '">' +
      '<span class="card-key" aria-hidden="true">' + (i + 1) + '</span>' + cardTileHTML(id, d) +
      '<span class="card-name">' + cardName(id, d) + '</span></button>').join('');
  }
  hand.querySelectorAll('.hand-card').forEach(b => b.addEventListener('click', () => playCard(Number(b.dataset.idx))));
  if (refocusSlot !== null && !(game && game.busy)){ hand.children[refocusSlot].focus(); refocusSlot = null; }
}

/* ---------- Wiring ---------- */

// Light/dark theme: purely visual (CSS variables keyed off <html
// data-theme>), so it can flip at any time, even mid-animation.
function setTheme(theme){
  settings.theme = theme;
  document.documentElement.dataset.theme = theme;
  renderSetup();
  if (game) renderHeader();
}

// Turns sound on/off (the setting and the synthesizer together).
function setSound(on){
  settings.sound = on;
  SFX.setEnabled(on);
}

// Wires up every control once the page has loaded. Nothing here runs when
// the file is loaded headless for testing (see the guard at the bottom).
function initUI(){
  // Default Animations to off for anyone whose system asks for reduced motion.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) settings.animations = false;
  renderTwinsTable();

  wirePillGroup($('setup-domain'), v => setDomain(v));
  wirePillGroup($('setup-numbers'), v => { settings.complex = v === 'complex'; renderSetup(); });
  $('sound-toggle').addEventListener('click', () => { setSound(!settings.sound); renderSetup(); });
  $('anim-toggle').addEventListener('click', () => { settings.animations = !settings.animations; renderSetup(); });
  $('theme-toggle').addEventListener('click', () => setTheme(settings.theme === 'dark' ? 'light' : 'dark'));
  $('theme-toggle-header').addEventListener('click', () => setTheme(settings.theme === 'dark' ? 'light' : 'dark'));

  $('start-btn').addEventListener('click', () => {
    SFX.init();
    setSound(settings.sound);
    showScreen('game-screen');
    startRun();
    $('game-title').focus(); // move screen-reader/keyboard focus to the new screen
  });

  wirePillGroup($('domain-toggle'), v => setDomain(v));
  $('mute-btn').addEventListener('click', () => { setSound(!settings.sound); renderHeader(); renderSetup(); });
  // Leaving for the main menu ends the run. Dropping the game object also
  // cancels any play animation still in flight (its steps check alive(),
  // i.e. that `game` is still the object they started with) and releases
  // its busy lock immediately, so the setup screen's controls respond at
  // once instead of being ignored until the orphaned animation finishes.
  $('menu-btn').addEventListener('click', () => { game = null; renderSetup(); showScreen('setup-screen'); $('setup-title').focus(); });

  // Keys 1-3 play the matching card (handy at a demo table).
  document.addEventListener('keydown', e => {
    if (!$('game-screen').classList.contains('active')) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.repeat) return; // holding a key down must not play a card per auto-repeat
    const n = Number(e.key);
    if (n >= 1 && n <= 3){ e.preventDefault(); playCard(n - 1); }
  });

  renderSetup();
}

if (typeof document !== 'undefined'){
  document.addEventListener('DOMContentLoaded', initUI);
}
