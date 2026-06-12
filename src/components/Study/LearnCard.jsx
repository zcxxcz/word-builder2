import { useEffect, useMemo, useRef } from 'react';
import { speak } from '../../lib/tts';
import { useSettingsStore } from '../../stores/settingsStore';
import { THEMES, useThemeStore } from '../../stores/themeStore';
import './StudyCards.css';

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightedExample({ example, word }) {
    const parts = useMemo(() => {
        const target = (word || '').trim();
        if (!target) return [example];
        try {
            return example.split(new RegExp(`(\\b${escapeRegExp(target)}\\w*)`, 'i'));
        } catch {
            return [example];
        }
    }, [example, word]);

    return (
        <span>
            {parts.map((part, index) => (
                index % 2 === 1
                    ? <strong key={index} className="learn-example-target">{part}</strong>
                    : <span key={index}>{part}</span>
            ))}
        </span>
    );
}

export default function LearnCard({ word, onContinue }) {
    const { settings } = useSettingsStore();
    const { theme } = useThemeStore();
    const isFlorrTheme = theme === THEMES.FLORR;
    const continueLockRef = useRef(false);

    const meanings = (word.all_meanings?.length > 0 ? word.all_meanings : [word.meaning_cn])
        .filter(Boolean);

    const handleSpeak = () => {
        speak(word.word, { rate: settings.tts_rate, enabled: settings.tts_enabled });
    };

    const handleContinue = () => {
        if (continueLockRef.current) return;
        continueLockRef.current = true;
        onContinue();
    };

    useEffect(() => {
        const handleDocumentKeyDown = (e) => {
            const target = e.target;
            const tagName = target?.tagName?.toLowerCase();
            const isTypingTarget = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable;

            if (isTypingTarget || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;

            if (e.key === 'Enter') {
                e.preventDefault();
                handleContinue();
            }
        };

        window.addEventListener('keydown', handleDocumentKeyDown);
        return () => window.removeEventListener('keydown', handleDocumentKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onContinue]);

    return (
        <div className="study-card learn-card">
            <div className="card-phase-label">{isFlorrTheme ? '新花瓣' : '新词认识'}</div>

            <div className="card-word">
                <span className="word-text">{word.word}</span>
                <button className="btn-speak" onClick={handleSpeak} title="发音">
                    🔊
                </button>
            </div>

            {word.phonetic && (
                <div className="card-phonetic">{word.phonetic}</div>
            )}

            <div className="learn-meaning">
                {meanings.map(meaning => (
                    <div key={meaning}>{meaning}</div>
                ))}
            </div>

            {word.example && (
                <div className="card-example learn-example">
                    <span className="example-label">例句</span>
                    <HighlightedExample example={word.example} word={word.word} />
                </div>
            )}

            <button className="btn-learn-continue" onClick={handleContinue}>
                记住了，去拼写 →
            </button>

            <p className="hint-keyboard">按 Enter 继续 · 点 🔊 再听一遍</p>
        </div>
    );
}
