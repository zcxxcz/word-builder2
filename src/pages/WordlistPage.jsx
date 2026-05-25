import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { supabase } from '../lib/supabase';
import { generateWordContent } from '../lib/deepseek';
import './WordlistPage.css';

const normalizeWord = (word) => (word || '').trim().toLowerCase();

export default function WordlistPage() {
    const { user } = useAuthStore();
    const { settings, loadSettings, loaded } = useSettingsStore();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('builtin');
    const [wordlists, setWordlists] = useState([]);
    const [customWordlists, setCustomWordlists] = useState([]);
    const [selectedList, setSelectedList] = useState(null);
    const [selectedListSource, setSelectedListSource] = useState(null);
    const [selectedListName, setSelectedListName] = useState('');
    const [words, setWords] = useState([]);
    const [studiedWords, setStudiedWords] = useState(new Set());
    const [selectedWordIds, setSelectedWordIds] = useState([]);
    const [selectionError, setSelectionError] = useState('');
    const [loading, setLoading] = useState(true);

    // Add word modal
    const [showAddWord, setShowAddWord] = useState(false);
    const [addWordInput, setAddWordInput] = useState('');
    const [generatedWord, setGeneratedWord] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [genError, setGenError] = useState('');
    const [saving, setSaving] = useState(false);

    // CSV import modal
    const [showCsvImport, setShowCsvImport] = useState(false);
    const [csvData, setCsvData] = useState(null);
    const [csvName, setCsvName] = useState('');

    // Create custom list modal
    const [showCreateList, setShowCreateList] = useState(false);
    const [newListName, setNewListName] = useState('');

    const dailyNewLimit = settings.daily_new || 10;

    const loadWordlists = async () => {
        if (!user) return;

        setLoading(true);
        try {
            const { data: builtIn } = await supabase
                .from('built_in_wordlists')
                .select('*')
                .order('name');
            setWordlists(builtIn || []);

            const { data: custom } = await supabase
                .from('custom_wordlists')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            setCustomWordlists(custom || []);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (user && !loaded) {
            loadSettings(user.id);
        }
    }, [user, loaded]);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadWordlists();
        }, 0);
        return () => clearTimeout(timer);
    }, [user]);

    const loadStudiedWords = async (listWords) => {
        const wordKeys = [...new Set(listWords.map(w => normalizeWord(w.word)).filter(Boolean))];
        if (!user || wordKeys.length === 0) {
            setStudiedWords(new Set());
            return;
        }

        const { data } = await supabase
            .from('user_word_state')
            .select('word')
            .eq('user_id', user.id)
            .in('word', wordKeys);

        setStudiedWords(new Set((data || []).map(s => normalizeWord(s.word))));
    };

    const loadWords = async (list, isBuiltIn) => {
        setSelectedList(list.id);
        setSelectedListSource(isBuiltIn ? 'builtin' : 'custom');
        setSelectedListName(list.name);
        setSelectedWordIds([]);
        setSelectionError('');

        const table = isBuiltIn ? 'built_in_words' : 'custom_words';
        let query = supabase
            .from(table)
            .select('*')
            .eq('wordlist_id', list.id)
            .order('id');

        if (!isBuiltIn) {
            query = query.eq('user_id', user.id);
        }

        const { data } = await query;
        const listWords = data || [];
        setWords(listWords);
        await loadStudiedWords(listWords);
    };

    const clearSelectedList = () => {
        setSelectedList(null);
        setSelectedListSource(null);
        setSelectedListName('');
        setWords([]);
        setStudiedWords(new Set());
        setSelectedWordIds([]);
        setSelectionError('');
    };

    const makeStudyUrl = (params) => {
        const query = new URLSearchParams({ mode: 'new', ...params });
        return `/study?${query.toString()}`;
    };

    const startListLearning = (source, listId) => {
        navigate(makeStudyUrl({ source, listId }));
    };

    const startUnitLearning = (unit) => {
        if (!selectedList || !selectedListSource) return;
        navigate(makeStudyUrl({ source: selectedListSource, listId: selectedList, unit }));
    };

    const startSelectedLearning = () => {
        if (selectedWordIds.length === 0) {
            setSelectionError('请先选择要新学的单词');
            return;
        }

        navigate(makeStudyUrl({
            source: selectedListSource,
            ids: selectedWordIds.join(','),
        }));
    };

    const firstSelectableIdByWord = new Map();
    for (const word of words) {
        const key = normalizeWord(word.word);
        if (!key || studiedWords.has(key) || firstSelectableIdByWord.has(key)) continue;
        firstSelectableIdByWord.set(key, word.id);
    }
    const selectableWordIds = new Set(firstSelectableIdByWord.values());

    const isWordStudied = (word) => studiedWords.has(normalizeWord(word.word));
    const isWordSelectable = (word) => selectableWordIds.has(word.id);
    const isWordSelected = (word) => selectedWordIds.includes(word.id);
    const selectableCount = selectableWordIds.size;

    const toggleWordSelection = (word) => {
        if (!isWordSelectable(word)) return;

        setSelectionError('');
        if (isWordSelected(word)) {
            setSelectedWordIds(ids => ids.filter(id => id !== word.id));
            return;
        }

        if (selectedWordIds.length >= dailyNewLimit) {
            setSelectionError(`最多选择 ${dailyNewLimit} 个新词，和“每日新学量”保持一致`);
            return;
        }

        setSelectedWordIds(ids => [...ids, word.id]);
    };

    const getWordStatus = (word) => {
        if (isWordStudied(word)) return '已学';
        if (!isWordSelectable(word)) return '重复词';
        return '';
    };

    // AI word generation
    const handleGenerate = async () => {
        if (!addWordInput.trim()) return;
        setGenerating(true);
        setGenError('');
        setGeneratedWord(null);

        try {
            const result = await generateWordContent(addWordInput.trim());
            setGeneratedWord({
                word: addWordInput.trim(),
                meaning_cn: result.meaning_cn || '',
                phonetic: result.phonetic || '',
                example: result.example || '',
                usage_prompt_cn: result.usage_prompt_cn || '',
            });
        } catch (err) {
            setGenError(err.message);
            // Allow manual entry on failure
            setGeneratedWord({
                word: addWordInput.trim(),
                meaning_cn: '',
                phonetic: '',
                example: '',
                usage_prompt_cn: '',
            });
        }
        setGenerating(false);
    };

    const handleSaveWord = async () => {
        if (!generatedWord) return;
        setSaving(true);

        try {
            // Find or create default custom wordlist "生词本"
            let targetListId;
            let { data: defaultList } = await supabase
                .from('custom_wordlists')
                .select('id')
                .eq('user_id', user.id)
                .eq('name', '生词本')
                .single();

            if (defaultList) {
                targetListId = defaultList.id;
            } else {
                const { data: newList } = await supabase
                    .from('custom_wordlists')
                    .insert({
                        user_id: user.id,
                        name: '生词本',
                        description: '默认生词本',
                    })
                    .select('id')
                    .single();
                targetListId = newList.id;
                loadWordlists();
            }

            const wordText = generatedWord.word.trim();
            const meaningText = generatedWord.meaning_cn.trim();
            const exampleText = generatedWord.example.trim();
            const usagePromptCn = generatedWord.usage_prompt_cn?.trim() || '';

            await supabase.from('custom_words').insert({
                user_id: user.id,
                wordlist_id: targetListId,
                word: wordText,
                meaning_cn: meaningText,
                phonetic: generatedWord.phonetic || '',
                example: exampleText,
            });

            if (usagePromptCn && exampleText) {
                await supabase.from('user_usage_exercises').upsert({
                    user_id: user.id,
                    word: wordText.toLowerCase(),
                    meaning_cn: meaningText,
                    prompt_cn: usagePromptCn,
                    reference_answer_en: exampleText,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id,word,meaning_cn' });
            }

            setShowAddWord(false);
            setAddWordInput('');
            setGeneratedWord(null);
            if (selectedList === targetListId) {
                loadWords({ id: targetListId, name: selectedListName }, false);
            }
        } catch (err) {
            setGenError(err.message);
        }
        setSaving(false);
    };

    // CSV Import
    const handleCsvFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            const lines = text.split('\n').filter(l => l.trim());
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

            const rows = [];
            for (let i = 1; i < lines.length; i++) {
                const values = parseCSVLine(lines[i]);
                const row = {};
                headers.forEach((h, idx) => { row[h] = values[idx]?.trim() || ''; });
                if (row.word) rows.push(row);
            }
            setCsvData(rows);
        };
        reader.readAsText(file);
    };

    const parseCSVLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { inQuotes = !inQuotes; }
            else if (c === ',' && !inQuotes) { result.push(current); current = ''; }
            else { current += c; }
        }
        result.push(current);
        return result;
    };

    const handleCsvImport = async () => {
        if (!csvData || !csvName.trim()) return;
        setSaving(true);

        try {
            const { data: newList } = await supabase
                .from('custom_wordlists')
                .insert({ user_id: user.id, name: csvName.trim() })
                .select('id')
                .single();

            const wordsToInsert = csvData.map(row => ({
                user_id: user.id,
                wordlist_id: newList.id,
                word: row.word || '',
                meaning_cn: row.meaning_cn || '',
                unit: row.unit || '',
                example: row.example || '',
                phonetic: row.phonetic || '',
            }));

            await supabase.from('custom_words').insert(wordsToInsert);

            setShowCsvImport(false);
            setCsvData(null);
            setCsvName('');
            loadWordlists();
        } catch (err) {
            setGenError(err.message);
        }
        setSaving(false);
    };

    // Create custom list
    const handleCreateList = async () => {
        if (!newListName.trim()) return;
        await supabase.from('custom_wordlists').insert({
            user_id: user.id,
            name: newListName.trim(),
        });
        setShowCreateList(false);
        setNewListName('');
        loadWordlists();
    };

    // Group words by unit
    const wordsByUnit = {};
    words.forEach(w => {
        const unit = w.unit || '未分组';
        if (!wordsByUnit[unit]) wordsByUnit[unit] = [];
        wordsByUnit[unit].push(w);
    });

    return (
        <div className="wordlist-page">
            <header className="wordlist-header">
                <h1>词表</h1>
                <div className="wordlist-actions">
                    <button className="btn-icon" onClick={() => setShowAddWord(true)} title="添加生词">
                        ➕
                    </button>
                    <button className="btn-icon" onClick={() => setShowCsvImport(true)} title="导入CSV">
                        📄
                    </button>
                </div>
            </header>

            <div className="wordlist-tabs">
                <button
                    className={`tab-btn ${activeTab === 'builtin' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('builtin'); clearSelectedList(); }}
                >
                    内置词表
                </button>
                <button
                    className={`tab-btn ${activeTab === 'custom' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('custom'); clearSelectedList(); }}
                >
                    自定义词表
                </button>
            </div>

            <div className="wordlist-content">
                {loading ? (
                    <div className="wordlist-loading"><div className="loading-spinner"></div></div>
                ) : selectedList ? (
                    <div className="words-view">
                        <div className="words-toolbar">
                            <button className="btn-back" onClick={clearSelectedList}>
                                ← 返回词表列表
                            </button>
                            <button
                                className="btn-learn-list"
                                onClick={() => startListLearning(selectedListSource, selectedList)}
                            >
                                学本词表
                            </button>
                        </div>

                        <div className="selection-panel">
                            <div>
                                <strong>{selectedListName}</strong>
                                <span>可选 {selectableCount} 词，已选 {selectedWordIds.length} / {dailyNewLimit}</span>
                            </div>
                            <button
                                className="btn-selected-learn"
                                onClick={startSelectedLearning}
                                disabled={selectedWordIds.length === 0}
                            >
                                学习所选
                            </button>
                        </div>
                        {selectionError && <div className="selection-error">{selectionError}</div>}

                        {Object.entries(wordsByUnit).map(([unit, unitWords]) => (
                            <div key={unit} className="unit-section">
                                <div className="unit-title-row">
                                    <h3 className="unit-title">{unit}</h3>
                                    <button className="btn-unit-learn" onClick={() => startUnitLearning(unit)}>
                                        学本单元
                                    </button>
                                </div>
                                <div className="word-list">
                                    {unitWords.map((w, i) => {
                                        const selected = isWordSelected(w);
                                        const selectable = isWordSelectable(w);
                                        const status = getWordStatus(w);

                                        return (
                                            <div
                                                key={w.id || i}
                                                className={`word-item ${selected ? 'selected' : ''} ${!selectable ? 'disabled' : ''}`}
                                                onClick={() => toggleWordSelection(w)}
                                            >
                                                <label className="word-select" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selected}
                                                        disabled={!selectable}
                                                        onChange={() => toggleWordSelection(w)}
                                                    />
                                                </label>
                                                <div className="word-item-main">
                                                    <div className="word-item-en">{w.word}</div>
                                                    <div className="word-item-cn">{w.meaning_cn}</div>
                                                </div>
                                                {status && <div className="word-status">{status}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="list-view">
                        {activeTab === 'builtin' ? (
                            wordlists.map(list => (
                                <div
                                    key={list.id}
                                    className="list-card"
                                    onClick={() => loadWords(list, true)}
                                >
                                    <div className="list-card-icon">📚</div>
                                    <div className="list-card-info">
                                        <div className="list-card-name">{list.name}</div>
                                        {list.description && <div className="list-card-desc">{list.description}</div>}
                                    </div>
                                    <div className="list-card-actions">
                                        <button
                                            className="btn-list-learn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                startListLearning('builtin', list.id);
                                            }}
                                        >
                                            新学
                                        </button>
                                        <div className="list-card-arrow">→</div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <>
                                <button className="btn-create-list" onClick={() => setShowCreateList(true)}>
                                    ➕ 新建词表
                                </button>
                                {customWordlists.length === 0 ? (
                                    <div className="empty-state">
                                        <p>还没有自定义词表</p>
                                        <p className="empty-hint">点击上方按钮或使用 CSV 导入</p>
                                    </div>
                                ) : (
                                    customWordlists.map(list => (
                                        <div
                                            key={list.id}
                                            className="list-card"
                                            onClick={() => loadWords(list, false)}
                                        >
                                            <div className="list-card-icon">📝</div>
                                            <div className="list-card-info">
                                                <div className="list-card-name">{list.name}</div>
                                            </div>
                                            <div className="list-card-actions">
                                                <button
                                                    className="btn-list-learn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        startListLearning('custom', list.id);
                                                    }}
                                                >
                                                    新学
                                                </button>
                                                <div className="list-card-arrow">→</div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Add Word Modal */}
            {showAddWord && (
                <div className="modal-overlay" onClick={() => setShowAddWord(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>添加生词</h2>
                            <button className="btn-close" onClick={() => setShowAddWord(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="gen-input-row">
                                <input
                                    type="text"
                                    value={addWordInput}
                                    onChange={e => setAddWordInput(e.target.value)}
                                    placeholder="输入英文单词..."
                                    className="gen-input"
                                    onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                                />
                                <button
                                    onClick={handleGenerate}
                                    disabled={generating || !addWordInput.trim()}
                                    className="btn-generate"
                                >
                                    {generating ? '⏳' : '✨ 生成'}
                                </button>
                            </div>

                            {genError && <div className="form-error">{genError}</div>}

                            {generatedWord && (
                                <div className="gen-form">
                                    <div className="gen-field">
                                        <label>英文</label>
                                        <input
                                            type="text"
                                            value={generatedWord.word}
                                            onChange={e => setGeneratedWord({ ...generatedWord, word: e.target.value })}
                                        />
                                    </div>
                                    <div className="gen-field">
                                        <label>中文释义</label>
                                        <input
                                            type="text"
                                            value={generatedWord.meaning_cn}
                                            onChange={e => setGeneratedWord({ ...generatedWord, meaning_cn: e.target.value })}
                                        />
                                    </div>
                                    <div className="gen-field">
                                        <label>音标</label>
                                        <input
                                            type="text"
                                            value={generatedWord.phonetic}
                                            onChange={e => setGeneratedWord({ ...generatedWord, phonetic: e.target.value })}
                                        />
                                    </div>
                                    <div className="gen-field">
                                        <label>例句</label>
                                        <input
                                            type="text"
                                            value={generatedWord.example}
                                            onChange={e => setGeneratedWord({ ...generatedWord, example: e.target.value })}
                                        />
                                    </div>
                                    <div className="gen-field">
                                        <label>场景中文句</label>
                                        <input
                                            type="text"
                                            value={generatedWord.usage_prompt_cn || ''}
                                            onChange={e => setGeneratedWord({ ...generatedWord, usage_prompt_cn: e.target.value })}
                                        />
                                    </div>
                                    <button
                                        className="btn-primary"
                                        onClick={handleSaveWord}
                                        disabled={saving}
                                    >
                                        {saving ? '保存中...' : '保存到生词本'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* CSV Import Modal */}
            {showCsvImport && (
                <div className="modal-overlay" onClick={() => setShowCsvImport(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>CSV 导入</h2>
                            <button className="btn-close" onClick={() => setShowCsvImport(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <p className="csv-hint">CSV 文件需包含 word 列，可选：meaning_cn, unit, example</p>
                            <div className="gen-field">
                                <label>词表名称</label>
                                <input
                                    type="text"
                                    value={csvName}
                                    onChange={e => setCsvName(e.target.value)}
                                    placeholder="如：期中复习"
                                />
                            </div>
                            <input type="file" accept=".csv" onChange={handleCsvFile} className="csv-file-input" />
                            {csvData && (
                                <>
                                    <p className="csv-preview-count">已解析 {csvData.length} 个单词</p>
                                    <div className="csv-preview">
                                        {csvData.slice(0, 5).map((row, i) => (
                                            <div key={i} className="csv-preview-row">
                                                <span>{row.word}</span>
                                                <span>{row.meaning_cn}</span>
                                            </div>
                                        ))}
                                        {csvData.length > 5 && <p className="csv-more">...还有 {csvData.length - 5} 个</p>}
                                    </div>
                                    <button
                                        className="btn-primary"
                                        onClick={handleCsvImport}
                                        disabled={saving || !csvName.trim()}
                                    >
                                        {saving ? '导入中...' : `导入 ${csvData.length} 个单词`}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Create List Modal */}
            {showCreateList && (
                <div className="modal-overlay" onClick={() => setShowCreateList(false)}>
                    <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>新建词表</h2>
                            <button className="btn-close" onClick={() => setShowCreateList(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="gen-field">
                                <label>词表名称</label>
                                <input
                                    type="text"
                                    value={newListName}
                                    onChange={e => setNewListName(e.target.value)}
                                    placeholder="如：课外阅读"
                                    onKeyDown={e => e.key === 'Enter' && handleCreateList()}
                                />
                            </div>
                            <button className="btn-primary" onClick={handleCreateList}>创建</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
