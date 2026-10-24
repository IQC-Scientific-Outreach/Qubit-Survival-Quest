# Qubit Survival Quest — Browser Game

A single-player survival game from the University of Waterloo's Institute
for Quantum Computing (IQC Scientific Outreach): keep one qubit alive as long
as possible by choosing which object to put in its path next. It's the Game
mode of the *Superposition and Measurement Lab*, pulled out on its own with a
layout built for gameplay and for science-fair-style demonstrations.

## Running it

This is a static site: no build step, no dependencies.

- **Locally**: open `index.html` in a browser (double-clicking works — there
  are no iframes or `fetch` calls, so `file://` is fine), or run
  `python3 -m http.server` and visit it.
- **GitHub Pages**: push this folder to a repo, then in
  **Settings → Pages** set the source to the branch/root containing these
  files.
- **Offline**: everything works without internet except the Barlow Condensed
  heading font, which falls back to a system font. Kets are drawn with CSS and
  SVG rather than KaTeX, so there's no CDN dependency for the math.

## What's configurable at setup

| Setting | Options | Default | Changeable mid-game? |
|---|---|---|---|
| Qubit style | Bra-Ket / Polarization / Analogy | Bra-Ket | Yes (header toggle): Bra-Ket ↔ Polarization in quests started in either; Analogy ↔ Bra-Ket in quests started in Analogy |
| Numbers | Real-Only / Complex (called Two Box / Three Box in Analogy) | Complex | No — locked in once the quest starts |
| Sound | On / Off | On | Yes (header mute button) |
| Animations | On / Off | On (Off if the system asks for reduced motion) | No — set on the welcome screen |
| Theme | Light / Dark | Dark | Yes (header ☀/☾ switch) |

Numbers is locked because it changes the deck (and therefore par). Switching
between Bra-Ket and Polarization only changes how things are drawn, so it can
happen at any time without affecting the run. Analogy's two basis changes
behave differently (see below), so which physics a run uses is set by the
style it starts in. A quest started in Analogy uses the exact swaps
throughout and can switch between Analogy and Bra-Ket, whose "U" basis-change
cards then stand for the exact swaps. It can't show Polarization, whose twin
is a real quarter-wave plate. A quest started in Bra-Ket or Polarization uses
real quarter-wave plates and can't switch to Analogy. The header shows only
the two styles a run can use (`runDomains` in `app.js`).

## Gameplay (identical to the lab's Game mode)

- The qubit starts in |0⟩ (a horizontally polarized photon).
- You hold three objects. Play one per turn (click, or press 1/2/3).
- **Measurements** (projectors / polarizers / declarations) pass the qubit with certainty if
  it matches, never if it's orthogonal, and 50% of the time otherwise; a
  surviving qubit collapses to the measurement's state.
- **Gates** (Pauli, Hadamard, basis changes, identity / wave-plates,
  maple syrup, clear glass / box flips and swaps) always pass, but can
  change the state.
- Each survived object adds 1 to the streak. The played object is replaced by
  a fresh draw.
- Projectors are drawn twice as often as gates (1-in-3 chance of drawing from
  the gate category), uniform within each category.
- On a loss, the streak stays on screen and the hand becomes three
  "Start New Game" cards, as in the lab.
- All message text matches the lab ("Successful Transmission!", "You got lucky
  that time!", "State transformed!" / "Polarization state rotated!",
  "Nothing happens!", "Qubit Lost!" / "Photon Lost!", and both loss reasons).

## Object twins (the 1:1 deck mapping)

Every object is one abstract card in `app.js` (`CARDS`) with a Bra-Ket,
a Polarization and an Analogy rendering. Gameplay only touches the abstract
card, which is what makes mid-game switching between Bra-Ket and
Polarization safe. Analogy matches them object for object, except that its
basis changes are exact swaps (marked * below).

