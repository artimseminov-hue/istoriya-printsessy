/* Вступление-видео с заставкой «переверни телефон».
   Тексты и файлы — в data/vstuplenie.json. Частицы — js/particles.js (window.FX).
   Видео играет без звука; «I See the Light» — отдельная дорожка, идёт синхронно с видео
   и не обрывается после него (выключается только window.SvetaMusic.stop() перед поздравлением). */
(async function () {
  const $ = (id) => document.getElementById(id);
  const data = await fetch('data/vstuplenie.json').then((r) => r.json());
  const T = data.texts, M = data.music;

  $('rotateTitle').textContent = T.rotateTitle;
  $('rotateNote').textContent = T.rotateNote;
  $('startTitle').textContent = T.startTitle;
  $('startHint').textContent = T.startHint;
  $('replayBtn').textContent = T.replay;
  const steps = T.startSteps || ['Поверни телефон горизонтально', 'Включи звук'];
  $('stepPhone').textContent = steps[0];
  $('stepSound').textContent = steps[1];

  const video = $('video'), music = $('music'), start = $('start'), startBtn = $('startBtn');
  const replayBtn = $('replayBtn'), soundBtn = $('soundBtn');
  video.poster = data.video.poster;
  video.src = data.video.file;
  music.src = M.file;
  music.volume = 0;

  // То же условие, что в povorot.css: телефон (сенсорный, без мыши, узкий) в вертикальном положении.
  // Ориентацию определяем медиазапросом, а не Screen Orientation API: он есть не везде.
  const mq = matchMedia('(orientation: portrait) and (hover: none) and (pointer: coarse) and (max-width: 600px)');
  const needRotate = () => mq.matches;

  let state = 'idle';       // idle → ready (кнопка) → playing ⇄ paused → ended
  let pausedFrom = null;    // в каком состоянии были до паузы
  let primed = false;       // звук разрешён касанием
  let soundWanted = true;   // пользователь не выключал музыку

  // ---------- громкость: плавно ----------
  let fadeId = 0;
  function fadeTo(target, sec, done) {
    const id = ++fadeId, from = music.volume, t0 = performance.now();
    const step = (now) => {
      if (id !== fadeId) return;
      const k = Math.min(1, (now - t0) / (sec * 1000 || 1));
      music.volume = from + (target - from) * k;
      if (k < 1) requestAnimationFrame(step); else if (done) done();
    };
    requestAnimationFrame(step);
  }

  function setSoundBtn() {
    const on = soundWanted && !music.paused;
    soundBtn.setAttribute('aria-pressed', on);
    soundBtn.setAttribute('aria-label', on ? T.soundOn : T.soundOff);
  }
  music.addEventListener('play', setSoundBtn);
  music.addEventListener('pause', setSoundBtn);

  function startMusic(fadeSec) {
    if (!soundWanted) return Promise.resolve();
    if (state === 'playing' && canSeek(video.currentTime)) music.currentTime = video.currentTime;   // ровно под картинку
    music.muted = false;
    return music.play().then(() => { primed = true; fadeTo(M.volume, fadeSec); });
  }

  // ---------- воспроизведение ----------
  function play(fadeSec) {
    soundBtn.hidden = false;
    if (state === 'playing') {
      video.classList.add('is-on');
      video.play().catch(() => {});
    }
    startMusic(fadeSec).catch(() => {
      // браузер не дал включить звук без нажатия — просим нажать, картинку держим
      video.pause();
      showStart(video.currentTime > .5);
    });
  }

  function pauseAll() {
    video.pause();
    fadeTo(0, .35, () => music.pause());
  }

  function showStart(resume) {
    pausedFrom = state === 'ended' ? 'ended' : 'playing';
    state = 'ready';
    startBtn.textContent = resume ? T.resumeButton : T.startButton;
    start.classList.remove('is-leaving');
    start.hidden = false;
  }

  function begin() {
    const next = pausedFrom || 'playing';
    pausedFrom = null;
    state = next;
    start.classList.add('is-leaving');
    setTimeout(() => { start.hidden = true; }, 900);
    play(video.currentTime < .5 ? M.fadeIn : .8);
  }

  // первый запуск (после поворота, на компьютере и планшете — сразу): всегда сначала экран
  // «поверни телефон и включи звук» с кнопкой — история начинается только по нажатию
  function autoStart() {
    if (state !== 'idle' || needRotate()) return;
    state = 'playing';
    showStart(false);
  }

  // элемент для голосов книги «разрешаем» прямо этим нажатием (на iPhone иначе мамин голос в книге не включится сам)
  const SILENT = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
  function unlockBookVoice() {
    if (window.__svetaIntroVoice) return;
    const v = new Audio();
    v.src = SILENT;
    v.play().then(() => { v.pause(); v.removeAttribute('src'); v.load(); }).catch(() => {});
    window.__svetaIntroVoice = v;
  }
  startBtn.addEventListener('click', () => { primed = true; unlockBookVoice(); begin(); });

  // Касание заставки заранее «разрешает» звук: после поворота музыка включится без лишней кнопки.
  $('rotate').addEventListener('pointerdown', () => {
    if (primed) return;
    music.muted = false; music.volume = 0;
    music.play().then(() => { primed = true; if (state !== 'playing') music.pause(); }).catch(() => {});
  });

  // ---------- поворот ----------
  let handedOff = false;            // книга уже открыта поверх вступления — дальше музыкой управляет она
  function onOrientation() {
    toggleRotateFx();
    if (handedOff) return;
    if (needRotate()) {
      if (state === 'playing' || state === 'ended') { pausedFrom = state; state = 'paused'; pauseAll(); }
      return;
    }
    if (state === 'idle') { setTimeout(autoStart, 500); return; }  // даём заставке растаять
    if (state === 'paused') {
      state = pausedFrom; pausedFrom = null;
      play(.8);                                                     // с того же места
    }
  }
  mq.addEventListener ? mq.addEventListener('change', onOrientation) : mq.addListener(onOrientation);

  // вкладку свернули — пауза, вернулись — продолжаем
  let hiddenFrom = null;
  document.addEventListener('visibilitychange', () => {
    if (handedOff) return;
    if (document.hidden) {
      if (state === 'playing' || state === 'ended') { hiddenFrom = state; state = 'paused'; pauseAll(); }
    } else if (hiddenFrom && state === 'paused' && !needRotate()) {
      state = hiddenFrom; hiddenFrom = null; play(.8);
    }
  });

  // ---------- видео и музыка вместе ----------
  // перематывать музыку можно, только если сервер это позволяет (иначе песня начиналась бы заново)
  const canSeek = (t) => music.seekable.length > 0 && music.seekable.end(music.seekable.length - 1) >= t;
  // Музыка живёт отдельно от видео: не ставится на паузу, когда видео догружается, и не перематывается
  // постоянно (на iPhone частые перемотки звука и паузы мешали видео вообще стартовать).
  // Подстраиваем её под картинку только при заметном расхождении — больше 1,5 с.
  video.addEventListener('timeupdate', () => {
    if (state === 'playing' && !music.paused && !music.seeking && Math.abs(music.currentTime - video.currentTime) > 1.5 && canSeek(video.currentTime)) {
      music.currentTime = video.currentTime;
    }
  });
  video.addEventListener('playing', () => { if (state === 'playing' && soundWanted && music.paused && primed) startMusic(.4).catch(() => {}); });

  // Страховка: если видео после нажатия не тронулось за 8 с или застряло на 8 с — сразу в книгу
  let lastT = -1, stuckSince = 0;
  const watchdog = setInterval(() => {
    if (state !== 'playing' || leaving || document.hidden) { stuckSince = 0; return; }
    const t = video.currentTime;
    if (Math.abs(t - lastT) > .05) { lastT = t; stuckSince = 0; return; }
    if (!stuckSince) { stuckSince = Date.now(); return; }
    if (Date.now() - stuckSince > 8000) { state = 'ended'; goToBook(); }
  }, 500);
  video.addEventListener('ended', () => {
    state = 'ended';                 // последний кадр — раскрытая книга; музыка играет дальше
    goToBook();                      // и сразу в книгу — без кнопки
  });
  // книга в видео раскрылась (data.video.bookOpenAt, ≈13 с) — переходим сразу, не досматривая перелистывание
  const BOOK_AT = +data.video.bookOpenAt || 0;
  video.addEventListener('timeupdate', () => {
    if (BOOK_AT && state === 'playing' && video.currentTime >= BOOK_AT) { state = 'ended'; goToBook(); }
  });

  // ---------- переход в книгу ----------
  // Книга открывается НА ЭТОЙ ЖЕ странице (во весь экран поверх вступления), а не отдельной страницей:
  // на iPhone звук разрешается только касанием в той же странице — при переходе на kniga.html музыка молчала.
  // Песня вступления продолжает играть без паузы, книга берёт её себе (window.__svetaIntroMusic).
  let leaving = false;
  function goToBook() {
    if (leaving || state !== 'ended') return;
    leaving = true;
    $('leave').classList.add('is-on');
    fadeTo(.35, .8);
    setTimeout(() => {
      handedOff = true; fadeId++;    // вступление больше не трогает громкость
      video.pause();
      soundBtn.hidden = true;
      window.__svetaIntroMusic = music;
      const f = document.createElement('iframe');
      f.className = 'book-frame'; f.title = 'Книга'; f.allow = 'autoplay; fullscreen'; f.setAttribute('allowfullscreen', '');
      f.src = 'kniga.html?embed=1';
      f.addEventListener('load', () => {
        f.classList.add('is-on');
        try { f.contentWindow.focus(); } catch (e) { /* ничего */ }
        // вступление больше не нужно: освобождаем видео и всё, что рисуется под книгой (иначе на телефоне подтормаживало)
        setTimeout(() => {
          clearInterval(watchdog);
          FX.halt();
          video.removeAttribute('src'); video.removeAttribute('poster'); video.load();
          for (const el of [$('cinema'), $('rotate'), $('leave')]) if (el) el.style.display = 'none';
        }, 900);
      }, { once: true });
      document.body.appendChild(f);
    }, 850);
  }
  // вернулись кнопкой «Назад» из книги — страница могла восстановиться из кэша с тёмным экраном
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    $('leave').classList.remove('is-on');
    leaving = false;
    replayBtn.hidden = false;
  });

  replayBtn.addEventListener('click', () => {
    replayBtn.hidden = true;
    video.currentTime = 0;
    music.volume = 0;
    state = 'playing';
    play(M.fadeIn);
  });

  soundBtn.addEventListener('click', () => {
    soundWanted = !soundWanted;
    if (!soundWanted) { fadeTo(0, .4, () => music.pause()); }
    else { primed = true; startMusic(.8).catch(() => {}); }
    setSoundBtn();
  });

  // ---------- частицы на заставке ----------
  const phone = document.querySelector('.phone-wrap');
  function toggleRotateFx() {
    const on = needRotate();
    FX.stars(on);
    FX.emitter('phone', {
      pos: () => { const r = phone.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * .55 }; },
      kind: 'dust', rate: 9, spread: 90, on
    });
  }

  window.SvetaMusic = {
    stop(sec = M.fadeOut) { soundWanted = false; fadeTo(0, sec, () => music.pause()); }
  };
  window.__vst = { state: () => state, video, music };  // для проверки

  toggleRotateFx();
  autoStart();
})();
