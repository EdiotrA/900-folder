import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';
import { db } from '../server/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dbPath = path.join(root, 'data', 'playvault.db');

const categories = [
  { name: 'Action', slug: 'action' },
  { name: 'Adventure', slug: 'adventure' },
  { name: 'Arcade', slug: 'arcade' },
  { name: 'Puzzle', slug: 'puzzle' },
  { name: 'Racing', slug: 'racing' },
  { name: 'Sports', slug: 'sports' },
  { name: 'Strategy', slug: 'strategy' },
  { name: 'Multiplayer', slug: 'multiplayer' },
  { name: 'Casual', slug: 'casual' },
  { name: 'Platformer', slug: 'platformer' },
];

/** Legitimate CrazyGames embed slugs (official /embed/ endpoints). */
const embedSlugs = [
  'basketball-stars', 'moto-x3m', 'subway-surfers', 'stickman-hook', 'smash-karts', 'shell-shockers',
  '1v1-lol', 'buildnow-gg', 'bloxd-io', 'evowars-io', 'vortex-9', 'combat-reloaded', 'deadshot-io',
  'krunker-io', 'mini-golf-club', '8-ball-pool', 'penalty-shooters-2', 'football-legends-2021',
  'basket-random', 'soccer-random', 'volleyball-challenge', 'tennis-masters', 'table-tennis-world-tour',
  'dunkers-2', 'basket-swooshes', 'tap-tap-shots', 'basketball-legends-2020', 'head-soccer-2022',
  'car-eats-car-2', 'madalin-stunt-cars-2', 'city-car-driving-stunt-master', 'drift-hunters',
  'burnout-drift-3', 'highway-racer-2', 'traffic-mania', 'parking-fury-3', 'car-simulator-arena',
  'offroader-v5', '4x4-offroader', 'rally-point-5', 'top-speed-3d', 'super-car-zombie-drift-2',
  'fireboy-and-watergirl-1-forest-temple', 'fireboy-and-watergirl-2-light-temple', 'fireboy-and-watergirl-3-ice-temple',
  'fireboy-and-watergirl-4-crystal-temple', 'fireboy-and-watergirl-5-elements', 'red-ball-4',
  'vex-3', 'vex-4', 'vex-5', 'vex-6', 'run-3', 'slope', 'tunnel-rush', 'stack-ball', 'stack',
  'helix-jump', 'bottle-flip-3d', 'temple-run-2', 'crossy-road', 'geometry-dash', 'geometry-dash-lite',
  'happy-wheels', 'short-ride', 'draw-climber', 'draw-the-hill', 'line-rider', 'getting-over-it',
  'little-alchemy', 'little-alchemy-2', '2048', 'merge-round-racers', 'merge-harvest', 'goodgame-empire',
  'goodgame-big-farm', 'goodgame-poker', 'uno-online', 'monopoly-online', 'chess-online', 'checkers-online',
  'backgammon-online', 'dominoes-online', 'ludo-king', 'yahtzee-online', 'solitaire-classic',
  'mahjong-classic', 'mahjong-connect', 'bubble-shooter', 'bubble-shooter-extreme', 'zuma', 'garden-tales',
  'candy-rain', 'cookie-crush', 'homescapes', 'gardenscapes', 'fishdom', 'township', 'hay-day',
  'cut-the-rope', 'cut-the-rope-2', 'cut-the-rope-time-travel', 'bad-ice-cream', 'bad-ice-cream-2',
  'bad-ice-cream-3', 'bomber-friends', 'super-smash-flash-2', 'superfighters', 'wrassling',
  'wrestle-bros', 'drunken-wrestlers-2', 'getaway-shootout', 'rooftop-snipers', 'rooftop-snipers-2',
  'house-of-hazards', 'gun-mayhem-2', 'gun-mayhem-3', 'strike-force-heroes-2', 'strike-force-heroes-3',
  'plazma-burst-2', 'raze-2', 'raze-3', 'strike-of-war', 'warfare-1944', 'age-of-war', 'age-of-war-2',
  'stick-war', 'stick-war-2', 'kingdom-rush', 'kingdom-rush-frontiers', 'kingdom-rush-origins',
  'bloons-tower-defense-5', 'bloons-td-6', 'plants-vs-zombies', 'earn-to-die', 'earn-to-die-2',
  'earn-to-die-2012', 'dead-zed', 'zombie-shooter', 'surviv-io', 'zombs-io', 'starve-io', 'moomoo-io',
  'diep-io', 'slither-io', 'wormate-io', 'paper-io-2', 'hole-io', 'agar-io', 'deeeep-io', 'defly-io',
  'hexar-io', 'narwhale-io', 'bonk-io', 'taming-io', 'lordz-io', 'surviv-io', 'splix-io', 'skribbl-io',
  'gartic-io', 'little-big-snake', 'wormax-io', 'wormax2-io', 'snake-io', 'snake-is-mlg-edition',
  'piano-tiles-2', 'magic-tiles-3', 'tiles-hop', 'osu-mania', 'friday-night-funkin', 'fnf-vs-tricky',
  'fnf-vs-garcello', 'fnf-vs-hex', 'fnf-vs-sarvente', 'fnf-vs-whitty', 'fnf-vs-pico', 'fnf-indie-cross',
  'minecraft-classic', 'minecraft-tower-defense', 'paper-minecraft', 'mineclone-2', 'mineclone-3',
  'blocky-trials', 'blocky-cars', 'blockpost', 'pixel-gun-3d', 'pixel-warfare', 'combat-strike-2',
  'combat-strike-multiplayer', 'masked-forces', 'masked-forces-unlimited', 'bullet-force',
  'forward-assault', 'critical-strike', 'cs-online', 'counter-strike-nostalgia', 'shell-shockers-io',
  'egg-catcher', 'duck-life', 'duck-life-2', 'duck-life-3', 'duck-life-4', 'duck-life-5', 'duck-life-6',
  'learn-to-fly', 'learn-to-fly-2', 'learn-to-fly-3', 'penguin-diner', 'penguin-diner-2', 'papa-s-pizzeria',
  'papa-s-burgeria', 'papa-s-freezeria', 'papa-s-pancakeria', 'papa-s-wingeria', 'papa-s-sushiria',
  'papa-s-scooperia', 'papa-s-cheeseria', 'papa-s-donuteria', 'papa-s-bakeria', 'papa-s-pastaria',
  'idle-breakout', 'idle-miner', 'idle-dice', 'cookie-clicker', 'clicker-heroes', 'adventure-capitalist',
  'trim-io', 'hole-io-2', 'basketball-frvr', 'football-frvr', 'golf-frvr', 'hex-frvr', 'triangles-frvr',
  'jewel-shuffle', 'jewel-academy', 'bejeweled', 'diamond-dungeon', 'gem-craft', 'gemcraft-chapters',
  'tower-defense-clash', 'cursed-treasure', 'cursed-treasure-2', 'cursed-treasure-level-pack',
  'kingdom-guard', 'tower-crush', 'stick-defenders', 'stickman-archero', 'archery-world-tour',
  'archery-master', 'apple-shooter', 'bowman-2', 'stickman-fighter', 'stickman-fighter-epic-battle',
  'stickman-fighter-epic-battle-2', 'stickman-clash', 'stickman-ragdoll', 'ragdoll-throw-challenge',
  'happy-glass', 'love-balls', 'draw-physics-line', 'brain-test', 'brain-test-2', 'brain-test-3',
  'who-is', 'text-or-die', 'word-wipe', 'word-search', 'crossword-connect', 'wordle-unlimited',
  'wordle', 'hangman', 'typing-clash', 'type-fighters', 'nitro-type', 'keyboard-ninja',
];

