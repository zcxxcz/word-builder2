import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { THEMES, useThemeStore } from '../stores/themeStore';
import { supabase } from '../lib/supabase';
import { generateWordContent } from '../lib/deepseek';
import { FLORR_AREAS, getFlorrRarity, isFlorrWordlist } from '../utils/florrTheme';
import { isValidUsageExercise } from '../utils/usageExercise';
import './WordlistPage.css';

const normalizeWord = (word) => (word || '').trim().toLowerCase();

export default function WordlistPage() {
    const { user } = useAuthStore();
    const { settings, loadSettings, loaded } = useSettingsStore();
    const { theme } = useThemeStore();
    const navigate = useNavigate();
    const isFlorrTheme = theme === THEMES.FLORR;

    const [activeTab, setActiveTab] = useState('builtin');
    const [wordlists, setWordlists] = useState([]);
    const [customWordlists, setCustomWordlists] = useState([]);
    const [selectedList, setSelectedList] = useState(null);
    const [selectedListSource, setSelectedListSource] = useState(null);
    const [selectedListName, setSelectedListName] = useState('');
    const [words, setWords] = useState([]);
    const [studiedWords, setStudiedWords] = useState(new Set());
    const [wordLevels, setWordLevels] = useState(new Map());
    const [selectedWordIds, setSelectedWordIds] = useState([]);
    const [selectionError, setSelectionError] = useState('');
    const [loading, setLoading] = useState(true);

    // Add word modal
    const [showAddWord, setShowAddWord] = useState(false);
    const [addWordInput, setAddWordInput] = useState('');
    const [generatedWord, setGeneratedWord] = useState(null);
    const [spellingSuggestion, setSpellingSuggestion] = useState(null);
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

    // Edit custom word modal
    const [editingWord, setEditingWord] = useState(null);
    const [editForm, setEditForm] = useState(null);
    const [editError, setEditError] = useState('');

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
            setWordLevels(new Map());
            return;
        }

        const { data } = await supabase
            .from('user_word_state')
            .select('word, level')
            .eq('user_id', user.id)
            .in('word', wordKeys);

        setStudiedWords(new Set((data || []).map(s => normalizeWord(s.word))));
        setWordLevels(new Map((data || []).map(s => [normalizeWord(s.word), s.level || 0])));
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
        setWordLevels(new Map());
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
        if (isFlorrTheme) {
            if (isWordStudied(word)) {
                return getFlorrRarity(wordLevels.get(normalizeWord(word.word))).label;
            }
            if (!isWordSelectable(word)) return '重复花瓣';
            return '未收集';
        }

        if (isWordStudied(word)) return '已学';
        if (!isWordSelectable(word)) return '重复词';
        return '';
    };

    const throwOnError = ({ error }) => {
        if (error) throw error;
    };

    const makeGeneratedWord = (wordText, result = {}) => ({
        word: wordText,
        meaning_cn: result.meaning_cn || '',
        phonetic: result.phonetic || '',
        example: result.example || '',
        usage_prompt_cn: result.usage_prompt_cn || '',
    });

    const resetAddWordModal = () => {
        setShowAddWord(false);
        setAddWordInput('');
        setGeneratedWord(null);
        setSpellingSuggestion(null);
        setGenError('');
    };

    const cacheUsageExercise = async (wordText, meaningText, exampleText, usagePromptCn) => {
        const exercise = {
            prompt_cn: usagePromptCn,
            reference_answer_en: exampleText,
        };

        if (!isValidUsageExercise(exercise, { word: wordText, meaningCn: meaningText })) return;

        throwOnError(await supabase.from('user_usage_exercises').upsert({
            user_id: user.id,
            word: normalizeWord(wordText),
            meaning_cn: meaningText,
            ...exercise,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,word,meaning_cn' }));
    };

    const migrateUserWordState = async (oldWordKey, newWordKey) => {
        const { data: existingNewState, error: existingNewError } = await supabase
            .from('user_word_state')
            .select('id')
            .eq('user_id', user.id)
            .eq('word', newWordKey)
            .maybeSingle();
        if (existingNewError) throw existingNewError;

        if (existingNewState) {
            throwOnError(await supabase
                .from('user_word_state')
                .delete()
                .eq('user_id', user.id)
                .eq('word', oldWordKey));
            return;
        }

        throwOnError(await supabase
            .from('user_word_state')
            .update({ word: newWordKey, updated_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('word', oldWordKey));
    };

    const migrateUsageExercises = async (oldWordKey, newWordKey) => {
        const { data: oldExercises, error: oldError } = await supabase
            .from('user_usage_exercises')
            .select('*')
            .eq('user_id', user.id)
            .eq('word', oldWordKey);
        if (oldError) throw oldError;
        if (!oldExercises?.length) return;

        const { data: newExercises, error: newError } = await supabase
            .from('user_usage_exercises')
            .select('*')
            .eq('user_id', user.id)
            .eq('word', newWordKey);
        if (newError) throw newError;

        const newByMeaning = new Map((newExercises || []).map(exercise => [exercise.meaning_cn, exercise]));

        for (const exercise of oldExercises) {
            const existing = newByMeaning.get(exercise.meaning_cn);
            if (!existing) {
                throwOnError(await supabase
                    .from('user_usage_exercises')
                    .update({ word: newWordKey })
                    .eq('id', exercise.id)
                    .eq('user_id', user.id));
                continue;
            }

            if (new Date(exercise.updated_at || 0) > new Date(existing.updated_at || 0)) {
                throwOnError(await supabase
                    .from('user_usage_exercises')
                    .update({
                        prompt_cn: exercise.prompt_cn,
                        reference_answer_en: exercise.reference_answer_en,
                        updated_at: exercise.updated_at,
                    })
                    .eq('id', existing.id)
                    .eq('user_id', user.id));
            }

            throwOnError(await supabase
                .from('user_usage_exercises')
                .delete()
                .eq('id', exercise.id)
                .eq('user_id', user.id));
        }
    };

    const migrateWordReferences = async (oldWordKey, newWordKey) => {
        if (!oldWordKey || !newWordKey || oldWordKey === newWordKey) return;

        await migrateUserWordState(oldWordKey, newWordKey);
        await migrateUsageExercises(oldWordKey, newWordKey);
    };

    // AI word generation
    const handleGenerate = async () => {
        if (!addWordInput.trim()) return;
        setGenerating(true);
        setGenError('');
        setGeneratedWord(null);
        setSpellingSuggestion(null);

        try {
            const inputWord = addWordInput.trim();
            const result = await generateWordContent(inputWord);
            const canonicalWord = (result.canonical_word || inputWord).trim();

            if (result.spelling_suspected && canonicalWord && normalizeWord(canonicalWord) !== normalizeWord(inputWord)) {
                setSpellingSuggestion({
                    originalWord: inputWord,
                    suggestedWord: canonicalWord,
                    result,
                });
            } else {
                setGeneratedWord(makeGeneratedWord(inputWord, result));
            }
        } catch (err) {
            setGenError(err.message);
            // Allow manual entry on failure
            setGeneratedWord(makeGeneratedWord(addWordInput.trim()));
        }
        setGenerating(false);
    };

    const confirmSpellingSuggestion = (useSuggestedWord) => {
        if (!spellingSuggestion) return;
        const wordText = useSuggestedWord ? spellingSuggestion.suggestedWord : spellingSuggestion.originalWord;
        setGeneratedWord(makeGeneratedWord(wordText, spellingSuggestion.result));
        setSpellingSuggestion(null);
    };

    const handleSaveWord = async () => {
        if (!generatedWord) return;
        setSaving(true);

        try {
            // Find or create default custom wordlist "生词本"
            let targetListId;
            let { data: defaultList, error: defaultListError } = await supabase
                .from('custom_wordlists')
                .select('id')
                .eq('user_id', user.id)
                .eq('name', '生词本')
                .maybeSingle();
            if (defaultListError) throw defaultListError;

            if (defaultList) {
                targetListId = defaultList.id;
            } else {
                const { data: newList, error: newListError } = await supabase
                    .from('custom_wordlists')
                    .insert({
                        user_id: user.id,
                        name: '生词本',
                        description: '默认生词本',
                    })
                    .select('id')
                    .single();
                if (newListError) throw newListError;
                targetListId = newList.id;
                loadWordlists();
            }

            const wordText = generatedWord.word.trim();
            const meaningText = generatedWord.meaning_cn.trim();
            const exampleText = generatedWord.example.trim();
            const usagePromptCn = generatedWord.usage_prompt_cn?.trim() || '';

            throwOnError(await supabase.from('custom_words').insert({
                user_id: user.id,
                wordlist_id: targetListId,
                word: wordText,
                meaning_cn: meaningText,
                phonetic: generatedWord.phonetic || '',
                example: exampleText,
            }));

            await cacheUsageExercise(wordText, meaningText, exampleText, usagePromptCn);

            resetAddWordModal();
            if (selectedList === targetListId) {
                loadWords({ id: targetListId, name: selectedListName }, false);
            }
        } catch (err) {
            setGenError(err.message);
        }
        setSaving(false);
    };

    const openEditWord = async (word, event) => {
        event.stopPropagation();
        const form = {
            word: word.word || '',
            meaning_cn: word.meaning_cn || '',
            phonetic: word.phonetic || '',
            example: word.example || '',
            usage_prompt_cn: '',
        };

        setEditingWord(word);
        setEditForm(form);
        setEditError('');

        const wordKey = normalizeWord(word.word);
        if (!wordKey) return;

        const { data, error } = await supabase
            .from('user_usage_exercises')
            .select('prompt_cn')
            .eq('user_id', user.id)
            .eq('word', wordKey)
            .eq('meaning_cn', word.meaning_cn?.trim() || '')
            .maybeSingle();

        if (error) {
            setEditError(error.message);
            return;
        }

        if (data?.prompt_cn) {
            setEditForm(current => current ? { ...current, usage_prompt_cn: data.prompt_cn } : current);
        }
    };

    const closeEditWord = () => {
        setEditingWord(null);
        setEditForm(null);
        setEditError('');
    };

    const clearUsageExerciseCache = async (wordText, meaningText) => {
        throwOnError(await supabase
            .from('user_usage_exercises')
            .delete()
            .eq('user_id', user.id)
            .eq('word', normalizeWord(wordText))
            .eq('meaning_cn', meaningText));
    };

    const handleSaveEditWord = async () => {
        if (!editingWord || !editForm?.word.trim()) return;
        setSaving(true);
        setEditError('');

        try {
            const oldWordKey = normalizeWord(editingWord.word);
            const oldMeaningText = editingWord.meaning_cn?.trim() || '';
            const wordText = editForm.word.trim();
            const newWordKey = normalizeWord(wordText);
            const meaningText = editForm.meaning_cn.trim();
            const exampleText = editForm.example.trim();
            const usagePromptCn = editForm.usage_prompt_cn?.trim() || '';

            throwOnError(await supabase
                .from('custom_words')
                .update({
                    word: wordText,
                    meaning_cn: meaningText,
                    phonetic: editForm.phonetic || '',
                    example: exampleText,
                })
                .eq('id', editingWord.id)
                .eq('user_id', user.id));

            await migrateWordReferences(oldWordKey, newWordKey);
            if (oldMeaningText && oldMeaningText !== meaningText) {
                await clearUsageExerciseCache(wordText, oldMeaningText);
            }

            if (isValidUsageExercise({
                prompt_cn: usagePromptCn,
                reference_answer_en: exampleText,
            }, {
                word: wordText,
                meaningCn: meaningText,
            })) {
                await cacheUsageExercise(wordText, meaningText, exampleText, usagePromptCn);
            } else {
                await clearUsageExerciseCache(wordText, meaningText);
            }

            closeEditWord();
            await loadWords({ id: selectedList, name: selectedListName }, false);
        } catch (err) {
            setEditError(err.message);
        }

        setSaving(false);
    };

    const handleDeleteWord = async (word, event) => {
        event.stopPropagation();
        if (!window.confirm(`确定删除“${word.word}”吗？学习进度不会被删除。`)) return;

        setSelectionError('');
        try {
            throwOnError(await supabase
                .from('custom_words')
                .delete()
                .eq('id', word.id)
                .eq('user_id', user.id));
            setSelectedWordIds(ids => ids.filter(id => id !== word.id));
            await loadWords({ id: selectedList, name: selectedListName }, false);
        } catch (err) {
            setSelectionError(err.message);
        }
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
    const isSelectedFlorrWordlist = isFlorrWordlist(selectedListName);

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
                                {isFlorrTheme ? '探索词表' : '学本词表'}
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

                        {Object.entries(wordsByUnit).map(([unit, unitWords]) => {
                            const area = FLORR_AREAS[unit];

                            return (
                            <div
                                key={unit}
                                className={`unit-section ${isFlorrTheme && isSelectedFlorrWordlist ? 'florr-area-section' : ''}`}
                            >
                                <div className="unit-title-row">
                                    <div>
                                        <h3 className="unit-title">{area?.label || unit}</h3>
                                        {isFlorrTheme && isSelectedFlorrWordlist && area?.description && (
                                            <div className="unit-subtitle">{area.description}</div>
                                        )}
                                    </div>
                                    <button className="btn-unit-learn" onClick={() => startUnitLearning(unit)}>
                                        {isFlorrTheme ? '探索本区域' : '学本单元'}
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
                                                {status && (
                                                    <div
                                                        className={`word-status ${isFlorrTheme ? `rarity-badge ${isWordStudied(w) ? getFlorrRarity(wordLevels.get(normalizeWord(w.word))).className : 'rarity-common'}` : ''}`}
                                                    >
                                                        {status}
                                                    </div>
                                                )}
                                                {selectedListSource === 'custom' && (
                                                    <div className="word-actions" onClick={e => e.stopPropagation()}>
                                                        <button className="word-action-btn" onClick={(e) => openEditWord(w, e)} title="编辑">
                                                            编辑
                                                        </button>
                                                        <button className="word-action-btn danger" onClick={(e) => handleDeleteWord(w, e)} title="删除">
                                                            删除
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            );
                        })}
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
                                    <div className="list-card-icon">
                                        {isFlorrTheme && isFlorrWordlist(list.name) ? (
                                            <img
                                                className="list-card-logo"
                                                src={`${import.meta.env.BASE_URL}florr-logo.png`}
                                                alt=""
                                            />
                                        ) : '📚'}
                                    </div>
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
                                            {isFlorrTheme && isFlorrWordlist(list.name) ? '探索' : '新学'}
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
                <div className="modal-overlay" onClick={resetAddWordModal}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>添加生词</h2>
                            <button className="btn-close" onClick={resetAddWordModal}>✕</button>
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

                            {spellingSuggestion && (
                                <div className="spelling-check">
                                    <div className="spelling-check-title">可能是拼写错误</div>
                                    <p>
                                        你输入的是 <strong>{spellingSuggestion.originalWord}</strong>，
                                        AI 建议检查为 <strong>{spellingSuggestion.suggestedWord}</strong>。
                                    </p>
                                    <div className="spelling-check-actions">
                                        <button
                                            className="btn-primary"
                                            onClick={() => confirmSpellingSuggestion(true)}
                                        >
                                            改用 {spellingSuggestion.suggestedWord}
                                        </button>
                                        <button
                                            className="btn-secondary"
                                            onClick={() => confirmSpellingSuggestion(false)}
                                        >
                                            仍保存 {spellingSuggestion.originalWord}
                                        </button>
                                    </div>
                                </div>
                            )}

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
                                        disabled={saving || !generatedWord.word.trim()}
                                    >
                                        {saving ? '保存中...' : '保存到生词本'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Word Modal */}
            {editingWord && editForm && (
                <div className="modal-overlay" onClick={closeEditWord}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>编辑生词</h2>
                            <button className="btn-close" onClick={closeEditWord}>✕</button>
                        </div>
                        <div className="modal-body">
                            {editError && <div className="form-error">{editError}</div>}
                            <div className="gen-form">
                                <div className="gen-field">
                                    <label>英文</label>
                                    <input
                                        type="text"
                                        value={editForm.word}
                                        onChange={e => setEditForm({ ...editForm, word: e.target.value })}
                                    />
                                </div>
                                <div className="gen-field">
                                    <label>中文释义</label>
                                    <input
                                        type="text"
                                        value={editForm.meaning_cn}
                                        onChange={e => setEditForm({ ...editForm, meaning_cn: e.target.value })}
                                    />
                                </div>
                                <div className="gen-field">
                                    <label>音标</label>
                                    <input
                                        type="text"
                                        value={editForm.phonetic}
                                        onChange={e => setEditForm({ ...editForm, phonetic: e.target.value })}
                                    />
                                </div>
                                <div className="gen-field">
                                    <label>例句</label>
                                    <input
                                        type="text"
                                        value={editForm.example}
                                        onChange={e => setEditForm({ ...editForm, example: e.target.value })}
                                    />
                                </div>
                                <div className="gen-field">
                                    <label>场景中文句</label>
                                    <input
                                        type="text"
                                        value={editForm.usage_prompt_cn}
                                        onChange={e => setEditForm({ ...editForm, usage_prompt_cn: e.target.value })}
                                    />
                                </div>
                                <div className="modal-actions">
                                    <button
                                        className="btn-primary"
                                        onClick={handleSaveEditWord}
                                        disabled={saving || !editForm.word.trim()}
                                    >
                                        {saving ? '保存中...' : '保存修改'}
                                    </button>
                                    <button className="btn-secondary" onClick={closeEditWord} disabled={saving}>
                                        取消
                                    </button>
                                </div>
                            </div>
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
