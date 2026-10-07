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
| Qubit style | Bra-Ket / Polarization | Bra-Ket | Yes (header toggle) |
| Numbers | Real-Only / Complex | Complex | No — locked in once the quest starts |
| Sound | On / Off | On | Yes (header mute button) |
| Animations | On / Off | On (Off if the system asks for reduced motion) | No — set on the welcome screen |
| Theme | Light / Dark | Dark | Yes (header ☀/☾ switch) |

Numbers is locked because it changes the deck (and therefore par); qubit style
only changes how things are drawn, so it can change at any time without
affecting the run.

## Gameplay (identical to the lab's Game mode)

- The qubit starts in |0⟩ (a horizontally polarized photon).
- You hold three objects. Play one per turn (click, or press 1/2/3).
- **Measurements** (projectors / polarizers) pass the qubit with certainty if
  it matches, never if it's orthogonal, and 50% of the time otherwise; a
  surviving qubit collapses to the measurement's state.
- **Gates** (Pauli, Hadamard, basis changes, identity / wave-plates,
  maple syrup, clear glass) always pass, but can change the state.
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

Every object is one abstract card in `app.js` (`CARDS`) with a Bra-Ket
rendering and a Polarization rendering. Gameplay only touches the abstract
card, which is what makes mid-game switching safe.

| Bra-Ket | Polarization | In Real-Only? |
|---|---|---|
| Projector onto \|0⟩ | Horizontal Polarizer | Yes |
| Projector onto \|1⟩ | Vertical Polarizer | Yes |
| Projector onto \|+⟩ | +45° Polarizer | Yes |
| Projector onto \|−⟩ | −45° Polarizer | Yes |
| Projector onto \|+i⟩ | Left-Circular Polarizer | No |
| Projector onto \|−i⟩ | Right-Circular Polarizer | No |
| Pauli-Z Gate | Phase / Z Half Wave-Plate (0°) | Yes |
| Pauli-X Gate | Not / X Half Wave-Plate (45°) | Yes |
| Pauli-Y Gate | **Maple Syrup** (new; 90° rotation) | Yes |
| Hadamard Gate | Hadamard Half Wave-Plate (22.5°) | Yes |
| Basis Change (Z↔Y) | Quarter Wave-Plate (45°) | No |
| Basis Change (X↔Y) | Quarter Wave-Plate (0°) | No |
| Identity Gate | Clear Glass | Yes |

**Circular states and handedness:** |±i⟩ = (|0⟩ ± i|1⟩)/√2, the standard
quantum-information definitions (|+i⟩ is Y's +1 eigenstate). Handedness names
follow the lab's optics (Hecht) convention, where right-circular is
(1, −i)/√2, so |+i⟩ is *left*-circular here. Under the helicity convention the
names swap; the physics doesn't. Note: the Superposition and Measurement Lab
currently pairs |+i⟩ with right-circular, which under its own convention makes
its "|+i⟩" the vector (1, −i)/√2 — Y's −1 eigenstate. Worth fixing there too.

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
guaranteed-safe object when holding one, otherwise a 50/50 one. Both styles
share one deck, so they share par.

| Numbers | Mean streak | Par |
|---|---|---|
| Real-Only | 6.87 | 7 |
| Complex | 5.27 | 5 |

Re-simulated on this game's own deck (300,000 games per setting) and matching
the lab's Bra-Ket values. Stored as `PAR` in `app.js`; re-run a simulation if
the deck or draw weighting ever changes.

Two milestones fire once per run: **Par beaten!** (streak passes par, with a
fanfare) and **New best!** (streak passes your best from before the run —
not shown on the very first run of a session). Best streak is kept per
Numbers setting for the browser session only; nothing is stored.

## File overview

- `index.html` — welcome/setup screen (with a live preview that redraws in the
  selected style) and the game screen (scoreboard, message banner, beam stage,
  history strip, hand). Also holds the shared SVG arrowhead `<marker>` library.
- `style.css` — Hadamard's Hoard's dark theme and components, plus the stage.
  Every theme-dependent color is a CSS variable; the light theme (the lab's
  palette) just overrides them under `:root[data-theme="light"]`.
  The header comment documents the color roles: red = controls, cyan = the
  qubit itself, gold = score/success, and the lab's object tints (dark =
  measurement, pale blue = transformation, pink = quarter-wave plate,
  near-white = identity).
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
  vector. Par was re-simulated on this exact deck.
- **Stress test:** 5,000 random actions with animations off (plays, style
  and theme switches, mute, menu exits, restarts with random Numbers), and
  120 animated plays with interference landing mid-animation. After every
  step, invariants were checked: streak = cards survived, three valid cards
  in hand, four stage slots, one logo, milestone flags consistent, and so on.
- **Animation seams:** the slid track lands on exactly the same pixels as
  the resting stage.
- **Layout sweep, 320–1440 px:** no clipping or page overflow.

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
