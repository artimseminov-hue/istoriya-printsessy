// Сюжет книги: главы → мини-главы (истории) → фотографии; порядок открытия и сохранение прогресса.
// Контент берётся из site/content/content.js (window.SVETA_CONTENT) — код здесь менять не нужно.
//
// Мини-глава: { id, order, title, cover, photos: [{ image, caption }], text, author, audio, audioCaption, hidden }
// Письмо:     { id, order, type: "letter", title, letter, from, fromPhoto }
// Старый формат (одно фото = одно воспоминание, поле image) тоже понимается.

const FORMATS = { horizontal: [.66, .5], vertical: [.5, .66], square: [.58, .58] };
const KEY = 'sveta-kniga-progress-v1';
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function normPhotos(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((p) => (typeof p === 'string' ? { image: p } : p))
    .filter((p) => p && !p.hidden && str(p.image))
    .map((p) => ({ image: str(p.image), caption: str(p.caption), format: str(p.format) }));
}

// Приводим контент к единому виду: скрытые убираем, сортируем по order, режем главу на развороты.
export function buildStory(content, spreadSize) {
  const problems = [];
  if (!content || !Array.isArray(content.chapters)) {
    return { chapters: [], problems: ['Не удалось прочитать content.js: проверьте запятые и кавычки.'] };
  }
  const seen = new Set();
  const chapters = content.chapters.map((ch, ci) => {
    const type = ch.type === 'final' ? 'final' : 'chapter';
    const raw = Array.isArray(ch.stories) ? ch.stories : (ch.items || []);
    const items = raw
      .filter((it) => it && !it.hidden)
      .map((it, k) => {
        let id = String(it.id || `${ch.id || 'glava' + (ci + 1)}-${k + 1}`);
        if (seen.has(id)) { problems.push(`Повторяется id «${id}» — переименуйте одну из мини-глав.`); id += '-' + k; }
        seen.add(id);
        const kind = it.type === 'letter' ? 'letter' : 'story';
        // фото мини-главы: массив photos; для старого формата — одно поле image
        const photos = kind === 'story' ? normPhotos(it.photos || (str(it.image) ? [{ image: it.image, caption: it.caption, format: it.format }] : [])) : [];
        const cover = str(it.cover) || (photos[0] ? photos[0].image : '');
        const coverFormat = str(it.coverFormat) || str(it.format) || (photos.find((p) => p.image === cover) || {}).format || '';
        const [w, h] = kind === 'letter' ? [.7, .47] : (FORMATS[coverFormat] || FORMATS.horizontal);
        return {
          id, kind, order: Number.isFinite(+it.order) ? +it.order : k + 1, src: it,
          title: str(it.title), text: str(it.text), author: str(it.author),
          audio: str(it.audio), audioCaption: str(it.audioCaption),
          image: cover, cover, photos,
          letter: str(it.letter), from: str(it.from), fromPhoto: str(it.fromPhoto),
          w, h, chapter: ci
        };
      })
      .sort((a, b) => a.order - b.order);
    const spreads = [];
    for (let i = 0; i < items.length; i += spreadSize) spreads.push(items.slice(i, i + spreadSize));
    items.forEach((it, i) => { it.spread = Math.floor(i / spreadSize); });
    return {
      index: ci, id: ch.id || 'glava' + (ci + 1), type, title: ch.title || '', number: ci + 1,
      items, spreads,
      final: type === 'final' ? { title: ch.title || '', text: str(ch.text), video: str(ch.video), poster: str(ch.poster), prelude: str(ch.prelude) } : null
    };
  });
  return { chapters, problems };
}

// ---------- прогресс (localStorage; если он недоступен — просто живём без сохранения) ----------
// Прогресс больше не запоминается: книга при каждом открытии начинается с первой главы.
// Внутри одного просмотра мини-главы по-прежнему открываются по очереди (всё хранится в памяти).
// Чтобы вернуть «продолжить с того же места», поставьте REMEMBER = true.
const REMEMBER = false;
export function loadProgress(story) {
  let p = null;
  if (REMEMBER) { try { p = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { p = null; } }
  else { try { localStorage.removeItem(KEY); } catch (e) { /* ничего */ } }   // старый сохранённый прогресс больше не мешает
  if (!p || typeof p !== 'object') p = {};
  const max = story.chapters.length - 1;
  return {
    chapter: Math.min(Math.max(0, p.chapter | 0), max),
    unlocked: Math.min(Math.max(0, p.unlocked | 0), max),
    viewed: p.viewed && typeof p.viewed === 'object' ? p.viewed : {}
  };
}
export function saveProgress(p) {
  if (!REMEMBER) return;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* приватный режим и т. п. — не страшно */ }
}
export function resetProgress() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ничего */ }
}

// следующая непросмотренная мини-глава (или null — глава прочитана)
export function nextItem(ch, viewed) {
  return ch.items.find((it) => !viewed[it.id]) || null;
}
export const chapterDone = (ch, viewed) => ch.type === 'final' || ch.items.every((it) => viewed[it.id]);
