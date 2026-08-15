/*
 * app.js — screen flow: splash → mic → photo + voice for each player →
 * pick a game → countdown → play → results.
 */
(function () {
  'use strict';

  var RECORD_MS = 2500;
  // Ten to choose from, for players who would rather not use a photo.
  var ANIMALS = [
    { emoji: '🐰', name: 'Rabbit' },
    { emoji: '🐮', name: 'Cow' },
    { emoji: '🦁', name: 'Lion' },
    { emoji: '🦒', name: 'Giraffe' },
    { emoji: '🦭', name: 'Seal' },
    { emoji: '🐧', name: 'Penguin' },
    { emoji: '🦈', name: 'Shark' },
    { emoji: '🐯', name: 'Tiger' },
    { emoji: '🐘', name: 'Elephant' },
    { emoji: '🦖', name: 'Dino' }
  ];

  var SKINS = [
    { color: '#ff8a2b', glow: '#ffd24c', emoji: '🦁' },
    { color: '#31d8ff', glow: '#a78bfa', emoji: '🐯' }
  ];

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
      emoji: SKINS[i].emoji
    };
  }

  function $(id) { return document.getElementById(id); }
  function on(id, fn) { var e = $(id); if (e) e.addEventListener('click', fn); }

  /* ── screens ──────────────────────────────────────────────── */

  function show(id) {
    var all = document.querySelectorAll('.screen');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('is-active');
    $(id).classList.add('is-active');
  }

  function say(text) {
    try {
      if (!window.speechSynthesis) return;
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0; u.pitch = 1.25; u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch (e) { /* speech is a bonus, never a requirement */ }
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

  // Waits for fonts, otherwise the emoji can bake into the canvas as a blank.
  function animalPhoto(emoji, skin) {
    var ready = (document.fonts && document.fonts.ready) || Promise.resolve();
    return Promise.resolve(ready).then(function () {
      var S = 320;
      var cv = document.createElement('canvas');
      cv.width = cv.height = S;
      var c = cv.getContext('2d');
      var g = c.createLinearGradient(0, 0, S, S);
      g.addColorStop(0, skin.glow);
      g.addColorStop(1, skin.color);
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);
      c.font = '210px system-ui';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(emoji, S / 2, S / 2 + 12);
      return cv.toDataURL('image/png');
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
      b.innerHTML = '<span class="animal-face">' + a.emoji + '</span>' +
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
    sheet.hidden = false;
  }

  function closeAnimals() { $('animal-sheet').hidden = true; }

  function pickAnimal(a) {
    players[current].emoji = a.emoji;
    // A kid who cannot type yet still ends up with a name they chose.
    var nameEl = $('name-input');
    if (!nameEl.value.trim()) nameEl.value = a.name;
    animalPhoto(a.emoji, SKINS[current]).then(setPhoto);
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
    if (current === 0) { startSetup(1, redoingVoices); return; }
    redoingVoices = false;
    toModes();
  }

  /* ── mode picker ──────────────────────────────────────────── */

  function toModes() {
    for (var i = 0; i < 2; i++) {
      $('vs-photo-' + (i + 1)).src = players[i].photo;
      $('vs-name-' + (i + 1)).textContent = players[i].name;
    }

    $('voice-warn').innerHTML = '⚠️ In <b>SHOUT</b> mode your two sounds are <b>very</b> alike, ' +
      'so we might mix you up. Either use <b>TAP</b>, or re-record with really different sounds — ' +
      'one high MEOW, one deep ROAR.';

    applyMicPolicy();
    setInputMode(inputMode);
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

  function countdown(then) {
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
      setTimeout(i < seq.length ? step : then, i < seq.length ? 700 : 450);
    })();
  }

  function playGrab() {
    mode = 'grab';
    $('grab-name-1').textContent = players[0].name;
    $('grab-name-2').textContent = players[1].name;
    $('grab-score-1').textContent = '0';
    $('grab-score-2').textContent = '0';
    $('grab-combo-1').hidden = true;
    $('grab-combo-2').hidden = true;
    $('grab-tap').hidden = inputMode !== 'tap';

    countdown(function () {
      show('screen-grab');
      GrabGame.start({
        canvas: $('grab-canvas'),
        touchTarget: $('grab-tap'),
        inputMode: inputMode,
        players: players,
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
    mode = 'roar';
    for (var i = 0; i < 2; i++) {
      $('bar-photo-' + (i + 1)).src = players[i].photo;
      $('bar-name-' + (i + 1)).textContent = players[i].name;
    }
    $('roar-tap').hidden = inputMode !== 'tap';
    countdown(function () {
      show('screen-roar');
      RoarGame.start({
        duration: 20,
        inputMode: inputMode,
        touchTarget: $('roar-tap'),
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

  /* ── results ──────────────────────────────────────────────── */

  function finish(scores) {
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

  function leaveResult() {
    Confetti.stop();
  }

  /* ── wiring ───────────────────────────────────────────────── */

  on('btn-begin', function () {
    RoarAudio.resume();          // unlock audio on the first real gesture
    show('screen-how');
  });

  on('how-tap', function () { setInputMode('tap'); askMic(); });
  on('how-voice', function () { setInputMode('voice'); askMic(); });

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
      if (GrabGame.running) GrabGame.stop();
      if (RoarGame.running) RoarGame.stop();
      RoarAudio.stopAllVoices();
    }
  });
})();
