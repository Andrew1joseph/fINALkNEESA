const SoundFX = (() => {
  let audioCtx = null;

  function getContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function playTone(frequency, duration, type, volume) {
    try {
      const ctx = getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(volume || 0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // Audio not supported, silently fail
    }
  }

  return {
    correct() {
      playTone(523.25, 0.15, 'sine', 0.12);
      setTimeout(() => playTone(659.25, 0.15, 'sine', 0.12), 100);
      setTimeout(() => playTone(783.99, 0.3, 'sine', 0.12), 200);
    },

    incorrect() {
      playTone(200, 0.3, 'sawtooth', 0.08);
      setTimeout(() => playTone(150, 0.4, 'sawtooth', 0.08), 150);
    },

    tick() {
      playTone(800, 0.05, 'sine', 0.04);
    },

    timeWarning() {
      playTone(600, 0.1, 'triangle', 0.08);
    },

    timeDanger() {
      playTone(400, 0.15, 'sawtooth', 0.08);
    },

    join() {
      playTone(440, 0.1, 'sine', 0.08);
      setTimeout(() => playTone(554.37, 0.1, 'sine', 0.08), 80);
      setTimeout(() => playTone(659.25, 0.15, 'sine', 0.08), 160);
    },

    start() {
      playTone(523.25, 0.12, 'sine', 0.1);
      setTimeout(() => playTone(659.25, 0.12, 'sine', 0.1), 100);
      setTimeout(() => playTone(783.99, 0.12, 'sine', 0.1), 200);
      setTimeout(() => playTone(1046.5, 0.3, 'sine', 0.1), 300);
    },

    reveal() {
      playTone(440, 0.1, 'triangle', 0.08);
      setTimeout(() => playTone(660, 0.2, 'triangle', 0.08), 100);
    },

    finish() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        setTimeout(() => playTone(freq, 0.2, 'sine', 0.1), i * 150);
      });
    },

    click() {
      playTone(600, 0.05, 'sine', 0.06);
    },

    submit() {
      playTone(500, 0.08, 'sine', 0.08);
    },

    resume() {
      try {
        const ctx = getContext();
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) {}
    }
  };
})();
