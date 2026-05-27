export const FLORR_WORDLIST_NAME = 'Florr 花瓣词表';

export const FLORR_AREAS = {
    Garden: { label: 'Garden', description: '基础自然花瓣' },
    Desert: { label: 'Desert', description: '沙漠与防御花瓣' },
    Ocean: { label: 'Ocean', description: '海洋与恢复花瓣' },
    Jungle: { label: 'Jungle', description: '植物与食物花瓣' },
    Factory: { label: 'Factory', description: '机械与能量花瓣' },
    Mystic: { label: 'Mystic', description: '神秘高阶花瓣' },
};

export const FLORR_RARITIES = {
    0: { label: 'Common', className: 'rarity-common' },
    1: { label: 'Rare', className: 'rarity-rare' },
    2: { label: 'Epic', className: 'rarity-epic' },
    3: { label: 'Legendary', className: 'rarity-legendary' },
};

export function isFlorrWordlist(name = '') {
    return name.trim() === FLORR_WORDLIST_NAME;
}

export function getFlorrRarity(level = 0) {
    return FLORR_RARITIES[Math.max(0, Math.min(Number(level) || 0, 3))];
}
