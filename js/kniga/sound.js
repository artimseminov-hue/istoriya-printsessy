// Звук книги: одна фоновая музыка на всю книгу и один «голос» для записей мини-глав.
// • Книга обычно открыта ВНУТРИ страницы вступления: тогда музыка — та же песня вступления (она не прерывается),
//   а голос — элемент, который вступление уже «разрешило» нажатием «Начать историю». На iPhone звук можно включить
//   только касанием в той же странице, поэтому иначе книга после вступления молчала.
// • Открыта отдельно (kniga.html) — своя музыка; если браузер не даёт звук без нажатия, всё включится при первом касании.
// • Пока звучит голос, музыка тише (где громкость управляется) или на паузе (iPhone: громкость <audio> там не меняется).
//   Web Audio не используем: на iPhone он молчит в беззвучном режиме.

const MUSIC_FILE = 'assets/audio/i-see-the-light.mp3';   // тот же трек, что во вступлении
const MUSIC_VOL = .45;      // обычная громкость музыки
const DUCK_VOICE = .06;     // доля от обычной, пока звучит голос
const DUCK_VIDEO = 0;       // пока играет финальное видео
const MUTE_KEY = 'sveta-kniga-sound-off';

// крошечный беззвучный wav — им «разрешаем» элемент голоса при первом касании (если книга открыта отдельно)
function silentWav() {
  const n = 800, b = new DataView(new ArrayBuffer(44 + n));
  const s = (o, t) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); b.setUint32(4, 36 + n, true); s(8, 'WAVEfmt '); b.setUint32(16, 16, true);
  b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, 8000, true); b.setUint32(28, 8000, true);
  b.setUint16(32, 1, true); b.setUint16(34, 8, true); s(36, 'data'); b.setUint32(40, n, true);
  for (let i = 0; i < n; i++) b.setUint8(44 + i, 128);
  let str = ''; new Uint8Array(b.buffer).forEach((v) => { str += String.fromCharCode(v); });
  return 'data:audio/wav;base64,' + btoa(str);
}

// элементы, которые передало вступление (книга открыта внутри него)
function fromIntro(name) {
  try { return window.parent !== window ? window.parent[name] || null : null; } catch (e) { return null; }
}

