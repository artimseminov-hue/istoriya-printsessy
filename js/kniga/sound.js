// Звук книги: одна фоновая музыка на всю книгу и один «голос» для записей мини-глав.
// • Музыка создаётся один раз, играет по кругу и не перезапускается при переходах между главами.
// • Если браузер запрещает звук без нажатия — музыка и ожидающий голос включаются при первом касании/клике/клавише.
// • Пока звучит голос (или финальное видео), музыка плавно становится тише и потом возвращается.
// Громкость музыки идёт через Web Audio (на iPhone свойство volume у <audio> не работает).

const MUSIC_FILE = 'assets/audio/i-see-the-light.mp3';   // тот же трек, что во вступлении
const MUSIC_VOL = .45;      // обычная громкость музыки
const DUCK_VOICE = .06;     // доля от обычной, пока звучит голос (≈ в 16 раз тише — голос хорошо слышно)
const DUCK_VIDEO = 0;       // пока играет финальное видео
const MUTE_KEY = 'sveta-kniga-sound-off';

// крошечный беззвучный wav — им «разрешаем» элемент голоса на iPhone при первом касании
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

export function createSound() {
  if (window.__svetaSound) return window.__svetaSound;        // второй экземпляр не создаётся никогда

  const music = new Audio();
  music.loop = true;
  music.preload = 'auto';
  music.src = MUSIC_FILE;
  music.volume = 0;
  let musicMissing = false;
  music.addEventListener('error', () => { musicMissing = true; console.info(`[kniga] музыка не найдена: ${MUSIC_FILE}`); });
  // пришли из вступления — песня продолжается с того же места, а не начинается заново
  try {
    const from = JSON.parse(sessionStorage.getItem('sveta-music-t') || 'null');
    sessionStorage.removeItem('sveta-music-t');
    if (from && Date.now() - from.at < 60000 && from.t > 0) {
      const t = from.t + (Date.now() - from.at) / 1000;
      music.addEventListener('loadedmetadata', () => { if (music.duration) music.currentTime = t % music.duration; }, { once: true });
    }
  } catch (e) { /* ничего — начнём сначала */ }

  const voice = new Audio();
  voice.preload = 'none';
  voice.volume = 1;

  let off = false;
  try { off = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* без хранилища — звук включён */ }

  // уровень музыки: 0..1 от MUSIC_VOL; меняется плавно
  const level = { v: 0, duck: 1 };
  let ctx = null, gain = null;
  function apply() {
    const v = off ? 0 : MUSIC_VOL * level.v * level.duck;
    if (gain) gain.gain.value = v; else music.volume = Math.min(1, v);
  }
  function routeThroughWebAudio() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let c;
    try { c = new AC(); } catch (e) { return; }
    ctx = c;
    // музыку переводим в Web Audio только когда он точно работает — иначе она бы замолчала
    c.resume().then(() => {
      if (c.state !== 'running' || gain) return;
      try {
        const src = c.createMediaElementSource(music);
        gain = c.createGain();
        src.connect(gain).connect(c.destination);
        music.volume = 1;
        apply();
      } catch (e) { gain = null; }
    }).catch(() => {});
  }

  let duckers = new Set();
  function setDuck(who, on) {
    if (on === duckers.has(who)) return;
    if (on) duckers.add(who); else duckers.delete(who);
    const target = duckers.has('video') ? DUCK_VIDEO : duckers.size ? DUCK_VOICE : 1;
    // финальное видео: музыка не просто стихает, а ставится на паузу (на iPhone громкость <audio> не всегда управляется)
    if (who === 'video' && !on && !off && started && music.paused) music.play().catch(() => {});
    gsap.to(level, {
      duck: target, duration: on ? .8 : 1.6, ease: 'sine.inOut', overwrite: 'auto', onUpdate: apply,
      onComplete: () => { if (duckers.has('video')) music.pause(); }
    });
  }

  let started = false;
  function startMusic() {
    if (off || musicMissing) return;
    if (!music.paused) return;
    music.play().then(() => {
      if (!started) { started = true; gsap.to(level, { v: 1, duration: 2.5, ease: 'sine.out', onUpdate: apply }); }
    }).catch(() => { /* ждём первого действия */ });
  }

  // голос: ждущая запись (браузер не дал включить сам) запускается при первом действии
  let pendingVoice = false, unlocked = false;
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
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (!unlocked) {
      unlocked = true;
      routeThroughWebAudio();
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

  function setOff(v) {
    off = v;
    try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch (e) { /* ничего */ }
    if (off) { music.pause(); apply(); }
    else { startMusic(); apply(); }
  }

  const api = {
    music, voice,
    start: startMusic,
    playVoice, stopVoice, setDuck,
    get off() { return off; }, setOff,
    get pendingVoice() { return pendingVoice; },
    debug: () => ({ musicPaused: music.paused, musicTime: music.currentTime, level: level.v, duck: level.duck, gain: gain ? gain.gain.value : music.volume, webAudio: !!gain, ctxState: ctx ? ctx.state : null, voicePaused: voice.paused, voiceSrc: voice.getAttribute('src'), pendingVoice, off })
  };
  window.__svetaSound = api;
  return api;
}
