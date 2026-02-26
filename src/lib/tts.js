/**
 * Text-to-Speech utility using Web Speech API
 */

let synth = null;

function getSynth() {
    if (!synth) {
        synth = window.speechSynthesis;
    }
    return synth;
}

/**
 * Speak a word or phrase using TTS
 * @param {string} text - Text to speak
 * @param {object} options - { rate: number, enabled: boolean }
 */
export function speak(text, options = {}) {
    const { rate = 1.0, enabled = true } = options;
    if (!enabled) return;

    const synthesis = getSynth();
    if (!synthesis) return;

    // Cancel any ongoing speech
    synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    utterance.pitch = 1.0;

    // Try to find an English voice
    const voices = synthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en'));
    if (englishVoice) {
        utterance.voice = englishVoice;
    }

    synthesis.speak(utterance);
}

/**
 * Stop any ongoing speech
 */
export function stopSpeaking() {
    const synthesis = getSynth();
    if (synthesis) {
        synthesis.cancel();
    }
}
