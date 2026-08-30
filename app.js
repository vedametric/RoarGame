/*
 * app.js — screen flow: splash → mic → photo + voice for each player →
 * pick a game → countdown → play → results.
 */
(function () {
  'use strict';

  var RECORD_MS = 2500;
  // Drawn as real artwork in animals.js — emoji in a canvas could not be
  // relied on to render at all.
  var ANIMALS = Animals.list();

  var SKINS = [
    { color: '#ff8a2b', glow: '#ffd24c', emoji: '🦁' },
    { color: '#31d8ff', glow: '#a78bfa', emoji: '🐯' }
  ];

  var playerCount = 2;
  var pendingGame = null;         // set when a game was chosen from the list
  var best = 0;                   // solo high score for this session
  var players = [newPlayer(0), newPlayer(1)];
  var current = 0;
  var mode = 'grab';
  var inputMode = 'tap';          // tap by default — kinder on small throats
  var series = [0, 0];            // rounds won this session
  var roundsPlayed = 0;
  var recording = false;
  var redoingVoices = false;
  var wakeLock = null;

  function newPlayer(i) {
    return {
      name: 'Player ' + (i + 1),
      photo: '',
      img: null,
      color: SKINS[i].color,
      glow: SKINS[i].glow,
      animal: null
    };
  }

  function active() { return players.slice(0, playerCount); }

  function $(id) { return document.getElementById(id); }
  function on(id, fn) { var e = $(id); if (e) e.addEventListener('click', fn); }

  /* ── the games ────────────────────────────────────────────────
     One list, rendered as tiles on the first screen and again on ALL GAMES, so
     the two can never drift apart. Play first, then the learning ones — that is
     the order a child reaches for them in. */

  var GAMES = [
    { id: 'grab',    emoji: '🖐️', name: 'GRAB IT!',      note: 'tap to grab the treats',     kind: 'play' },
    { id: 'roar',    emoji: '📊', name: 'ROAR METER',    note: 'loudest beast wins',         kind: 'play' },
    { id: 'balloon', emoji: '🎈', name: 'HOT AIR BALLOON', note: 'by Sienna 🦄',             kind: 'play' },
    { id: 'spell',   emoji: '🐝', name: 'SPELLING BEE',  note: 'find the missing letters',   kind: 'learn' },
    { id: 'clock',   emoji: '🕐', name: "WHAT'S THE TIME?", note: 'learn to read a clock',   kind: 'learn' },
    { id: 'count',   emoji: '🔢', name: 'COUNTING',      note: 'zero to forever',            kind: 'learn' },
    { id: 'calc',    emoji: '🧮', name: 'CALCULATOR',    note: "Sienna's, and it talks",     kind: 'learn' }
  ];

  function tileHTML(g) {
    return '<button class="tile tile--' + g.kind + '" type="button" data-game="' + g.id + '">' +
             '<span class="tile-emoji" aria-hidden="true">' + g.emoji + '</span>' +
             '<b class="tile-name">' + g.name + '</b>' +
             '<i class="tile-note">' + g.note + '</i>' +
           '</button>';
  }

  function buildTiles() {
    var html = GAMES.map(tileHTML).join('');
    ['home-tiles', 'all-tiles'].forEach(function (id) {
      var box = $(id);
      if (box) box.innerHTML = html;
    });
  }

  var LAUNCH = {
    grab:    function () { stopEverything(); pendingGame = 'grab'; show('screen-count'); },
    roar:    function () { stopEverything(); pendingGame = 'roar'; show('screen-count'); },
    balloon: function () { RoarAudio.resume(); startBalloon(); },
    count:   function () { RoarAudio.resume(); startCounting(); },
    calc:    function () { RoarAudio.resume(); startCalc(); },
    spell:   function () { RoarAudio.resume(); startSpell(); },
    clock:   function () { RoarAudio.resume(); startClock(); }
  };

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-game]') : null;
    if (!t) return;
    var go = LAUNCH[t.getAttribute('data-game')];
    if (go) go();
  });

  /* ── screens ──────────────────────────────────────────────── */

  var PLAYING = { 'screen-countdown': 1, 'screen-grab': 1, 'screen-roar': 1,
                  'screen-sides': 1, 'screen-balloon': 1, 'screen-counting': 1,
                  'screen-calc': 1, 'screen-spell': 1, 'screen-clock': 1 };

  // Anything that is running gets torn down before a new screen appears, so a
  // stray tap can never leave two game loops fighting over the same canvas.
  function stopEverything() {
    try { if (GrabGame.running) GrabGame.stop(); } catch (e) {}
    try { if (RoarGame.running) RoarGame.stop(); } catch (e) {}
    try { if (BalloonGame.running) BalloonGame.stop(); } catch (e) {}
    try { if (CountGame.running) CountGame.stop(); } catch (e) {}
    try { if (CalcGame.running) CalcGame.stop(); } catch (e) {}
    try { if (SpellGame.running) SpellGame.stop(); } catch (e) {}
    try { if (ClockGame.running) ClockGame.stop(); } catch (e) {}
    clearTimeout(countdownTimer);
    pendingStart = null;
    RoarAudio.stopAllVoices();
  }

  /* ── leaving a game ───────────────────────────────────────────
     Every ✕ goes through here. Whatever is playing is held while the question
     is up — the clock stops, the balloon hangs still, the counting waits — so
     the answer is never rushed, and answering "keep playing" puts you back
     exactly where you were rather than costing you the round. */

  var quitAsk = null;   // the pending "yes, leave" action

  function askQuit(opts) {
    quitAsk = opts.onLeave;
    $('quit-emoji').textContent = opts.emoji || '👋';
    $('quit-title').textContent = opts.title || 'Leave the game?';
    $('quit-msg').textContent = opts.msg || "Your score won't be saved.";
    $('quit-stay').textContent = opts.stay || 'KEEP PLAYING';
    $('quit-go').textContent = opts.leave || 'LEAVE';
    // Only tinted when something is actually lost. Finishing a flight ends with
    // your score on screen, so it is not a warning.
    $('quit-go').classList.toggle('btn--quit', opts.loses !== false);
    $('quit-sheet').hidden = false;
    holdPlay(true);
  }

  function closeQuit() {
    $('quit-sheet').hidden = true;
    quitAsk = null;
    holdPlay(false);
  }

  // Only what we actually stopped gets started again — someone who had already
  // pressed ⏸ on the counting keeps their pause when they answer "keep going".
  var held = [];

  function holdPlay(on) {
    if (on) {
      held = [];
      [GrabGame, RoarGame, BalloonGame, CountGame].forEach(function (g) {
        if (!g || !g.running || !g.setPaused || g.paused) return;
        try { g.setPaused(true); held.push(g); } catch (e) {}
      });
    } else {
      held.forEach(function (g) {
        if (g.running) { try { g.setPaused(false); } catch (e) {} }
      });
      held = [];
    }
  }

  on('quit-stay', closeQuit);
  on('quit-go', function () {
    var go = quitAsk;
    $('quit-sheet').hidden = true;
    quitAsk = null;
    if (go) go();
  });

  // Tapping the dark surround is the same as "keep playing" — the safe answer,
  // since that is where a stray finger lands.
  $('quit-sheet').addEventListener('click', function (e) {
    if (e.target === this) closeQuit();
  });

  function show(id) {
    var all = document.querySelectorAll('.screen');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('is-active');
    $(id).classList.add('is-active');
    // A screen that changes underneath the question (a timer running out, say)
    // takes the question with it, and nothing is left frozen behind it.
    $('quit-sheet').hidden = true;
    quitAsk = null;
    holdPlay(false);
    // Keep it out of the play area, where it sits inside player 2's half.
    $('btn-sound').hidden = !!PLAYING[id];
  }

  // Rotating the phone changes every dimension the canvases were sized from,
  // and iOS reports the new size a beat after the event — so refit more than
  // once rather than trusting the first reading.
  function refit() {
    [GrabGame, BalloonGame, ClockGame].forEach(function (g) {
      if (!g || !g.running) return;
      // Canvas games that need repainting say so with _refit; the rest just
      // need their backing store resized.
      try { if (g._refit) g._refit(); else if (g._fit) g._fit(); } catch (e) {}
    });
  }

  function onViewportChange() {
    refit();
    setTimeout(refit, 120);
    setTimeout(refit, 400);
  }

  addEventListener('orientationchange', onViewportChange);
  addEventListener('resize', onViewportChange);
  if (global_visualViewport()) {
    global_visualViewport().addEventListener('resize', onViewportChange);
  }
  function global_visualViewport() { return window.visualViewport || null; }

  function setSound(on) {
    RoarAudio.setMuted(!on);
    $('btn-sound').textContent = on ? '🔊' : '🔇';
    $('btn-sound').classList.toggle('is-off', !on);
    if (!on) Say.stop();
  }

  // Recorded where we have it, the browser voice where we do not.
  var SAID = { 'Pick a game!': 'm-pickagame' };

  function say(text) {
    if (RoarAudio.muted) return;
    Say.line(SAID[text] || null, text, { rate: 1, pitch: 1.15 });
  }

  function keepAwake() {
    try {
      if (navigator.wakeLock && !wakeLock) {
        navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }, function () {});
      }
    } catch (e) {}
  }

  /* ── photos ───────────────────────────────────────────────── */

  // Square centre-crop down to 320px so we can draw it into canvas cheaply
  // and never hold a 12-megapixel iPhone photo in memory.
  function squarePhoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var S = 320;
        var cv = document.createElement('canvas');
        cv.width = cv.height = S;
        var c = cv.getContext('2d');
        var side = Math.min(img.width, img.height);
        c.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  function setPhoto(dataUrl) {
    var p = players[current];
    p.photo = dataUrl;
    p.img = new Image();
    p.img.src = dataUrl;

    var prev = $('avatar-preview');
    prev.src = dataUrl;
    prev.hidden = false;
    $('avatar-plus').hidden = true;
    $('avatar-drop').classList.add('has-photo');
    $('btn-photo-next').disabled = false;
  }

  /* ── animal picker ────────────────────────────────────────── */

  function buildAnimalGrid() {
    var grid = $('animal-grid');
    ANIMALS.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'animal';
      b.setAttribute('aria-label', a.name);
      b.innerHTML = '<img class="animal-face" alt="" src="' +
                    Animals.avatar(a.key, SKINS[0]) + '">' +
                    '<span class="animal-name">' + a.name + '</span>';
      b.addEventListener('click', function () { pickAnimal(a); });
      grid.appendChild(b);
    });
  }

  function openAnimals() {
    var sheet = $('animal-sheet');
    // Tint the picker with whichever player is choosing.
    sheet.style.setProperty('--c', SKINS[current].color);
    sheet.style.setProperty('--g', SKINS[current].glow);
    var imgs = sheet.querySelectorAll('.animal-face');
    for (var i = 0; i < imgs.length && i < ANIMALS.length; i++) {
      imgs[i].src = Animals.avatar(ANIMALS[i].key, SKINS[current]);
    }
    sheet.hidden = false;
  }

  function closeAnimals() { $('animal-sheet').hidden = true; }

  function pickAnimal(a) {
    players[current].animal = a.key;
    // A kid who cannot type yet still ends up with a name they chose.
    var nameEl = $('name-input');
    if (!nameEl.value.trim()) nameEl.value = a.name;
    setPhoto(Animals.avatar(a.key, SKINS[current]));
    RoarAudio.sfx('spawn');
    closeAnimals();
  }

  /* ── setup flow ───────────────────────────────────────────── */

  function startSetup(i, voicesOnly) {
    current = i;
    var p = players[i];

    $('setup-chip').textContent = 'PLAYER ' + (i + 1);
    $('setup-chip').className = 'player-chip player-chip--p' + (i + 1);
    $('step-photo').hidden = false;
    $('step-voice').hidden = true;

    var prev = $('avatar-preview');
    prev.hidden = !p.photo;
    prev.src = p.photo || '';
    $('avatar-plus').hidden = !!p.photo;
    $('avatar-drop').classList.toggle('has-photo', !!p.photo);
    $('btn-photo-next').disabled = !p.photo;
    $('name-input').value = p.name.indexOf('Player ') === 0 ? '' : p.name;
    $('photo-input').value = '';

    closeAnimals();
    show('screen-setup');

    // "Re-record our sounds" keeps the photos, so jump straight to the mic.
    if (voicesOnly) { redoingVoices = true; toVoiceStep(); return; }
    say('Player ' + (i + 1) + '. Add your photo!');
  }

  function toVoiceStep() {
    var p = players[current];
    var typed = $('name-input').value.trim();
    if (typed) p.name = typed;

    $('step-photo').hidden = true;
    $('step-voice').hidden = false;
    $('orb-photo').src = p.photo;
    $('btn-record').className = 'record-orb record-orb--p' + (current + 1);
    $('orb-label').textContent = 'TAP & ROAR';
    $('orb-ring').style.setProperty('--p', '0');
    $('rec-status').innerHTML = '&nbsp;';
    $('btn-voice-next').hidden = true;
    $('btn-rerecord').hidden = true;
    $('btn-hear').hidden = true;
    $('rec-meter-fill').style.width = '0%';

    say(p.name + ', make your sound!');
  }

  function doRecord() {
    if (recording) return;
    recording = true;

    var ring = $('orb-ring'), meter = $('rec-meter-fill');
    $('btn-record').classList.add('is-recording');
    $('orb-label').textContent = 'GO!';
    $('rec-status').textContent = 'Listening…';
    $('btn-voice-next').hidden = true;
    $('btn-rerecord').hidden = true;

    RoarAudio.ensureMic().then(function () {
      return RoarAudio.recordProfile(RECORD_MS, function (progress, level) {
      ring.style.setProperty('--p', progress);
        meter.style.width = Math.round(level * 100) + '%';
      });
    }).then(function (res) {
      recording = false;
      $('btn-record').classList.remove('is-recording');
      meter.style.width = '0%';

      if (!res.ok) {
        ring.style.setProperty('--p', '0');
        $('orb-label').textContent = 'TRY AGAIN';
        $('rec-status').textContent = res.reason === 'quiet'
          ? "We couldn't hear you! Get closer and go BIG. 🔊"
          : 'Keep the sound going the whole time! 🎵';
        say('Louder!');
        return;
      }

      RoarAudio.profiles[current] = res.profile;
      $('orb-label').textContent = 'NICE!';
      $('rec-status').textContent = 'Got it! That sound is yours now. 🎉';
      $('btn-voice-next').hidden = false;
      $('btn-rerecord').hidden = false;
      $('btn-hear').hidden = false;
      $('rec-status').textContent = res.profile.recorded
        ? 'Got it! Tap ▶️ to hear yourself. 🎉'
        : 'Got it! (We made you a growl to use.) 🎉';
      RoarAudio.sfx('go');
    }, function () {
      recording = false;
      $('btn-record').classList.remove('is-recording');
      $('rec-status').textContent = 'We need the microphone to record your sound.';
    });
  }

  // The mic must be live to hear the calibration, so play the preview back
  // only after we have let it go — otherwise iOS keeps it on the earpiece.
  function hearMyself() {
    RoarAudio.releaseMic();
    setTimeout(function () { RoarAudio.playVoiceOnce(current, 1); }, 120);
  }

  function afterVoice() {
    if (current === 0 && playerCount === 2) { startSetup(1, redoingVoices); return; }
    redoingVoices = false;
    toModes();
  }

  /* ── mode picker ──────────────────────────────────────────── */

  function toModes() {
    for (var i = 0; i < 2; i++) {
      var on = i < playerCount;
      $('vs-photo-' + (i + 1)).src = on ? players[i].photo : '';
      $('vs-photo-' + (i + 1)).hidden = !on;
      $('vs-name-' + (i + 1)).textContent = on ? players[i].name : '';
    }
    document.querySelector('.vs-badge').hidden = playerCount === 1;

    $('voice-warn').innerHTML = '⚠️ In <b>SHOUT</b> mode your two sounds are <b>very</b> alike, ' +
      'so we might mix you up. Either use <b>TAP</b>, or re-record with really different sounds — ' +
      'one high MEOW, one deep ROAR.';

    applyMicPolicy();
    setInputMode(inputMode);

    if (pendingGame) {
      var go = pendingGame;
      pendingGame = null;
      if (go === 'grab') playGrab(); else playRoar();
      return;
    }

    show('screen-modes');
    say('Pick a game!');
  }

  var MODE_COPY = {
    grab: {
      tap: 'Phone flat in the middle. Hold your own side to shoot your claw out and grab the treats — but never the bombs! Gets faster and faster.',
      voice: 'Phone flat in the middle. Shout to shoot your claw out and grab the treats — but never the bombs! Gets faster and faster.'
    },
    roar: {
      tap: 'Hold the phone up between you. Hold your own side and push your bar to the sky.',
      voice: 'Hold the phone up between you. Roar your loudest and push your bar to the sky.'
    }
  };

  // Exactly one input system is live at a time: TAP releases the microphone,
  // SHOUT takes it back.
  function applyMicPolicy() {
    if (inputMode === 'tap') {
      RoarAudio.releaseMic();
      return Promise.resolve(true);
    }
    return RoarAudio.ensureMic().then(function () { return true; }, function () { return false; });
  }

  function setInputMode(m) {
    inputMode = m;
    $('seg-tap').classList.toggle('is-on', m === 'tap');
    $('seg-voice').classList.toggle('is-on', m === 'voice');
    $('btn-mode-grab').querySelector('i').textContent = MODE_COPY.grab[m];
    $('btn-mode-roar').querySelector('i').textContent = MODE_COPY.roar[m];
    // The look-alike-voices warning only matters when we're listening.
    $('voice-warn').hidden = m === 'tap' || RoarAudio.profileClash() <= 0.55;
  }

  function showCombo(i, mult) {
    var el = $('grab-combo-' + (i + 1));
    if (mult > 1) {
      el.hidden = false;
      el.textContent = 'x' + mult;
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    } else {
      el.hidden = true;
    }
  }

  /* ── countdown + play ─────────────────────────────────────── */

  // Two players share one screen, so say out loud who owns which end
  // before anything starts moving.
  function takeSides(then) {
    if (playerCount === 1) { countdown(then); return; }

    for (var i = 0; i < 2; i++) {
      $('side-photo-' + (i + 1)).src = players[i].photo;
      $('side-name-' + (i + 1)).textContent = players[i].name;
    }
    $('side-split-label').textContent = mode === 'grab'
      ? 'phone flat — sit facing each other'
      : 'hold the phone up between you';
    $('screen-sides').classList.toggle('is-lr', mode === 'roar');

    show('screen-sides');
    say(players[0].name + ', you are on this side. ' + players[1].name + ', you are on the other side.');
    pendingStart = then;
  }

  var pendingStart = null;

  var countdownTimer = null;

  function countdown(then) {
    clearTimeout(countdownTimer);
    show('screen-countdown');
    keepAwake();
    RoarAudio.resume();

    var seq = ['3', '2', '1', 'GO!'];
    var i = 0;

    (function step() {
      var a = $('countdown-num'), b = $('countdown-num-2');
      a.textContent = b.textContent = seq[i];
      a.classList.toggle('is-go', seq[i] === 'GO!');
      b.classList.toggle('is-go', seq[i] === 'GO!');
      a.classList.remove('pop'); b.classList.remove('pop');
      void a.offsetWidth;
      a.classList.add('pop'); b.classList.add('pop');
      RoarAudio.sfx(seq[i] === 'GO!' ? 'go' : 'tick');

      i++;
      countdownTimer = setTimeout(i < seq.length ? step : then, i < seq.length ? 700 : 450);
    })();
  }

  function playGrab() {
    stopEverything();
    mode = 'grab';
    $('grab-name-1').textContent = players[0].name;
    $('grab-name-2').textContent = players[1].name;
    $('grab-score-1').textContent = '0';
    $('grab-score-2').textContent = '0';
    $('grab-combo-1').hidden = true;
    $('grab-combo-2').hidden = true;
    $('grab-tap').hidden = inputMode !== 'tap';

    takeSides(function () {
      show('screen-grab');
      GrabGame.start({
        canvas: $('grab-canvas'),
        touchTarget: $('grab-tap'),
        inputMode: inputMode,
        players: active(),
        duration: 45,
        onScore: function (i, total, mult) {
          showCombo(i, mult);
          var el = $('grab-score-' + (i + 1));
          el.textContent = total;
          el.classList.remove('pop');
          void el.offsetWidth;
          el.classList.add('pop');
        },
        onLevel: function (n) { flash('LEVEL ' + n + '!'); },
        onEnd: finish
      });
    });
  }

  function playRoar() {
    stopEverything();
    mode = 'roar';
    for (var i = 0; i < 2; i++) {
      $('bar-photo-' + (i + 1)).src = players[i].photo;
      $('bar-name-' + (i + 1)).textContent = players[i].name;
    }
    $('roar-tap').hidden = inputMode !== 'tap';
    $('lane-2').hidden = playerCount === 1;
    takeSides(function () {
      show('screen-roar');
      RoarGame.start({
        duration: 20,
        inputMode: inputMode,
        touchTarget: $('roar-tap'),
        players: active(),
        onEnd: finish
      });
    });
  }

  function flash(text) {
    var el = $('grab-flash');
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
    setTimeout(function () { el.hidden = true; }, 1200);
  }

  /* ── the hot air balloon ──────────────────────────────────── */

  function startBalloon() {
    stopEverything();
    $('bl-end').hidden = true;
    $('bl-score').textContent = '0';
    show('screen-balloon');
    keepAwake();
    RoarAudio.resume();
    RoarAudio.releaseMic();       // the balloon never listens

    BalloonGame.start({
      canvas: $('balloon-canvas'),
      controls: $('bl-controls'),
      onScore: function (score) { $('bl-score').textContent = Math.round(score); }
    });
    say('The hot air balloon. A game by Sienna!');
  }

  function endBalloon() {
    var g = BalloonGame;
    var got = g.collected;
    g.stop();
    $('bl-end-score').textContent = Math.round(g.score);
    $('bl-end-tally').textContent =
      '🍎 ' + got.food + '   ☁️ ' + got.cloud + '   🦄 ' + got.unicorn +
      (got.alien ? '   👽 ' + got.alien : '') +
      (g.reachedSpace ? '   🚀 space' : '') +
      (g.landedOnce ? '   🌱 landed' : '');
    $('bl-end').hidden = false;
    Confetti.start(['#ffd24c', '#ff8a2b', '#e6b3ff', '#7ec8ff', '#ffffff']);
    RoarAudio.sfx('win');
  }

  on('bl-exit', function () {
    askQuit({
      emoji: '🎈',
      title: 'Finish the flight?',
      msg: 'You will land and see how you did.',
      stay: 'KEEP FLYING',
      leave: 'FINISH',
      loses: false,
      onLeave: endBalloon
    });
  });
  on('bl-again', function () { Confetti.stop(); startBalloon(); });
  on('bl-menu', function () {
    Confetti.stop();
    stopEverything();
    show('screen-games');
  });

  /* ── counting ─────────────────────────────────────────────── */

  function startCounting() {
    stopEverything();
    show('screen-counting');
    keepAwake();
    RoarAudio.releaseMic();       // counting never listens
    $('ct-warn').hidden = true;

    CountGame.start({
      els: {
        number: $('ct-number'), word: $('ct-word'), dots: $('ct-dots'),
        ring: $('ct-ring'), toggle: $('ct-toggle'),
        warn: $('ct-warn')
      }
    });
  }

  on('ct-toggle', function () { CountGame.toggle(); });
  on('ct-restart', function () { CountGame.restart(); });
  on('ct-voice-next', openVoices);
  on('btn-voice', openVoices);
  on('voice-done', function () { $('voice-sheet').hidden = true; });
  $('voice-sheet').addEventListener('click', function (e) {
    if (e.target === this) this.hidden = true;
  });

  /* The voices are the recorded ones now, not whatever the phone happens to
     have — so the picker lists those, and the choice applies to every game. */
  function openVoices() {
    var box = $('voice-list');
    box.innerHTML = '';

    if (!Say.packs.length) {
      box.innerHTML = '<p class="subheading">The voices are still loading — ' +
                      'try again in a moment.</p>';
    }
    Say.packs.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'voice-row' + (Say.pack && v.id === Say.pack.id ? ' is-on' : '');
      b.innerHTML = '<b>' + v.name + '</b><span>' + v.note + '</span>';
      b.addEventListener('click', function () {
        Say.setPack(v.id);
        showVoiceName();
        var rows = box.querySelectorAll('.voice-row');
        for (var k = 0; k < rows.length; k++) {
          rows[k].classList.toggle('is-on', rows[k] === b);
        }
        Say.sample();
      });
      box.appendChild(b);
    });
    $('voice-sheet').hidden = false;
  }

  // Wherever the current voice is named on screen, keep it true.
  function showVoiceName() {
    var name = Say.packName();
    ['home-voice', 'ct-voice-name'].forEach(function (id) {
      var e = $(id);
      if (e) e.textContent = name;
    });
  }
  Say.onready = showVoiceName;
  on('ct-exit', function () {
    askQuit({
      emoji: '🔢',
      title: 'Stop counting?',
      msg: 'It will start again from zero next time.',
      stay: 'KEEP COUNTING',
      leave: 'STOP',
      onLeave: function () {
        $('voice-sheet').hidden = true;
        stopEverything();
        show('screen-games');
      }
    });
  });

  /* ── Sienna's calculator ──────────────────────────────────── */

  function startCalc() {
    stopEverything();
    show('screen-calc');
    RoarAudio.releaseMic();
    CalcGame.start({
      els: { sum: $('cl-sum'), out: $('cl-out'), speak: $('cl-speak') }
    });
  }

  // One delegated listener rather than twenty, so a fast double-press on a
  // key can never leave a stray handler behind.
  $('cl-pad').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-k]') : null;
    if (b) CalcGame.press(b.getAttribute('data-k'));
  });

  on('cl-speak', function () { CalcGame.setSpeak(!CalcGame.speak); });
  on('cl-exit', function () {
    askQuit({
      emoji: '🧮',
      title: 'Close the calculator?',
      msg: 'The sum on the screen will be cleared.',
      stay: 'KEEP USING IT',
      leave: 'CLOSE',
      onLeave: function () { stopEverything(); show('screen-games'); }
    });
  });

  /* ── spelling bee ─────────────────────────────────────────── */

  function startSpell() {
    stopEverything();
    show('screen-spell');
    RoarAudio.releaseMic();      // it only ever speaks, it never listens
    keepAwake();
    SpellGame.start({
      els: {
        word: $('sp-word'), emoji: $('sp-emoji'), clue: $('sp-clue'),
        stars: $('sp-stars'), streak: $('sp-streak'), keys: $('sp-keys'),
        pad: $('sp-pad'), win: $('sp-win'), winWord: $('sp-win-word'),
        winStars: $('sp-win-stars'), winPraise: $('sp-win-praise'),
        build: $('sp-build'), stickers: $('sp-stickers'), winBuild: $('sp-win-build'),
        layout: $('sp-layout'), case: $('sp-case')
      }
    });
  }

  // One listener for all twenty-six letters.
  $('sp-keys').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-l]') : null;
    if (b) SpellGame.guess(b.getAttribute('data-l'));
  });

  on('sp-hear', function () { SpellGame.hear(); });
  on('sp-spell', function () { SpellGame.spellOut(); });
  on('sp-hint', function () { SpellGame.hint(); });
  on('sp-next', function () { SpellGame.next(); });
  on('sp-layout', function () { SpellGame.toggleLayout(); });
  on('sp-case', function () { SpellGame.toggleCase(); });
  on('sp-exit', function () {
    askQuit({
      emoji: '🐝',
      title: 'Stop spelling?',
      msg: 'You will keep your stars for next time... but the words start again.',
      stay: 'KEEP SPELLING',
      leave: 'STOP',
      onLeave: function () { stopEverything(); show('screen-games'); }
    });
  });

  /* ── what's the time? ─────────────────────────────────────── */

  function startClock() {
    stopEverything();
    show('screen-clock');
    RoarAudio.releaseMic();
    keepAwake();
    ClockGame.start({
      els: {
        canvas: $('ck-canvas'), clockWrap: $('ck-clockwrap'),
        ask: $('ck-ask'), digital: $('ck-digital'), inWords: $('ck-inwords'),
        digitalWrap: document.querySelector('.ck-digital-wrap'),
        options: $('ck-options'), teach: $('ck-teach'), ring: $('ck-ring'),
        stars: $('ck-stars'), streak: $('ck-streak'), level: $('ck-level'),
        tell: $('ck-tell'),
        win: $('ck-win'), winStars: $('ck-win-stars'), winTime: $('ck-win-time'),
        winDigital: $('ck-win-digital'), winLevel: $('ck-win-level')
      }
    });
  }

  $('ck-options').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-i]') : null;
    if (b) ClockGame.choose(+b.getAttribute('data-i'));
  });

  on('ck-hear', function () { ClockGame.hear(); });
  on('ck-tell', function () { ClockGame.tell(); });
  on('ck-ring', function () { ClockGame.toggleMinutes(); });
  on('ck-next', function () { ClockGame.next(); });

  function clockMode(play) {
    $('ck-mode-quiz').classList.toggle('is-on', !play);
    $('ck-mode-play').classList.toggle('is-on', play);
    // Nothing to answer in hands-on mode, so the clock takes the whole screen.
    $('screen-clock').classList.toggle('is-play', play);
    ClockGame.setPlay(play);
  }
  on('ck-mode-quiz', function () { clockMode(false); });
  on('ck-mode-play', function () { clockMode(true); });
  on('ck-exit', function () {
    askQuit({
      emoji: '🕐',
      title: 'Stop learning the time?',
      msg: 'You can come back and carry on whenever you like.',
      stay: 'KEEP GOING',
      leave: 'STOP',
      onLeave: function () { stopEverything(); show('screen-games'); }
    });
  });

  /* ── results ──────────────────────────────────────────────── */

  function finish(scores) {
    if (playerCount === 1) { finishSolo(scores[0]); return; }
    var tie = scores[0] === scores[1];
    var w = scores[0] >= scores[1] ? 0 : 1;
    var winner = players[w];

    $('winner-photo').src = winner.photo;
    $('winner-photo').style.borderColor = winner.color;

    if (tie) {
      $('winner-photo').src = players[0].photo;
      $('winner-name').textContent = "IT'S A TIE!";
      $('winner-line').textContent = 'Two mighty beasts! 🦁🐯';
    } else {
      $('winner-name').textContent = winner.name;
      $('winner-line').textContent = mode === 'grab' ? 'is the FASTEST GRABBER!' : 'is the LOUDEST BEAST!';
    }

    if (!tie) series[w]++;
    roundsPlayed++;
    var sEl = $('series');
    if (roundsPlayed > 1) {
      sEl.hidden = false;
      sEl.innerHTML = '<b>' + series[0] + '</b> &ndash; <b>' + series[1] + '</b><span>rounds won</span>';
    } else {
      sEl.hidden = true;
    }

    $('final-1').hidden = false;
    $('final-2').hidden = false;
    $('final-name-1').textContent = players[0].name;
    $('final-name-2').textContent = players[1].name;
    $('final-score-1').textContent = scores[0];
    $('final-score-2').textContent = scores[1];

    show('screen-result');
    Confetti.start([SKINS[0].color, SKINS[0].glow, SKINS[1].color, SKINS[1].glow, '#ffffff']);
    RoarAudio.sfx('win');
    if (!tie) setTimeout(function () { RoarAudio.playVoiceOnce(w, 1); }, 520);
    say(tie ? "It's a tie!" : winner.name + ' wins!');
  }

  function finishSolo(score) {
    var beaten = score > best;
    if (beaten) best = score;

    $('winner-photo').src = players[0].photo;
    $('winner-photo').style.borderColor = players[0].color;
    $('winner-name').textContent = score;
    $('winner-line').textContent = beaten ? 'NEW BEST SCORE! 🎉' : 'Best so far: ' + best;

    $('series').hidden = true;
    $('final-1').hidden = false;
    $('final-2').hidden = true;
    $('final-name-1').textContent = players[0].name;
    $('final-score-1').textContent = score;

    show('screen-result');
    Confetti.start([SKINS[0].color, SKINS[0].glow, '#ffffff', '#9df08a']);
    RoarAudio.sfx('win');
    if (beaten) setTimeout(function () { RoarAudio.playVoiceOnce(0, 1); }, 520);
    say(beaten ? 'New best score!' : 'You scored ' + score);
  }

  function leaveResult() {
    Confetti.stop();
  }

  /* ── wiring ───────────────────────────────────────────────── */

  on('btn-begin', function () {
    RoarAudio.resume();          // unlock audio on the first real gesture
    pendingGame = null;
    show('screen-count');
  });

  on('btn-games', function () { RoarAudio.resume(); show('screen-games'); });
  on('btn-games-back', function () { stopEverything(); show('screen-splash'); });

  // Picking from the list remembers the choice and skips the mode screen.
  // Leaving mid-round drops you back on the mode screen rather than all the
  // way out, so the players stay set up and another go is one tap away.
  function quitToModes() {
    askQuit({
      emoji: '👋',
      title: 'Leave the game?',
      msg: "This round won't count.",
      leave: 'LEAVE',
      onLeave: function () { stopEverything(); toModes(); }
    });
  }

  on('grab-exit', quitToModes);
  on('roar-exit', quitToModes);


  on('count-1', function () { playerCount = 1; show('screen-how'); });
  on('count-2', function () { playerCount = 2; show('screen-how'); });

  on('how-tap', function () { setInputMode('tap'); askMic(); });
  on('how-voice', function () { setInputMode('voice'); askMic(); });

  on('btn-sound', function () { setSound(RoarAudio.muted); });

  function askMic() {
    show('screen-mic');
    $('btn-mic-retry').hidden = true;
    $('mic-title').textContent = 'Can we use the microphone?';
    $('mic-msg').innerHTML = 'Tap <b>Allow</b> so we can hear your mighty roars!';

    RoarAudio.init().then(function () {
      $('mic-emoji').textContent = '👂';
      $('mic-title').textContent = 'Great!';
      $('mic-msg').innerHTML = 'Everybody be quiet for a second…';
      $('mic-listening').hidden = false;
      return RoarAudio.measureAmbient(1100);
    }).then(function () {
      $('mic-listening').hidden = true;
      startSetup(0);
    }).catch(function (err) {
      $('mic-emoji').textContent = '🙉';
      $('mic-title').textContent = 'We need the microphone';
      $('mic-msg').innerHTML = err && err.message === 'unsupported'
        ? 'This browser can\'t hear us. Try <b>Safari</b> or <b>Chrome</b> on your phone.'
        : 'The game is all about roaring, so we need to listen!<br />Open <b>Settings → Safari → Microphone</b> and allow it, then try again.';
      $('mic-listening').hidden = true;
      $('btn-mic-retry').hidden = false;
    });
  }

  on('btn-mic-retry', askMic);

  $('photo-input').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    squarePhoto(file).then(setPhoto).catch(function () {
      alert("We couldn't open that picture. Try another one!");
    });
  });

  on('btn-surprise', openAnimals);
  on('btn-animal-cancel', closeAnimals);
  $('animal-sheet').addEventListener('click', function (e) {
    if (e.target === this) closeAnimals();     // tap the backdrop to dismiss
  });
  buildAnimalGrid();

  on('btn-photo-next', toVoiceStep);
  on('btn-record', doRecord);
  on('btn-rerecord', doRecord);
  on('btn-hear', hearMyself);
  on('btn-voice-next', afterVoice);

  on('seg-tap', function () { setInputMode('tap'); applyMicPolicy(); });
  on('seg-voice', function () {
    setInputMode('voice');
    applyMicPolicy().then(function (ok) {
      if (ok) return;
      setInputMode('tap');
      alert("We couldn't get the microphone back, so let's stay on TAP.");
    });
  });

  on('btn-sides-ready', function () {
    var go = pendingStart;
    pendingStart = null;
    if (go) countdown(go);
  });

  on('btn-mode-grab', playGrab);
  on('btn-mode-roar', playRoar);

  on('btn-redo-voices', function () {
    RoarAudio.profiles = [null, null];
    startSetup(0, true);
  });

  on('btn-again', function () {
    leaveResult();
    if (mode === 'grab') playGrab(); else playRoar();
  });

  on('btn-pick-mode', function () { leaveResult(); toModes(); });

  on('btn-new-players', function () {
    leaveResult();
    redoingVoices = false;
    series = [0, 0];
    roundsPlayed = 0;
    best = 0;
    players = [newPlayer(0), newPlayer(1)];
    RoarAudio.profiles = [null, null];
    startSetup(0);
  });

  // Keep the page pinned: no rubber-band scrolling or double-tap zoom mid-roar.
  document.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopEverything();
    }
  });

  // The tiles are the first thing on screen, so they are built before anything
  // else can be tapped.
  buildTiles();
  Say.init();

  /* ── which build am I running? ────────────────────────────────
     The deploy stamps the commit into <meta name="build">, and every script
     and stylesheet is fetched with that same ?v=, so a fresh deploy can never
     be half-cached. This little tag on the splash says which one is loaded;
     tapping it forces a reload past whatever Safari is holding on to. */
  (function buildTag() {
    var meta = document.querySelector('meta[name="build"]');
    var build = (meta && meta.content) || 'dev';
    var tag = document.getElementById('build-tag');
    if (!tag) return;
    tag.textContent = build === 'dev' ? 'local build' : 'build ' + build;
    tag.addEventListener('click', function () {
      var u = location.href.split('#')[0].split('?')[0];
      location.replace(u + '?fresh=' + Date.now());
    });
  })();
})();