| Bra-Ket | Polarization | Analogy | In Real-Only / Two Box? |
|---|---|---|---|
| Projector onto \|0⟩ | Horizontal Polarizer | Declare Z = 0 | Yes |
| Projector onto \|1⟩ | Vertical Polarizer | Declare Z = 1 | Yes |
| Projector onto \|+⟩ | +45° Polarizer | Declare X = 0 | Yes |
| Projector onto \|−⟩ | −45° Polarizer | Declare X = 1 | Yes |
| Projector onto \|+i⟩ | Left-Circular Polarizer | Declare Y = 0 | No |
| Projector onto \|−i⟩ | Right-Circular Polarizer | Declare Y = 1 | No |
| Pauli-Z Gate | Phase / Z Half Wave-Plate (0°) | Flip X & Y | Yes |
| Pauli-X Gate | Not / X Half Wave-Plate (45°) | Flip Z & Y | Yes |
| Pauli-Y Gate | **Maple Syrup** (new; 90° rotation) | Flip Z & X | Yes |
| Hadamard Gate | Hadamard Half Wave-Plate (22.5°) | Swap X ↔ Z, flip Y | Yes |
| Basis Change (Z↔Y) | Quarter Wave-Plate (45°) | Swap Z ↔ Y, flip X * | No |
| Basis Change (X↔Y) | Quarter Wave-Plate (0°) | Swap X ↔ Y, flip Z * | No |
| Identity Gate | Clear Glass | Nothing changes | Yes |

In Two Box games the Y box is hidden everywhere, so for example Hadamard
reads "Swap X ↔ Z" and Pauli-Z reads "Flip X".

**\* About the Analogy's basis changes:** Bra-Ket and Polarization keep the
lab's physics: each basis change is a real quarter-wave plate, a quarter-turn
of the Bloch / Poincaré sphere. The QWP at 0° leaves Z alone and exchanges X
and Y, but one direction comes back flipped (|+⟩ → |+i⟩, while |+i⟩ → |−⟩).
In the Analogy that would read "swap, then flip one of them", so the
Analogy's versions exchange the two bases exactly, the way Hadamard does,
and (also like Hadamard) flip the third: Z↔Y sends |0⟩ ↔ |+i⟩ and
|1⟩ ↔ |−i⟩ and flips X; X↔Y sends |+⟩ ↔ |+i⟩ and |−⟩ ↔ |−i⟩ and flips Z.
(Swapping two bases *without* flipping the third would be a mirror image of
the sphere, which no gate can do.) Each is a half-turn about an axis halfway
between the two swapped ones, physically a half-wave plate followed by a
quarter-wave plate. These live in `applySwapZY` / `applySwapXY`, used only
in quests started in Analogy, including while they are shown in Bra-Ket
(`an.apply` in `CARDS`, chosen by `applyFor`).

## Analogy style

The qubit is drawn as three boxes, one per measurement basis: **X** (red),
**Y** (green) and **Z** (blue). Each box is labelled with its letter as well
as its colour. Exactly one box is known and shows 0 or 1; the other two are
random, drawn as a 0 and a 1 on the same spot under drifting cloud, fading
between the two (sometimes showing the top of one and the bottom of the
other). Each
basis's +1 eigenstate reads 0 and its −1 eigenstate reads 1: |0⟩ is Z = 0,
|−⟩ is X = 1, |+i⟩ is Y = 0, and so on.

- A **declaration** (projector) like "Z = 1" survives if Z is known to be 1,
  fails if Z is known to be 0, and is a 50/50 if Z is random. If it
  survives, Z becomes the known box and the other two go random.
- A **gate** swaps the values of two boxes, flips boxes (0 ↔ 1), or both.
  Random boxes stay random.

Cards always use the same layout: Y on top, X bottom-left, Z bottom-right
(or just X and Z side by side in Two Box games), so every pair of boxes
shares an edge. A double arrow on an edge means the two boxes exchange
values, a ring of arrows around a box means it flips, and a dashed outline
means it is unaffected. Declarations are dark tiles, gates pale blue and the
identity near-white, the same colour convention as the other styles.

The stage is one large set of boxes rather than the beam: [last object] →
[boxes] → [next object]. During a play, swapped values slide along their
edge into each other's box and flipped boxes spin over. A declaration
stamps "Z = 1" onto its box, which pulses gold if it was already true or
flashes red if false, and a random box stops and shows what it came up as.
On a loss the boxes grey out under an ✕. A quest started in Analogy can
switch to Bra-Ket and back at any time, but not to Polarization. Phones drop the "next object"
placeholder to give the boxes more room. The `an` entries in `CARDS` and
`STATES` hold this mapping, and testing checks every one against the
actual gate matrices.

**About the Maple Syrup:** the lab's Polarization deck had no equivalent of
Pauli-Y, so a strict 1:1 mapping needed a new object. Y's eigenstates are
|+i⟩ and |−i⟩ (right and left circular) with eigenvalues +1 and −1: a π phase
shift between the two circular components. That's circular birefringence
(optical activity), which rotates linear polarization by half the phase
difference, 90°. So Y = *i*·R(90°), a 90° rotation up to an unobservable global
phase, and an optically active material of the right thickness realizes it.
Maple syrup, a sugar solution, is the classic demonstration. At exactly 90°
the rotation direction doesn't matter, since R(−90°) = −R(90°). It can't be a
wave-plate: a half-wave plate's matrix is a reflection (determinant −1), while
a rotation has determinant +1. Verified in testing (Y and R(90°) agree on all
six states up to phase). The same table appears in-app under "Object twins",
generated from `CARDS` so it can't drift out of sync.