function titleFromSlug(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/Io/g, '.io')
    .replace(/Fnf/g, 'FNF')
    .replace(/Cs/g, 'CS')
    .replace(/Td/g, 'TD')
    .replace(/Mlg/g, 'MLG')
    .replace(/Frvr/g, 'FRVR');
}

function pickCategory(slug, cats) {
  const s = slug.toLowerCase();
  if (s.includes('race') || s.includes('drift') || s.includes('car') || s.includes('moto') || s.includes('rally')) return 'racing';
  if (s.includes('soccer') || s.includes('basket') || s.includes('football') || s.includes('tennis') || s.includes('golf') || s.includes('sport')) return 'sports';
  if (s.includes('puzzle') || s.includes('2048') || s.includes('mahjong') || s.includes('word') || s.includes('brain')) return 'puzzle';
  if (s.includes('tower') || s.includes('war') || s.includes('strategy') || s.includes('empire') || s.includes('kingdom')) return 'strategy';
  if (s.includes('-io') || s.includes('multiplayer') || s.includes('online') || s.includes('vs')) return 'multiplayer';
  if (s.includes('platform') || s.includes('vex') || s.includes('fireboy') || s.includes('red-ball')) return 'platformer';
  if (s.includes('idle') || s.includes('clicker') || s.includes('cookie') || s.includes('merge')) return 'casual';
  if (s.includes('adventure') || s.includes('minecraft') || s.includes('temple')) return 'adventure';
  if (s.includes('shoot') || s.includes('combat') || s.includes('gun') || s.includes('strike') || s.includes('zombie')) return 'action';
  return cats[Math.abs(hash(slug)) % cats.length].slug;
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return h;
}



