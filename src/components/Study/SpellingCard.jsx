import { useState, useRef, useEffect } from 'react';
import { speak } from '../../lib/tts';
import { useSettingsStore } from '../../stores/settingsStore';
import './StudyCards.css';

export default function SpellingCard({
    word,
    spellingResult,
    correctSpelling,
    needsCorrection,
    correctionDone,
    onSubmit,
    onProceed,
}) {
    const [input, setInput] = useState('');
    const inputRef = useRef(null);
    const { settings } = useSettingsStore();

    // Pick a random meaning for display
    const displayMeaning = word.all_meanings
        ? word.all_meanings[Math.floor(Math.random() * word.all_meanings.length)]
        : word.meaning_cn;

    useEffect(() => {
        setInput('');
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [word.word, needsCorrection, spellingResult]);

    // Auto-advance after correct spelling (1 second)
    useEffect(() => {
        if (spellingResult === 'correct' || correctionDone) {
            const timer = setTimeout(() => {
                onProceed();
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [spellingResult, correctionDone]);

    const handleSpeak = () => {
        speak(word.word, { rate: settings.tts_rate, enabled: settings.tts_enabled });
    };

    const handleSubmit = (e) => {
        e?.preventDefault();
        if (!input.trim()) return;

        if (correctionDone) {
            onProceed();
            return;
        }

        onSubmit(input);

        if (spellingResult === 'correct') {
            // Will auto-advance
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (correctionDone) {
                onProceed();
            } else if (spellingResult === 'correct') {
                onProceed();
            } else {
                handleSubmit();
            }
        }
    };

    return (
        <div className="study-card spelling-card">
            <div className="card-phase-label">拼写打字</div>

            <div className="card-meaning-display">
                <span className="meaning-text">{displayMeaning}</span>
                <button className="btn-speak" onClick={handleSpeak} title="发音">
                    🔊
                </button>
            </div>

            <form className="spelling-form" onSubmit={handleSubmit}>
                <input
                    ref={inputRef}
                    type="text"
                    className={`spelling-input ${spellingResult === 'correct' ? 'input-correct' :
                            spellingResult === 'incorrect' ? 'input-incorrect' :
                                spellingResult === 'corrected' ? 'input-correct' : ''
                        }`}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={needsCorrection && !correctionDone ? '请输入正确拼写...' : '输入英文单词...'}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck="false"
                    disabled={spellingResult === 'correct' || correctionDone}
                />

                {!spellingResult && !needsCorrection && (
                    <button type="submit" className="btn-submit-spelling">
                        →
                    </button>
                )}
            </form>

            {spellingResult === 'correct' && (
                <div className="spelling-feedback correct">
                    <span className="feedback-icon">✅</span>
                    <span>正确！</span>
                </div>
            )}

            {spellingResult === 'incorrect' && !correctionDone && (
                <div className="spelling-feedback incorrect">
                    <span className="feedback-icon">❌</span>
                    <div className="feedback-content">
                        <span>正确拼写：</span>
                        <strong className="correct-word">{correctSpelling}</strong>
                        <p className="correction-hint">请再输入一次正确拼写</p>
                    </div>
                </div>
            )}

            {correctionDone && (
                <div className="spelling-feedback corrected">
                    <span className="feedback-icon">👍</span>
                    <span>纠正完成！</span>
                </div>
            )}

            <p className="hint-keyboard">按 Enter 提交</p>
        </div>
    );
}