## Par

Par is the mean streak (rounded) for a careful player who always plays a
guaranteed-safe object when holding one, otherwise a 50/50 one. All styles
share one deck, so they share par.

| Numbers | Mean streak | Par |
|---|---|---|
| Real-Only | 6.87 | 7 |
| Complex | 5.27 | 5 |

Re-simulated on this game's own deck (300,000 games per setting) and matching
the lab's Bra-Ket values. Analogy uses the same par. Two Box has no basis
changes, so it is the same game as Real-Only. In Three Box, the exact-swap
basis changes raise the mean by about 0.1 (5.39 → 5.45 in a 300,000-game
run with a slightly different simulated player), which doesn't change par. Stored as `PAR` in `app.js`; re-run a simulation if
the deck or draw weighting ever changes.

Two milestones fire once per run: **Par beaten!** (streak passes par, with a
fanfare) and **New best!** (streak passes your best from before the run —
not shown on the very first run of a session). Best streak is kept per
Numbers setting for the browser session only; nothing is stored.

## File overview

- `index.html` — welcome/setup screen (with a live preview that redraws in the
  selected style) and the game screen (scoreboard, message banner, beam stage
  or Analogy boxes, history strip, hand). Also holds the shared SVG arrowhead `<marker>` library.
- `style.css` — Hadamard's Hoard's dark theme and components, plus the stage.
  Every theme-dependent color is a CSS variable; the light theme (the lab's
  palette) just overrides them under `:root[data-theme="light"]`.
  The header comment documents the color roles: red = controls, cyan = the
  qubit itself, gold = score/success, and the lab's object tints (dark =
  measurement, pale blue = transformation, pink = quarter-wave plate,
  near-white = identity), plus the Analogy's red/green/blue X/Y/Z boxes.
- `app.js` — sectioned top to bottom: physics, states, deck, rules, markup,
  UI. Sections 1–4 have no DOM dependencies and load headless for testing.
- `audio.js` — Hadamard's Hoard's Web Audio synthesizer, trimmed to the sounds
  used here, plus two new milestone sounds.
- `UW_IQC_logo_reverse.png` — the white-wordmark lockup, shown in the dark theme.
- `UW_IQC_logo.png` — the dark-wordmark lockup, shown in the light theme (cropped
  to its content, like the reverse logo).

## Sound

Card played: snap. Measurement survived: rising chime. Gate changed the
state: whoosh. Gate had no effect: soft blip. Qubit lost: "womp womp". New
best: arpeggio. Par beaten: short fanfare. All synthesized in code.

## Play animation

Modeled on the lab's Build-mode photon animation. When an object is played:

1. It drops into the "next object" slot.
2. The qubit (a copy of the current state tile) shrinks and travels into
   it, passing *behind* the object. The state it left dims and becomes the
   prior state.
3. Hidden behind the object, it becomes the new state, then emerges while
   the whole stage slides one step left, so everything lands in its new
   place: prior state, object, current state, next slot.
4. If absorbed instead, the object flashes red and the qubit fades inside
   it, then the stage slides left with the ✕ in place.

A survived play takes about 0.5 s, a loss about 0.8 s (`TIMING` in
`app.js`). With Animations off, plays resolve instantly.

How it's built (see the comment above `animatePlay()`): the stage is a
fixed-width window over a sliding track. For a play the track briefly holds
six slots instead of four; the qubit token lives inside the track, so the
slide carries it along and it stays layered behind objects. When the slide
finishes (`transitionend`, with a timer fallback), the resting four-slot
stage is swapped in; tested to land on exactly the same pixels, so there's
no visible jump. Input and the style toggle are ignored mid-animation, and
leaving for the main menu mid-animation cancels it cleanly.

## Security

A static page with no backend, no accounts, no storage and no user text
input, so the attack surface is small. What's in place:

