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
     3. DECK     Every object is ONE abstract card with two renderings
                 (Bra-Ket and Polarization). Gameplay only ever touches
                 the abstract card, which is why the qubit style can be
                 switched mid-game without changing anything about the
                 run: switching only re-renders.
     4. RULES    Drawing, resolving a play, par. Same rules as the
                 Superposition and Measurement Lab's Game mode.
     5. MARKUP   Pure functions turning a state/card into HTML/SVG for
                 either style (design notes inline).
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
// Identity gate / clear glass: always passes, state unchanged.
function applyIdentity(v){ return { prob: 1, out: v }; }

/* ===================== 2. STATES ===================== */

// `pol` describes how the state is DRAWN in Polarization style: a
// double-headed arrow at `angle`, or a circle with handedness arrows.
const STATES = [
  { key: '0',  vec: vecLinear(0),     pol: { name: 'Horizontal',    angle: 0 } },
  { key: '1',  vec: vecLinear(90),    pol: { name: 'Vertical',      angle: 90 } },
  { key: '+',  vec: vecLinear(45),    pol: { name: '+45\u00b0 diagonal', angle: 45 } },
  { key: '-',  vec: vecLinear(-45),   pol: { name: '\u221245\u00b0 diagonal', angle: -45 } },
  { key: '+i', vec: vecCircular('L'), pol: { name: 'Left circular',  circ: 'L' } },
  { key: '-i', vec: vecCircular('R'), pol: { name: 'Right circular', circ: 'R' } }
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
// that can absorb; unitary = always passes). `bk` and `pol` are the two
// twin renderings; `complexOnly` objects are removed in Real-only games
// (they are exactly the ones that reach the |+-i> / circular states).
const CARDS = {
  P0:   { cat: 'projector', apply: v => project(v, vecLinear(0)),     bk: { sym: '0' },  pol: { type: 'polarizer', angle: 0,   name: 'Horizontal Polarizer' } },
  P1:   { cat: 'projector', apply: v => project(v, vecLinear(90)),    bk: { sym: '1' },  pol: { type: 'polarizer', angle: 90,  name: 'Vertical Polarizer' } },
  PP:   { cat: 'projector', apply: v => project(v, vecLinear(45)),    bk: { sym: '+' },  pol: { type: 'polarizer', angle: 45,  name: '+45\u00b0 Polarizer' } },
  PM:   { cat: 'projector', apply: v => project(v, vecLinear(-45)),   bk: { sym: '-' },  pol: { type: 'polarizer', angle: -45, name: '\u221245\u00b0 Polarizer' } },
  PR:   { cat: 'projector', apply: v => project(v, vecCircular('R')), bk: { sym: '-i' }, pol: { type: 'polarizer', circ: 'R', name: 'Right-Circular Polarizer' }, complexOnly: true },
  PL:   { cat: 'projector', apply: v => project(v, vecCircular('L')), bk: { sym: '+i' }, pol: { type: 'polarizer', circ: 'L', name: 'Left-Circular Polarizer' },  complexOnly: true },
  GZ:   { cat: 'unitary', apply: v => applyHWP(v, 0),    bk: { gate: 'Z',   name: 'Pauli-Z Gate' },  pol: { type: 'hwp', angle: 0,    name: 'Phase / Z Half Wave-Plate' } },
  GX:   { cat: 'unitary', apply: v => applyHWP(v, 45),   bk: { gate: 'X',   name: 'Pauli-X Gate' },  pol: { type: 'hwp', angle: 45,   name: 'Not / X Half Wave-Plate' } },
  GY:   { cat: 'unitary', apply: applyY,                 bk: { gate: 'Y',   name: 'Pauli-Y Gate' },  pol: { type: 'syrup',            name: 'Maple Syrup' } },
  GH:   { cat: 'unitary', apply: v => applyHWP(v, 22.5), bk: { gate: 'H',   name: 'Hadamard Gate' }, pol: { type: 'hwp', angle: 22.5, name: 'Hadamard Half Wave-Plate' } },
  GUZY: { cat: 'unitary', apply: v => applyQWP(v, 45),   bk: { gate: 'UZY', name: 'Basis Change (Z\u2194Y)' }, pol: { type: 'qwp', angle: 45, name: 'Quarter Wave-Plate (45\u00b0)' }, complexOnly: true },
  GUXY: { cat: 'unitary', apply: v => applyQWP(v, 0),    bk: { gate: 'UXY', name: 'Basis Change (X\u2194Y)' }, pol: { type: 'qwp', angle: 0,  name: 'Quarter Wave-Plate (0\u00b0)' },  complexOnly: true },
  GI:   { cat: 'unitary', apply: applyIdentity,          bk: { gate: 'I',   name: 'Identity Gate' }, pol: { type: 'glass',            name: 'Clear Glass' } }
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

// Resolves playing card `id` on state `v`. `outcome` is exactly one of
// the lab's message kinds: success | lucky | rotated | unchanged (the qubit
// survived) or unlucky | orthogonal (it was lost, and why).
function resolvePlay(v, id, rng){
  rng = rng || Math.random;
  const card = CARDS[id];
  const r = card.apply(v);
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
// 500,000-game Monte Carlo per setting. Both qubit styles share one deck,
// so they share par. (Matches the lab's Bra-Ket par values.)
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
     inset rounded square of the same proportions.
   - Arrowheads come from the hidden <marker> library at the top of
     index.html (ids qsq-arrow-*), shared by every SVG on the page. */

const KET_SYM = { '0': '0', '1': '1', '+': '+', '-': '\u2212', '+i': '+<sub>i</sub>', '-i': '\u2212<sub>i</sub>' };
const KET_PLAIN = { '0': '|0\u27e9', '1': '|1\u27e9', '+': '|+\u27e9', '-': '|\u2212\u27e9', '+i': '|+i\u27e9', '-i': '|\u2212i\u27e9' };

// Kets are drawn with a CSS bar and an SVG angle bracket (instead of font
// glyphs or KaTeX) so the bar and bracket are always exactly the same
// height, and nothing needs to load from a CDN — the game works offline.
const ANGLE_R = '<svg class="k-angle" viewBox="0 0 8 30" aria-hidden="true"><polyline points="1.2,1 6.8,15 1.2,29"/></svg>';
const ANGLE_L = '<svg class="k-angle" viewBox="0 0 8 30" aria-hidden="true"><polyline points="6.8,1 1.2,15 6.8,29"/></svg>';
// A ket |k> as HTML: CSS bar + symbol + SVG right angle bracket. Scales with
// the surrounding font size, so it works in tiles, card names and captions.
function ketHTML(k){
  return '<span class="ket"><span class="k-bar"></span><span class="k-sym">' + KET_SYM[k] + '</span>' + ANGLE_R + '</span>';
}
// A projector |k><k| as HTML, built from the same bar/bracket pieces as ketHTML.
function projectorHTML(k){
  return '<span class="ket"><span class="k-bar"></span><span class="k-sym">' + KET_SYM[k] + '</span>' + ANGLE_R +
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
function cardName(id, domain, plain){
  const c = CARDS[id];
  if (domain === 'polarization') return c.pol.name;
  if (c.cat === 'projector') return 'Projector onto ' + (plain ? KET_PLAIN[c.bk.sym] : ketHTML(c.bk.sym));
  return c.bk.name;
}
// Bra-Ket caption: the state written out in the |0>,|1> basis, e.g.
// (|0> + i|1>) over sqrt(2) as a stacked fraction; |0> and |1> are just
// themselves. Polarization caption: the polarization's name.
function basisHTML(key){
  if (key === '0' || key === '1') return ketHTML(key);
  const sign = (key === '+' || key === '+i') ? '+' : '\u2212';
  const i = key.endsWith('i') ? '<i class="imag">i</i>' : '';
  return '<span class="frac"><span class="frac-num">' + ketHTML('0') + '<span class="op">' + sign + '</span>' + i + ketHTML('1') + '</span>' +
         '<span class="frac-den"><span class="sqrt">\u221a<span class="sqrt-arg">2</span></span></span></span>';
}
function stateName(key, domain){
  return domain === 'polarization' ? stateByKey(key).pol.name : basisHTML(key);
}

// Whole tiles. `extra` adds modifier classes (e.g. "dull" for the prior state).
function cardTileHTML(id, domain, extra){
  const c = CARDS[id];
  const label = cardName(id, domain, true);
  let face;
  if (domain === 'polarization'){
    face = '<div class="face">' + polCardSVG(c.pol) + '</div>';
  } else {
    face = '<div class="face face-bk ' + (c.cat === 'projector' ? 'face-meas' : (c.bk.gate === 'I' ? 'face-glass' : 'face-gate')) + '">' + bkCardInner(c.bk) + '</div>';
  }
  return '<div class="tile tile-object ' + (extra || '') + '" role="img" aria-label="' + label + '">' + face + '</div>';
}
// A whole STATE tile (the glowing qubit box) for either style. `extra` adds
// modifier classes: 'dull' (prior state), 'pop-in', 'mini' (history strip).
function stateTileHTML(key, domain, extra){
  const s = stateByKey(key);
  const face = domain === 'polarization'
    ? '<div class="face">' + polStateSVG(s.pol) + '</div>'
    : '<div class="face face-ket">' + ketHTML(key) + '</div>';
  const label = domain === 'polarization' ? s.pol.name + ' polarization' : KET_PLAIN[key];
  return '<div class="tile tile-state ' + (extra || '') + '" role="img" aria-label="' + label + '">' + face + '</div>';
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
  }
};
const HINT = 'Play another object to increase your streak';
const DOMAIN_NOTES = {
  braket: 'Kets, projectors, and quantum gates: the standard notation of quantum computing.',
  polarization: 'A single photon\u2019s polarization: polarizers, wave-plates, and maple syrup.'
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
  if (settings.complex){
    return (settings.domain === 'polarization'
      ? 'Includes circular polarization and quarter-wave plates.'
      : 'Includes the ' + ketHTML('+i') + ' and ' + ketHTML('-i') + ' states and the basis-change gates.') + ' Par: ' + par + '.';
  }
  return (settings.domain === 'polarization'
    ? 'Linear polarization only: horizontal, vertical, and \u00b145\u00b0.'
    : 'Only ' + ketHTML('0') + ', ' + ketHTML('1') + ', ' + ketHTML('+') + ' and ' + ketHTML('-') + ' can appear.') + ' Par: ' + par + '.';
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
// it always matches the actual deck: one row per object, both renderings.
function renderTwinsTable(){
  const rows = CARD_ORDER.map(id =>
    '<tr><td><div class="twin-cell">' + cardTileHTML(id, 'braket') + '<span>' + cardName(id, 'braket') + '</span></div></td>' +
    '<td><div class="twin-cell">' + cardTileHTML(id, 'polarization') + '<span>' + cardName(id, 'polarization') + '</span></div></td>' +
    '<td class="twin-note">' + (CARDS[id].complexOnly ? 'Complex only' : '') + '</td></tr>').join('');
  $('twins-table').innerHTML = '<thead><tr><th>Bra-Ket</th><th>Polarization</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
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
  $('domain-note').textContent = DOMAIN_NOTES[settings.domain];
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
function startRun(){
  game = {
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
  const result = resolvePlay(before, id); // randomness is decided here, up front
  SFX.cardFlip();

  if (!settings.animations){
    const hits = commitPlay(idx, id, before, result);
    outcomeSound(result);
    milestoneSound(hits);
    renderGame({ msgAnim: true, pop: result.survives, dealtIdx: result.survives ? idx : undefined,
                 newMilestones: hits, lostFx: !result.survives });
    return;
  }
  animatePlay(idx, id, before, result);
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

  $('hand').querySelectorAll('.hand-card').forEach((c, i) => {
    c.disabled = true;
    if (i === idx) c.classList.add('played');
  });

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
function finishAnimatedPlay(idx, hits, survived){
  game.busy = false;
  renderStage({});           // seamless: same picture as the slid track
  renderHistory();
  renderScore({ pop: survived, newMilestones: hits });
  renderHand({ dealtIdx: survived ? idx : undefined });
  milestoneSound(hits);
}

// Switches the qubit style (Bra-Ket <-> Polarization). The run itself is
// untouched, since both styles share the abstract deck; only drawing changes.
function setDomain(d){
  if (d !== 'braket' && d !== 'polarization') return; // values come from data-* attributes; accept only known styles
  if (game && game.busy) return; // re-rendering mid-animation would tear down the sliding track
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

  const panel = $('stage-panel');
  if (opts.lostFx){ panel.classList.remove('lost-fx'); void panel.offsetWidth; panel.classList.add('lost-fx'); }
  panel.classList.toggle('is-lost', game.phase === 'lost');
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
      '<button type="button" class="hand-card lost-card" data-idx="' + i + '"><span class="card-key">' + (i + 1) + '</span>' +
      '<span class="lost-text">Start New Game</span></button>').join('');
  } else {
    hand.innerHTML = game.hand.map((id, i) =>
      '<button type="button" class="hand-card' + (opts.dealtIdx === i ? ' dealt' : '') + '" data-idx="' + i + '" aria-label="Play ' + cardName(id, d, true) + '">' +
      '<span class="card-key">' + (i + 1) + '</span>' + cardTileHTML(id, d) +
      '<span class="card-name">' + cardName(id, d) + '</span></button>').join('');
  }
  hand.querySelectorAll('.hand-card').forEach(b => b.addEventListener('click', () => playCard(Number(b.dataset.idx))));
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
  });

  wirePillGroup($('domain-toggle'), v => setDomain(v));
  $('mute-btn').addEventListener('click', () => { setSound(!settings.sound); renderHeader(); renderSetup(); });
  // Leaving for the main menu ends the run. Dropping the game object also
  // cancels any play animation still in flight (its steps check alive(),
  // i.e. that `game` is still the object they started with) and releases
  // its busy lock immediately, so the setup screen's controls respond at
  // once instead of being ignored until the orphaned animation finishes.
  $('menu-btn').addEventListener('click', () => { game = null; renderSetup(); showScreen('setup-screen'); });

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