const catIds = {};
for (const c of categories) {
  const id = uuid();
  catIds[c.slug] = id;
  db.prepare(
    `INSERT INTO categories (id, name, slug, sort_order) VALUES (?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET name=excluded.name`
  ).run(id, c.name, c.slug, categories.indexOf(c));
}

const existing = db.prepare('SELECT COUNT(*) as n FROM games').get().n;
if (existing >= 200) {
  console.log(`Database already has ${existing} games. Skipping seed.`);
  process.exit(0);
}

db.prepare('DELETE FROM games').run();

const insert = db.prepare(`
  INSERT INTO games (id, title, slug, description, thumbnail, category_id, embed_url, tags, featured, published, play_count, developer, supports_fullscreen)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const rows = [];
const uniqueSlugs = [...new Set(embedSlugs)];
for (let i = 0; i < uniqueSlugs.length; i++) {
  const slug = uniqueSlugs[i];
  const catSlug = pickCategory(slug, categories);
  const catRow = db.prepare('SELECT id FROM categories WHERE slug = ?').get(catSlug);
  const categoryId = catRow?.id ?? Object.values(catIds)[0];
  const title = titleFromSlug(slug);
  rows.push({
    id: uuid(),
    title,
    slug,
    description: `Play ${title} free in your browser. Fast loading HTML5 game with fullscreen support.`,
    thumbnail: `https://images.crazygames.com/${slug}/cover/600x600.webp?auto=format`,
    category_id: categoryId,
    embed_url: `https://www.crazygames.com/embed/${slug}`,
    tags: JSON.stringify([catSlug, 'browser', 'html5']),
    featured: i < 12 ? 1 : i % 17 === 0 ? 1 : 0,
    published: 1,
    play_count: 0,
    developer: 'Various',
    supports_fullscreen: 1,
  });
}

rows.push({
  id: uuid(),
  title: 'Bonk.io',
  slug: 'bonk-io-local',
  description: 'Physics multiplayer bonk battles — opens in our protected Bonk.io player.',
  thumbnail: 'https://bonk.io/graphics/tt/favicon-32x32.png',
  category_id: db.prepare('SELECT id FROM categories WHERE slug = ?').get('multiplayer').id,
  embed_url: '/bonk.html',
  tags: JSON.stringify(['multiplayer', 'local-player']),
  featured: 1,
  published: 1,
  play_count: 0,
  developer: 'Chaz',
  supports_fullscreen: 1,
});

db.exec('BEGIN TRANSACTION');
for (const r of rows) {
  insert.run(
    r.id, r.title, r.slug, r.description, r.thumbnail, r.category_id,
    r.embed_url, r.tags, r.featured, r.published, r.play_count, r.developer, r.supports_fullscreen
  );
}
db.exec('COMMIT');
console.log(`Seeded ${rows.length} games.`);