export function createSound() {
  if (window.__svetaSound) return window.__svetaSound;        // второй экземпляр не создаётся никогда

  const introMusic = fromIntro('__svetaIntroMusic');
  const introVoice = fromIntro('__svetaIntroVoice');

  const music = introMusic || new Audio();
  music.loop = true;
  let musicMissing = false;
  if (!introMusic) {
    music.preload = 'auto';
    music.src = MUSIC_FILE;
    music.volume = 0;
    music.addEventListener('error', () => { musicMissing = true; console.info(`[kniga] музыка не найдена: ${MUSIC_FILE}`); });
    // пришли из вступления старым способом (отдельной страницей) — песня продолжается с того же места
    try {
      const from = JSON.parse(sessionStorage.getItem('sveta-music-t') || 'null');
      sessionStorage.removeItem('sveta-music-t');
      if (from && Date.now() - from.at < 60000 && from.t > 0) {
        const t = from.t + (Date.now() - from.at) / 1000;
        music.addEventListener('loadedmetadata', () => { if (music.duration) music.currentTime = t % music.duration; }, { once: true });
      }
    } catch (e) { /* ничего — начнём сначала */ }
  }

  const voice = introVoice || new Audio();
  voice.preload = 'none';
  voice.volume = 1;

  // можно ли менять громкость <audio>? На iPhone/iPad — нет: свойство volume там может «принимать» значение,
  // но звук от этого тише не становится. Поэтому на них музыка под голосом ставится на паузу.
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const probe = new Audio(); probe.volume = .5;
  const volumeWorks = !isIOS && Math.abs(probe.volume - .5) < .01;

  let off = false;
  try { off = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* без хранилища — звук включён */ }
  if (off && introMusic) introMusic.pause();          // музыку в книге выключали раньше — песню вступления гасим

  // уровень музыки: 0..1 от MUSIC_VOL; меняется плавно
  const level = { v: 0, duck: 1 };
  function apply() {
    if (!volumeWorks) return;
    music.volume = Math.min(1, off ? 0 : MUSIC_VOL * level.v * level.duck);
  }

  let started = false;
  const duckers = new Set();
  const resume = () => { if (!off && !musicMissing && started && !duckers.size && music.paused) music.play().catch(() => {}); };
  function setDuck(who, on) {
    if (on === duckers.has(who)) return;
    if (on) duckers.add(who); else duckers.delete(who);
    const target = duckers.has('video') ? DUCK_VIDEO : duckers.size ? DUCK_VOICE : 1;
    if (!volumeWorks) {                               // iPhone: тише сделать нельзя — ставим на паузу и продолжаем
      if (duckers.size) music.pause(); else resume();
      return;
    }
    if (!on) resume();
    gsap.to(level, {
      duck: target, duration: on ? .8 : 1.6, ease: 'sine.inOut', overwrite: 'auto', onUpdate: apply,
      onComplete: () => { if (duckers.has('video')) music.pause(); }        // во время финального видео музыка стоит
    });
  }

  function startMusic() {
    if (off || musicMissing) return;
    if (!music.paused) {                              // песня уже играет (из вступления) — просто подхватываем
      if (!started) { started = true; level.v = .78; gsap.to(level, { v: 1, duration: 1.5, ease: 'sine.out', onUpdate: apply }); apply(); }
      return;
    }
    music.play().then(() => {
      if (!started) { started = true; gsap.to(level, { v: 1, duration: 2.5, ease: 'sine.out', onUpdate: apply }); }
      else apply();
    }).catch(() => { /* ждём первого действия */ });
  }

  // голос: ждущая запись (браузер не дал включить сам) запускается при первом действии
  let pendingVoice = false, unlocked = !!introVoice;
  function playVoice() {
    pendingVoice = false;
    if (!voice.getAttribute('src')) return;
    voice.play().catch(() => { pendingVoice = true; });
  }
  function stopVoice() {
    pendingVoice = false;
    voice.pause();
    if (voice.getAttribute('src')) { voice.removeAttribute('src'); voice.load(); }
    setDuck('voice', false);
  }
  // музыка тише, только пока по-настоящему звучит запись (беззвучная «разрешающая» не считается)
  const realVoice = () => !!voice.getAttribute('src') && !voice.src.startsWith('data:');
  const syncVoiceDuck = () => setDuck('voice', realVoice() && !voice.paused && !voice.ended);
  for (const ev of ['play', 'playing', 'pause', 'ended', 'emptied']) voice.addEventListener(ev, syncVoiceDuck);

  function unlock(e) {
    if (e && !e.isTrusted) return;                     // только настоящее действие человека
    if (!unlocked) {
      unlocked = true;
      if (!voice.getAttribute('src')) {                 // «разрешить» элемент голоса прямо в жесте
        voice.src = silentWav();
        voice.play().then(() => { if (voice.src.startsWith('data:')) { voice.pause(); voice.removeAttribute('src'); voice.load(); } syncVoiceDuck(); }).catch(() => {});
      }
    }
    startMusic();
    // ждущий голос — чуть позже: если это нажатие закрывает мини-главу, запись успеет отмениться
    if (pendingVoice) setTimeout(() => { if (pendingVoice) playVoice(); }, 60);
  }
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlock, { capture: true, passive: true });

  // свернули вкладку — музыка ждёт; вернулись — продолжает (если не выключена и не идёт голос/видео)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (started) music.pause(); }
    else resume();
  });

  function setOff(v) {
    off = v;
    try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch (e) { /* ничего */ }
    if (off) { music.pause(); apply(); }
    else { startMusic(); resume(); apply(); }
  }

  const api = {
    music, voice,
    start: startMusic,
    playVoice, stopVoice, setDuck,
    get off() { return off; }, setOff,
    get pendingVoice() { return pendingVoice; },
    debug: () => ({ musicPaused: music.paused, musicTime: music.currentTime, level: level.v, duck: level.duck, volume: music.volume, volumeWorks, fromIntro: !!introMusic, voicePaused: voice.paused, voiceSrc: voice.getAttribute('src'), pendingVoice, off })
  };
  window.__svetaSound = api;
  return api;
}
