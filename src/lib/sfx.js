// Lightweight study feedback sounds generated with the Web Audio API.
// No audio assets needed; volumes are kept gentle for kids studying at night.

let audioCtx = null;

function getContext() {
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    if (!audioCtx) {
        try {
            audioCtx = new Ctx();
        } catch {
            return null;
        }
    }
    if (audioCtx.state === 'suspended') {
        void audioCtx.resume();
    }
    return audioCtx;
}

function playTone(ctx, { freq, start = 0, duration = 0.12, type = 'sine', gain = 0.1 }) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const t0 = ctx.currentTime + start;

    osc.type = type;
    osc.frequency.value = freq;
    gainNode.gain.setValueAtTime(0, t0);
    gainNode.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
}

export function playCorrectSound(enabled = true) {
    if (!enabled) return;
    const ctx = getContext();
    if (!ctx) return;

    playTone(ctx, { freq: 660, start: 0, duration: 0.1 });
    playTone(ctx, { freq: 880, start: 0.09, duration: 0.14 });
}

export function playWrongSound(enabled = true) {
    if (!enabled) return;
    const ctx = getContext();
    if (!ctx) return;

    playTone(ctx, { freq: 220, start: 0, duration: 0.18, type: 'triangle', gain: 0.08 });
}

export function playComboSound(enabled = true) {
    if (!enabled) return;
    const ctx = getContext();
    if (!ctx) return;

    playTone(ctx, { freq: 660, start: 0, duration: 0.09 });
    playTone(ctx, { freq: 880, start: 0.08, duration: 0.09 });
    playTone(ctx, { freq: 1100, start: 0.16, duration: 0.16 });
}