- **Content-Security-Policy** (a `<meta>` tag in `index.html`, since GitHub
  Pages can't set headers): only the game's own scripts, stylesheet and
  images, plus Google Fonts. Inline scripts, inline event handlers, `eval`,
  outbound network requests, plugins, frames, forms and `<base>` are all
  refused. Tested in Chromium, both from `file://` and over HTTP: zero
  violations during play, and injected scripts, an `onerror` XSS payload,
  string-`eval`, `fetch` and third-party scripts were all blocked. `file:` is
  allowed alongside `'self'` so the page still works when opened by
  double-click in browsers that don't count other local files as `'self'`
  (not tested in Firefox/Safari; please spot-check).
- **No user data reaches markup.** Rendering uses `innerHTML`, which is safe
  here only because every inserted string comes from constants in `app.js`.
  Keep it that way: set any future user-provided text with `textContent`.
- **Input validation:** values read back from the page (`data-*` attributes)
  are checked before use (`playCard`, `setDomain`).
- **Links** open with `rel="noopener noreferrer"`, and the page sends no
  referrer to third parties (`<meta name="referrer" content="no-referrer">`).
- **No third-party JavaScript**, so there's nothing needing Subresource
  Integrity. (Google Fonts CSS varies by browser, so it can't use SRI.)

Known limits:
- **Clickjacking:** framing can't be blocked without the `frame-ancestors`
  header, which GitHub Pages can't send. Low risk here, since the page has
  no sensitive actions.
- **Privacy:** loading Google Fonts sends visitors' IP addresses to Google.
  To avoid that, self-host Barlow Condensed and drop the two fonts.* entries
  from the CSP.

## Testing notes

Checked with headless Chromium during development:
- **Physics:** every object keeps the six states closed, with probabilities
  exactly 0, 1/2 or 1. Y matches a 90° rotation, and each caption matches its
  vector. Every Analogy card matches its object's matrix on all six states
  (declarations: probability 1 / 0 / ½ and the right collapse; gates: the
  stated swaps and flips). Par was re-simulated on this exact deck.
- **Analogy stress test:** 3,000 instant and 250 animated random actions
  across all three styles and both Numbers settings, including attempts to
  switch to every style mid-game. After each action it checks that
  the stage shows exactly one known box with the right bit, the right
  number of foggy boxes, no Y box in Two Box games, no leftover animation
  state, and that the run is only ever shown in a style it allows.
- **Shared physics unchanged:** every Bra-Ket / Polarization object gives the
  same probabilities and output states as before Analogy was added.
- **Stress test:** 5,000 random actions with animations off (plays, style
  and theme switches, mute, menu exits, restarts with random Numbers), and
  120 animated plays with interference landing mid-animation. After every
  step, invariants were checked: streak = cards survived, three valid cards
  in hand, four stage slots, one logo, milestone flags consistent, and so on.
- **Animation seams:** the slid track lands on exactly the same pixels as
  the resting stage.
- **Layout sweep, 320–1440 px:** no clipping or page overflow, including
  the Analogy boxes on portrait phones down to 320×568.

Bugs found and fixed in the debugging pass:
- Holding a number key played a card on every auto-repeat.
- Leaving for the main menu mid-animation briefly ignored the setup
  screen's style buttons.
- The stage clipped at about 561–640 px wide and at 320 px.

## Accessibility

Audited with an in-page checker on every screen, both themes, at rest:
control names, text alternatives, contrast (computed from rendered colors,
including opacity and gradients), landmarks/headings, labels, plus a
keyboard focus walk. Zero findings after the fixes below. Behaviour was
verified separately with scripted keyboard tests.

- **Keyboard:** everything is a native button. Keys 1–3 play cards
  (advertised with `aria-keyshortcuts`, and held keys don't auto-repeat).
  Focus stays on the same card slot after a play, and moves to the new
  screen's heading on Begin / Main menu. Visible focus rings everywhere.
- **Screen readers:** each play produces one announcement, from a hidden
  status line: outcome, new state, streak ("State transformed! … Current
  state: ket plus. Streak 1."). Kets, projectors and the basis-expansion
  fractions have spoken labels ("ket 0 plus i ket 1, over square root of
  2"). Switches use `role="switch"` + `aria-checked`, pills use
  `aria-pressed`, and the stage and history have labels.
- **Contrast (WCAG AA):**
  - "Begin quest" was 2.2:1; it's now white on a deeper red.
  - The basis-change "U" was 4.1:1; it's now 5.4:1.
  - The light-mode state blue was deepened.
  - The prior-state ket is dimmed by color rather than opacity, so even
    its subscript meets 4.5:1.
- **Structure:** one `<h1>` per screen, and a `<main>` landmark on both.
- **Motion:** Animations default to off under `prefers-reduced-motion`, and
  CSS disables all motion there too.

Not automatable, so worth a check with a real screen reader (NVDA/JAWS/
VoiceOver): the reading order and verbosity of the stage during play.
