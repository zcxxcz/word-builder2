import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { THEMES, useThemeStore } from '../stores/themeStore';
import { supabase } from '../lib/supabase';
import { upsertUsageExercise } from '../lib/usageExerciseCache';
import { REVIEW_BATCH_LIMIT } from '../utils/constants';
import { getToday } from '../utils/srs';
import { isValidUsageExercise } from '../utils/usageExercise';
import { normalizeUsageSceneMode, normalizeUsageVariantIndex, USAGE_SCENE_MODE } from '../utils/usageVariant';
import './SettingsPage.css';

export default function SettingsPage() {
    const { user, signOut } = useAuthStore();
    const { settings, updateSettings } = useSettingsStore();
    const { theme, setTheme } = useThemeStore();
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [clearStep, setClearStep] = useState(0);
    const [importMessage, setImportMessage] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const effectiveReviewCap = Math.min(settings.review_cap, REVIEW_BATCH_LIMIT);

    useEffect(() => {
        let cancelled = false;

        async function checkAdmin() {
            if (!user) return;
            const { data, error } = await supabase.rpc('is_admin');
            if (!cancelled) {
                setIsAdmin(!error && Boolean(data));
            }
        }

        checkAdmin();
        return () => {
            cancelled = true;
        };
    }, [user]);

    const handleSettingChange = (key, value) => {
        updateSettings(user.id, { [key]: value });
    };

    // Export JSON
    const handleExport = async () => {
        const { data: states } = await supabase
            .from('user_word_state')
            .select('*')
            .eq('user_id', user.id);

        const { data: sessions } = await supabase
            .from('sessions')
            .select('*')
            .eq('user_id', user.id);

        const { data: customLists } = await supabase
            .from('custom_wordlists')
            .select('*')
            .eq('user_id', user.id);

        const { data: customWords } = await supabase
            .from('custom_words')
            .select('*')
            .eq('user_id', user.id);

        const { data: usageExercises } = await supabase
            .from('user_usage_exercises')
            .select('*')
            .eq('user_id', user.id);

        const { data: userSettings } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

        const exportData = {
            version: 2,
            exported_at: new Date().toISOString(),
            user_word_state: states || [],
            sessions: sessions || [],
            custom_wordlists: customLists || [],
            custom_words: customWords || [],
            user_usage_exercises: usageExercises || [],
            user_settings: userSettings || {},
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `word-builder-backup-${getToday()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Import JSON
    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setImportMessage('');
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (!data.version) throw new Error('无效的备份文件');

                // Import word states
                if (data.user_word_state?.length > 0) {
                    for (const state of data.user_word_state) {
                        await supabase.from('user_word_state').upsert({
                            ...state,
                            user_id: user.id,
                        }, { onConflict: 'user_id,word' });
                    }
                }

                // Import custom wordlists and words
                if (data.custom_wordlists?.length > 0) {
                    for (const list of data.custom_wordlists) {
                        const { data: newList } = await supabase
                            .from('custom_wordlists')
                            .insert({ user_id: user.id, name: list.name, description: list.description })
                            .select('id')
                            .single();

                        if (newList && data.custom_words) {
                            const listWords = data.custom_words.filter(w => w.wordlist_id === list.id);
                            for (const word of listWords) {
                                await supabase.from('custom_words').insert({
                                    user_id: user.id,
                                    wordlist_id: newList.id,
                                    word: word.word,
                                    meaning_cn: word.meaning_cn,
                                    phonetic: word.phonetic,
                                    example: word.example,
                                });
                            }
                        }
                    }
                }

                // Import cached usage exercises
                if (data.user_usage_exercises?.length > 0) {
                    for (const exercise of data.user_usage_exercises) {
                        if (isValidUsageExercise(exercise, {
                            word: exercise.word,
                            meaningCn: exercise.meaning_cn || '',
                        })) {
                            await upsertUsageExercise({
                                userId: user.id,
                                word: exercise.word,
                                meaningCn: exercise.meaning_cn || '',
                                variantIndex: normalizeUsageVariantIndex(exercise.variant_index),
                                promptCn: exercise.prompt_cn,
                                referenceAnswerEn: exercise.reference_answer_en,
                            });
                        }
                    }
                }

                // Import settings
                if (data.user_settings) {
                    await updateSettings(user.id, {
                        daily_new: data.user_settings.daily_new,
                        review_cap: data.user_settings.review_cap,
                        relapse_cap: data.user_settings.relapse_cap,
                        tts_enabled: data.user_settings.tts_enabled,
                        tts_rate: data.user_settings.tts_rate,
                        sound_enabled: data.user_settings.sound_enabled ?? true,
                        usage_scene_mode: data.user_settings.usage_scene_mode,
                    });
                }

                setImportMessage('✅ 导入成功！');
            } catch (err) {
                setImportMessage('❌ 导入失败：' + err.message);
            }
        };
        reader.readAsText(file);
    };

    // Clear data
    const handleClear = async () => {
        if (clearStep < 1) {
            setClearStep(1);
            return;
        }

        await supabase.from('user_word_state').delete().eq('user_id', user.id);
        await supabase.from('sessions').delete().eq('user_id', user.id);
        await supabase.from('active_study_sessions').delete().eq('user_id', user.id);
        await supabase.from('user_usage_exercises').delete().eq('user_id', user.id);
        await supabase.from('custom_words').delete().eq('user_id', user.id);
        await supabase.from('custom_wordlists').delete().eq('user_id', user.id);

        setClearStep(0);
        setShowClearConfirm(false);
        alert('数据已清空');
    };

    return (
        <div className="settings-page">
            <header><h1>我的</h1></header>

            {/* User info */}
            <div className="settings-section">
                <div className="user-info">
                    <div className="user-avatar">👤</div>
                    <div className="user-details">
                        <div className="user-email">{user?.email}</div>
                        <div className="user-id-label">已登录</div>
                    </div>
                </div>
            </div>

            {/* Appearance */}
            <div className="settings-section">
                <h2>界面主题</h2>
                <div className="theme-segmented-control" role="group" aria-label="界面主题">
                    <button
                        type="button"
                        className={`theme-option ${theme === THEMES.CLASSIC ? 'active' : ''}`}
                        onClick={() => setTheme(THEMES.CLASSIC)}
                    >
                        经典
                    </button>
                    <button
                        type="button"
                        className={`theme-option ${theme === THEMES.FLORR ? 'active' : ''}`}
                        onClick={() => setTheme(THEMES.FLORR)}
                    >
                        Florr
                    </button>
                </div>
            </div>

            {/* Learning settings */}
            <div className="settings-section">
                <h2>学习设置</h2>
                <div className="setting-item">
                    <div className="setting-label">
                        <span>每日新学量</span>
                        <span className="setting-value">{settings.daily_new} 词</span>
                    </div>
                    <input
                        type="range"
                        min="3"
                        max="30"
                        value={settings.daily_new}
                        onChange={e => handleSettingChange('daily_new', parseInt(e.target.value))}
                        className="setting-slider"
                    />
                </div>
                <div className="setting-item">
                    <div className="setting-label">
                        <span>单次复习上限</span>
                        <span className="setting-value">{effectiveReviewCap} 词</span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max={REVIEW_BATCH_LIMIT}
                        value={effectiveReviewCap}
                        onChange={e => handleSettingChange('review_cap', parseInt(e.target.value))}
                        className="setting-slider"
                    />
                </div>
                <div className="setting-item">
                    <div className="setting-label">
                        <span>回流上限</span>
                        <span className="setting-value">{settings.relapse_cap} 词</span>
                    </div>
                    <input
                        type="range"
                        min="3"
                        max="20"
                        value={settings.relapse_cap}
                        onChange={e => handleSettingChange('relapse_cap', parseInt(e.target.value))}
                        className="setting-slider"
                    />
                </div>
                <div className="setting-item setting-item-block">
                    <div className="setting-label">
                        <span>场景题模式</span>
                    </div>
                    <div className="theme-segmented-control setting-segmented-control" role="group" aria-label="场景题模式">
                        <button
                            type="button"
                            className={`theme-option ${normalizeUsageSceneMode(settings.usage_scene_mode) === USAGE_SCENE_MODE.ROTATE ? 'active' : ''}`}
                            onClick={() => handleSettingChange('usage_scene_mode', USAGE_SCENE_MODE.ROTATE)}
                        >
                            轮换 A/B
                        </button>
                        <button
                            type="button"
                            className={`theme-option ${normalizeUsageSceneMode(settings.usage_scene_mode) === USAGE_SCENE_MODE.FIXED_A ? 'active' : ''}`}
                            onClick={() => handleSettingChange('usage_scene_mode', USAGE_SCENE_MODE.FIXED_A)}
                        >
                            固定场景 A
                        </button>
                    </div>
                </div>
            </div>

            {/* TTS Settings */}
            <div className="settings-section">
                <h2>发音设置</h2>
                <div className="setting-item">
                    <div className="setting-label">
                        <span>自动发音</span>
                    </div>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={settings.tts_enabled}
                            onChange={e => handleSettingChange('tts_enabled', e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
                <div className="setting-item">
                    <div className="setting-label">
                        <span>答题音效</span>
                    </div>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={settings.sound_enabled}
                            onChange={e => handleSettingChange('sound_enabled', e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
                <div className="setting-item">
                    <div className="setting-label">
                        <span>语速</span>
                        <span className="setting-value">{settings.tts_rate}x</span>
                    </div>
                    <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.1"
                        value={settings.tts_rate}
                        onChange={e => handleSettingChange('tts_rate', parseFloat(e.target.value))}
                        className="setting-slider"
                    />
                </div>
            </div>

            {/* Help */}
            <div className="settings-section">
                <h2>帮助</h2>
                <a className="setting-btn setting-link" href={`${import.meta.env.BASE_URL}user-manual.html`}>
                    📖 使用手册
                </a>
            </div>

            {isAdmin && (
                <div className="settings-section">
                    <h2>管理</h2>
                    <Link className="setting-btn setting-link" to="/admin">
                        📊 后台管理
                    </Link>
                </div>
            )}

            {/* Data management */}
            <div className="settings-section">
                <h2>数据管理</h2>
                <button className="setting-btn" onClick={handleExport}>
                    📤 导出数据 (JSON)
                </button>
                <label className="setting-btn upload-label">
                    📥 导入数据 (JSON)
                    <input type="file" accept=".json" onChange={handleImport} hidden />
                </label>
                {importMessage && <div className="import-message">{importMessage}</div>}
                <button
                    className="setting-btn danger"
                    onClick={() => setShowClearConfirm(true)}
                >
                    🗑️ 清空所有数据
                </button>
            </div>

            {/* Clear confirmation */}
            {showClearConfirm && (
                <div className="modal-overlay" onClick={() => { setShowClearConfirm(false); setClearStep(0); }}>
                    <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>⚠️ 确认清空</h2>
                            <button className="btn-close" onClick={() => { setShowClearConfirm(false); setClearStep(0); }}>✕</button>
                        </div>
                        <div className="modal-body">
                            {clearStep === 0 ? (
                                <>
                                    <p className="clear-warning">此操作将删除所有学习记录、自定义词表和设置。此操作不可撤回！</p>
                                    <button className="setting-btn danger" onClick={handleClear}>
                                        我确认要清空
                                    </button>
                                </>
                            ) : (
                                <>
                                    <p className="clear-warning">再次确认：真的要清空所有数据吗？</p>
                                    <button className="setting-btn danger" onClick={handleClear}>
                                        确认清空，不可恢复
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Logout */}
            <div className="settings-section">
                <button className="setting-btn logout" onClick={signOut}>
                    退出登录
                </button>
            </div>
        </div>
    );
}
