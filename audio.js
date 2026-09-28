/* ============================================================
   Qubit Survival Quest — sound effects
   Adapted from Hadamard's Hoard's audio.js (same three synthesis
   primitives, same envelopes), trimmed to the sounds this game uses
   plus two new milestone sounds (newBest, parBeaten).
   All sounds are synthesized with the Web Audio API, so there are no
   binary assets to host or load. Call SFX.init() from a user-gesture
   handler (the "Begin quest" click) before any other SFX call, to
   satisfy browser autoplay policies.
   ============================================================ */

const SFX = (function(){
  let ctx = null;
  let enabled = true;

  // Lazily creates (or resumes, if suspended by the browser's autoplay
  // policy) the shared AudioContext. Returns null on browsers without
  // Web Audio support, in which case every sound below just no-ops.
  function ensureCtx(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ctx = new AC();
    }
    // resume() returns a promise that can reject (e.g. no user gesture yet);
    // swallow that so it never surfaces as an unhandled rejection.
    if(ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // One oscillator note with a quick attack and exponential decay (the
  // envelope is what keeps every tone from sounding like a click).
  function tone(freq, start, duration, type, peak){
    if(!enabled) return;
    const c = ensureCtx();
    if(!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, c.currentTime + start);
    gain.gain.setValueAtTime(0.0001, c.currentTime + start);
    gain.gain.linearRampToValueAtTime(peak || 0.15, c.currentTime + start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + duration + 0.03);
  }

  // Like tone(), but the pitch glides from freqFrom to freqTo.
  function sweep(freqFrom, freqTo, start, duration, type, peak){
    if(!enabled) return;
    const c = ensureCtx();
    if(!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqFrom, c.currentTime + start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), c.currentTime + start + duration);
    gain.gain.setValueAtTime(0.0001, c.currentTime + start);
    gain.gain.linearRampToValueAtTime(peak || 0.15, c.currentTime + start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + duration + 0.03);
  }

  // A short, high-pass-filtered burst of white noise — the "snap" layered
  // under the card-flip sound.
  function noiseBurst(start, duration, peak){
    if(!enabled) return;
    const c = ensureCtx();
    if(!c) return;
    const bufferSize = Math.floor(c.sampleRate * duration);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++){
      data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(peak || 0.12, c.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + duration);
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(c.currentTime + start);
  }

  // Public API: one named sound per game event.
  return {
    setEnabled(v){ enabled = v; },
    init(){ ensureCtx(); },

    // Playing an object from your hand.
    cardFlip(){
      noiseBurst(0, 0.05, 0.10);
      sweep(1400, 500, 0, 0.06, 'square', 0.05);
    },

    // The qubit made it through a projector/polarizer.
    win(){
      tone(523.25, 0,    0.14, 'triangle', 0.16);
      tone(659.25, 0.10, 0.14, 'triangle', 0.16);
      tone(783.99, 0.20, 0.26, 'triangle', 0.18);
    },

    // Qubit lost — the classic descending "womp womp".
    fail(){
      sweep(300, 190, 0,    0.30, 'sawtooth', 0.14);
      sweep(260, 150, 0.32, 0.36, 'sawtooth', 0.14);
    },

    // A gate/wave-plate/rotator changed the state.
    thwip(){
      noiseBurst(0, 0.05, 0.10);
      sweep(900, 300, 0, 0.12, 'sine', 0.10);
    },

    // A gate that left this particular state unchanged ("Nothing happens!").
    neutral(){
      tone(440, 0, 0.08, 'sine', 0.06);
    },

    // New: the run just passed your previous best streak.
    newBest(){
      tone(523.25, 0,    0.10, 'triangle', 0.13);
      tone(659.25, 0.09, 0.10, 'triangle', 0.13);
      tone(783.99, 0.18, 0.10, 'triangle', 0.14);
      tone(1046.5, 0.27, 0.30, 'triangle', 0.16);
    },

    // New: the run just went past par — a short brass-like fanfare.
    parBeaten(){
      tone(392.00, 0,    0.12, 'sawtooth', 0.08);
      tone(523.25, 0.12, 0.12, 'sawtooth', 0.08);
      tone(659.25, 0.24, 0.12, 'sawtooth', 0.08);
      tone(783.99, 0.36, 0.45, 'sawtooth', 0.09);
      tone(1567.98, 0.36, 0.45, 'sine', 0.05);
      noiseBurst(0.36, 0.12, 0.05);
    }
  };
})();
