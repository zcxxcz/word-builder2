import { useEffect } from 'react';
import { speak } from '../../lib/tts';
import { useSettingsStore } from '../../stores/settingsStore';
import './StudyCards.css';

export default function RecallCard({ word, showAnswer, onReveal, onSubmit }) {
    const { settings } = useSettingsStore();

    const handleSpeak = () => {
        speak(word.word, { rate: settings.tts_rate, enabled: settings.tts_enabled });
    };

    useEffect(() => {
        const handleDocumentKeyDown = (e) => {
            const target = e.target;
            const tagName = target?.tagName?.toLowerCase();
            const isTypingTarget = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable;
            const key = e.key.toLowerCase();

            if (isTypingTarget || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;

            if (e.key === 'Enter' && !showAnswer) {
                e.preventDefault();
                onReveal();
            } else if (showAnswer && key === 'c') {
                e.preventDefault();
                onSubmit(true);
            } else if (showAnswer && key === 'w') {
                e.preventDefault();
                onSubmit(false);
            }
        };

        window.addEventListener('keydown', handleDocumentKeyDown);
        return () => window.removeEventListener('keydown', handleDocumentKeyDown);
    }, [showAnswer, onReveal, onSubmit]);

    return (
        <div className="study-card recall-card">
            <div className="card-phase-label">意思回想</div>

            <div className="card-word">
                <span className="word-text">{word.word}</span>
                <button className="btn-speak" onClick={handleSpeak} title="发音">
                    🔊
                </button>
            </div>

            {word.phonetic && (
                <div className="card-phonetic">{word.phonetic}</div>
            )}

            {!showAnswer ? (
                <div className="card-action-area">
                    <p className="hint-text">先回想这个词的中文意思...</p>
                    <button className="btn-reveal" onClick={onReveal}>
                        👁️ 显示答案
                    </button>
                    <p className="hint-keyboard">按 Enter 显示答案</p>
                </div>
            ) : (
                <div className="card-answer-area">
                    <div className="card-meaning">{word.meaning_cn}</div>
                    {word.example && (
                        <div className="card-example">
                            <span className="example-label">例句</span>
                            {word.example}
                        </div>
                    )}
                    <div className="card-eval-buttons">
                        <button
                            className="btn-eval btn-know"
                            onClick={() => onSubmit(true)}
                        >
                            ✅ 想对了
                        </button>
                        <button
                            className="btn-eval btn-dont-know"
                            onClick={() => onSubmit(false)}
                        >
                            ❌ 没想出来
                        </button>
                    </div>
                    <p className="hint-keyboard">按 C 表示想对了，按 W 表示没想出来</p>
                </div>
            )}
        </div>
    );
}
