-- ============================================
-- Import optional Florr-inspired petals wordlist
-- Run AFTER migration.sql
-- ============================================

INSERT INTO built_in_wordlists (id, name, description) VALUES
  ('33333333-3333-3333-3333-333333333333', 'Florr 花瓣词表', 'Florr 主题扩展词表：按 Garden / Desert / Ocean / Jungle / Factory / Mystic 区域学习')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

DELETE FROM built_in_words
WHERE wordlist_id = '33333333-3333-3333-3333-333333333333';

INSERT INTO built_in_words (wordlist_id, word, meaning_cn, unit, example) VALUES
('33333333-3333-3333-3333-333333333333', 'rose', '玫瑰', 'Garden', 'A rose is growing in the garden.'),
('33333333-3333-3333-3333-333333333333', 'leaf', '叶子', 'Garden', 'A green leaf fell from the tree.'),
('33333333-3333-3333-3333-333333333333', 'clover', '三叶草', 'Garden', 'The clover has small green leaves.'),
('33333333-3333-3333-3333-333333333333', 'dandelion', '蒲公英', 'Garden', 'A dandelion grows near the path.'),
('33333333-3333-3333-3333-333333333333', 'root', '根', 'Garden', 'The root holds the plant in the ground.'),
('33333333-3333-3333-3333-333333333333', 'honey', '蜂蜜', 'Garden', 'Honey tastes sweet.'),
('33333333-3333-3333-3333-333333333333', 'pollen', '花粉', 'Garden', 'Bees carry pollen from flower to flower.'),
('33333333-3333-3333-3333-333333333333', 'wing', '翅膀', 'Garden', 'The bird has a broken wing.'),
('33333333-3333-3333-3333-333333333333', 'light', '光；轻的', 'Garden', 'The morning light is soft.'),
('33333333-3333-3333-3333-333333333333', 'faster', '更快的', 'Garden', 'Run faster to catch the bus.'),
('33333333-3333-3333-3333-333333333333', 'cactus', '仙人掌', 'Desert', 'A cactus can live in a dry place.'),
('33333333-3333-3333-3333-333333333333', 'sand', '沙子', 'Desert', 'The sand is hot in the desert.'),
('33333333-3333-3333-3333-333333333333', 'bone', '骨头', 'Desert', 'The dog found a bone.'),
('33333333-3333-3333-3333-333333333333', 'shell', '壳；贝壳', 'Desert', 'The shell is hard and white.'),
('33333333-3333-3333-3333-333333333333', 'salt', '盐', 'Desert', 'Please add a little salt.'),
('33333333-3333-3333-3333-333333333333', 'shovel', '铲子', 'Desert', 'He used a shovel to dig a hole.'),
('33333333-3333-3333-3333-333333333333', 'rock', '岩石；石头', 'Desert', 'There is a big rock near the road.'),
('33333333-3333-3333-3333-333333333333', 'thorn', '刺', 'Desert', 'A thorn hurt my finger.'),
('33333333-3333-3333-3333-333333333333', 'dry', '干的', 'Desert', 'The desert is very dry.'),
('33333333-3333-3333-3333-333333333333', 'shield', '盾牌', 'Desert', 'A shield can protect a player.'),
('33333333-3333-3333-3333-333333333333', 'coral', '珊瑚', 'Ocean', 'Coral lives under the sea.'),
('33333333-3333-3333-3333-333333333333', 'pearl', '珍珠', 'Ocean', 'She found a pearl in the shell.'),
('33333333-3333-3333-3333-333333333333', 'sponge', '海绵', 'Ocean', 'A sponge can hold water.'),
('33333333-3333-3333-3333-333333333333', 'bubble', '气泡', 'Ocean', 'A bubble floated in the water.'),
('33333333-3333-3333-3333-333333333333', 'starfish', '海星', 'Ocean', 'A starfish has five arms.'),
('33333333-3333-3333-3333-333333333333', 'wave', '波浪', 'Ocean', 'A big wave came to the beach.'),
('33333333-3333-3333-3333-333333333333', 'water', '水', 'Ocean', 'Drink more water after exercise.'),
('33333333-3333-3333-3333-333333333333', 'heal', '治愈；恢复', 'Ocean', 'Time can heal a sad heart.'),
('33333333-3333-3333-3333-333333333333', 'float', '漂浮', 'Ocean', 'The leaf can float on the water.'),
('33333333-3333-3333-3333-333333333333', 'deep', '深的', 'Ocean', 'The lake is deep.'),
('33333333-3333-3333-3333-333333333333', 'basil', '罗勒', 'Jungle', 'Basil is a green plant.'),
('33333333-3333-3333-3333-333333333333', 'lotus', '莲花', 'Jungle', 'A lotus grows in the pond.'),
('33333333-3333-3333-3333-333333333333', 'orange', '橙子；橙色的', 'Jungle', 'I ate an orange after lunch.'),
('33333333-3333-3333-3333-333333333333', 'grapes', '葡萄', 'Jungle', 'The grapes are sweet.'),
('33333333-3333-3333-3333-333333333333', 'tomato', '西红柿；番茄', 'Jungle', 'Tomato is a common vegetable.'),
('33333333-3333-3333-3333-333333333333', 'vine', '藤；藤蔓', 'Jungle', 'A vine climbed up the wall.'),
('33333333-3333-3333-3333-333333333333', 'fruit', '水果', 'Jungle', 'Fruit is good for your health.'),
('33333333-3333-3333-3333-333333333333', 'jungle', '丛林', 'Jungle', 'Many animals live in the jungle.'),
('33333333-3333-3333-3333-333333333333', 'seed', '种子', 'Jungle', 'Plant the seed in the soil.'),
('33333333-3333-3333-3333-333333333333', 'grow', '生长', 'Jungle', 'Plants grow well in spring.'),
('33333333-3333-3333-3333-333333333333', 'cog', '齿轮', 'Factory', 'A small cog turned inside the machine.'),
('33333333-3333-3333-3333-333333333333', 'battery', '电池', 'Factory', 'This toy needs a battery.'),
('33333333-3333-3333-3333-333333333333', 'chip', '芯片；薄片', 'Factory', 'The robot has a tiny chip.'),
('33333333-3333-3333-3333-333333333333', 'laser', '激光', 'Factory', 'The robot has a red laser.'),
('33333333-3333-3333-3333-333333333333', 'magnet', '磁铁', 'Factory', 'A magnet can pull iron.'),
('33333333-3333-3333-3333-333333333333', 'gear', '齿轮；装备', 'Factory', 'This gear helps the wheel move.'),
('33333333-3333-3333-3333-333333333333', 'engine', '发动机', 'Factory', 'The engine makes the car run.'),
('33333333-3333-3333-3333-333333333333', 'metal', '金属', 'Factory', 'This box is made of metal.'),
('33333333-3333-3333-3333-333333333333', 'power', '能量；力量', 'Factory', 'The machine needs more power.'),
('33333333-3333-3333-3333-333333333333', 'reload', '重新装填', 'Factory', 'The player needs time to reload.'),
('33333333-3333-3333-3333-333333333333', 'moon', '月亮', 'Mystic', 'The moon is bright tonight.'),
('33333333-3333-3333-3333-333333333333', 'lightning', '闪电', 'Mystic', 'Lightning flashed in the dark sky.'),
('33333333-3333-3333-3333-333333333333', 'fang', '尖牙', 'Mystic', 'The animal has a sharp fang.'),
('33333333-3333-3333-3333-333333333333', 'relic', '遗物；圣物', 'Mystic', 'The old relic is kept in a museum.'),
('33333333-3333-3333-3333-333333333333', 'talisman', '护身符', 'Mystic', 'He wore a talisman around his neck.'),
('33333333-3333-3333-3333-333333333333', 'ankh', '安卡符', 'Mystic', 'An ankh is an ancient symbol.'),
('33333333-3333-3333-3333-333333333333', 'magic', '魔法；神奇的', 'Mystic', 'The story is full of magic.'),
('33333333-3333-3333-3333-333333333333', 'poison', '毒药；毒物', 'Mystic', 'Some plants contain poison.'),
('33333333-3333-3333-3333-333333333333', 'rare', '稀有的', 'Mystic', 'This flower is very rare.'),
('33333333-3333-3333-3333-333333333333', 'legendary', '传说中的', 'Mystic', 'The hero became legendary.');
