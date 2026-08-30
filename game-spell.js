/*
 * game-spell.js — "SPELLING BEE"
 *                  a spelling game for Sienna 🦄
 *
 * Hangman's shape without hangman's punishment. A word appears with most of it
 * already filled in — always the first letter, and never fewer than 60% of the
 * letters — and the job is working out the few that are missing.
 *
 * Nothing is ever lost. There is no man to hang, no lives to run out and no way
 * to fail a word: a wrong letter wobbles and says try again, and that is all.
 * Everything that goes right, however, is celebrated loudly — a pop and a
 * sparkle per letter, a rising run of notes as the word fills up, confetti and
 * stars and a "well done!" at the end. The reward is the whole point.
 */
(function (global) {
  'use strict';

  /* Words a five or six year old can read, with a picture and a clue for each.
     The longest is CHRISTMAS, which is as big as Sienna spells. Sorted into
     bands so a session can start small and grow. */
  var BANDS = [
    [ // 3 letters
      ['cat', '🐱', 'It says meow and has whiskers'],
      ['dog', '🐶', 'It says woof and wags its tail'],
      ['sun', '☀️', 'It is hot and yellow in the sky'],
      ['bus', '🚌', 'A big one takes you to school'],
      ['cow', '🐮', 'It says moo and gives us milk'],
      ['pig', '🐷', 'It is pink and says oink'],
      ['bee', '🐝', 'It buzzes and makes honey'],
      ['fox', '🦊', 'An orange animal with a bushy tail'],
      ['owl', '🦉', 'A bird that says twit twoo at night'],
      ['egg', '🥚', 'A chicken lays one of these'],
      ['hat', '🎩', 'You wear it on your head'],
      ['cup', '☕', 'You drink out of it'],
      ['bed', '🛏️', 'You sleep in it'],
      ['key', '🔑', 'It opens a door']
    ],
    [ // 4 letters
      ['fish', '🐟', 'It swims and has fins'],
      ['cake', '🎂', 'You eat it on your birthday'],
      ['star', '⭐', 'It twinkles in the night sky'],
      ['moon', '🌙', 'It shines at night and is round'],
      ['tree', '🌳', 'It is tall and green with leaves'],
      ['frog', '🐸', 'It is green and hops'],
      ['book', '📚', 'You read it at bedtime'],
      ['duck', '🦆', 'It says quack and likes ponds'],
      ['bear', '🐻', 'A big furry animal that likes honey'],
      ['milk', '🥛', 'A white drink from a cow'],
      ['ball', '⚽', 'You kick it or throw it'],
      ['rain', '🌧️', 'Water falling from the clouds'],
      ['snow', '❄️', 'White and cold, you build with it'],
      ['lion', '🦁', 'The king of the jungle, it roars'],
      ['shoe', '👟', 'You put it on your foot'],
      ['bird', '🐦', 'It has wings and sings']
    ],
    [ // 5 letters
      ['apple', '🍎', 'A red fruit that grows on a tree'],
      ['house', '🏠', 'You live in one'],
      ['horse', '🐴', 'You can ride it, it says neigh'],
      ['sheep', '🐑', 'Woolly and says baa'],
      ['bread', '🍞', 'You make toast out of it'],
      ['water', '💧', 'You drink it and it has no colour'],
      ['happy', '😊', 'How you feel when you smile'],
      ['chair', '🪑', 'You sit on it'],
      ['cloud', '☁️', 'White and fluffy in the sky'],
      ['green', '💚', 'The colour of grass'],
      ['mouse', '🐭', 'A tiny animal that likes cheese'],
      ['teeth', '🦷', 'You brush them every night'],
      ['train', '🚂', 'It runs along a track, choo choo'],
      ['beach', '🏖️', 'Sand and sea, where you build castles'],
      ['queen', '👑', 'She wears a crown'],
      ['smile', '🙂', 'What your mouth does when you are happy']
    ],
    [ // 6 letters
      ['rabbit', '🐰', 'It hops and loves carrots'],
      ['garden', '🌷', 'Outside, where flowers grow'],
      ['monkey', '🐵', 'It swings in trees and likes bananas'],
      ['yellow', '💛', 'The colour of the sun'],
      ['orange', '🍊', 'A fruit and a colour'],
      ['purple', '💜', 'The colour you get mixing red and blue'],
      ['flower', '🌸', 'It grows in the garden and smells lovely'],
      ['banana', '🍌', 'A long yellow fruit you peel'],
      ['dragon', '🐉', 'A big one breathes fire in stories'],
      ['castle', '🏰', 'Where a king and queen live'],
      ['pencil', '✏️', 'You write and draw with it'],
      ['spider', '🕷️', 'It has eight legs and spins a web'],
      ['turtle', '🐢', 'It walks slowly and carries its house'],
      ['winter', '⛄', 'The cold season when it snows'],
      ['school', '🏫', 'Where you go to learn'],
      ['sister', '👧', 'A girl in your family']
    ],
    [ // 7 letters
      ['penguin', '🐧', 'A black and white bird that cannot fly'],
      ['giraffe', '🦒', 'It has the longest neck of all'],
      ['rainbow', '🌈', 'Colours in the sky after the rain'],
      ['dolphin', '🐬', 'A clever animal that swims and squeaks'],
      ['kitchen', '🍳', 'The room where you cook'],
      ['chicken', '🐔', 'It clucks and lays eggs'],
      ['brother', '👦', 'A boy in your family'],
      ['morning', '🌅', 'The start of the day'],
      ['blanket', '🛌', 'It keeps you warm in bed'],
      ['cupcake', '🧁', 'A little cake with icing on top'],
      ['balloon', '🎈', 'You blow it up and it floats away']
    ],
    [ // 8–9 letters
      ['elephant', '🐘', 'The biggest animal, with a long trunk'],
      ['birthday', '🎁', 'The day you get cake and presents'],
      ['sandwich', '🥪', 'Two bits of bread with a filling'],
      ['princess', '👸', 'A king and queen’s daughter'],
      ['football', '⚽', 'A game you play with your feet'],
      ['mountain', '⛰️', 'A very big hill you can climb'],
      ['dinosaur', '🦕', 'A huge animal from long, long ago'],
      ['umbrella', '☂️', 'It keeps the rain off you'],
      ['kangaroo', '🦘', 'It hops and keeps its baby in a pocket'],
      ['Christmas', '🎄', 'The day with a tree and presents'],
      ['butterfly', '🦋', 'It was a caterpillar first'],
      ['chocolate', '🍫', 'Brown and sweet, it melts in your mouth'],
      ['crocodile', '🐊', 'A big green snappy one lives in rivers'],
      ['pineapple', '🍍', 'A spiky fruit with a leafy top']
    ]
  ];

  /* Two keyboards. ABC is the one a five year old can actually find a letter
     on; QWERTY is the one she will type on for the rest of her life, and the
     habit is worth forming early. The choice is remembered between visits. */
  var LAYOUTS = {
    qwerty: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
    abc:    ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ']
  };
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  function saved(key, fallback) {
    try { var v = localStorage.getItem('spell.' + key); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem('spell.' + key, value); } catch (e) {}
  }

  // Cat, not CAT: a capital to start and the rest in lower case, which is how
  // the word is actually written down.
  function proper(w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }
  var VISIBLE = 0.6;          // at least this much of every word is given
  var PRAISE = ['Well done!', 'Brilliant!', 'You got it!', 'Superstar!',
                'Amazing!', 'Perfect!', 'Clever girl!'];

  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  var SpellGame = {
    running: false,

    start: function (cfg) {
      this.el = cfg.els;
      this.running = true;

      this.stars = 0;
      this.streak = 0;
      this.best = 0;
      this.done = 0;
      this.band = 0;             // which length we are on
      this.queues = BANDS.map(shuffled);
      this.at = BANDS.map(function () { return 0; });

      this.layout = saved('layout', 'qwerty') === 'abc' ? 'abc' : 'qwerty';
      this.lower = saved('case', 'lower') !== 'upper';

      this._buildKeys();
      this._next();
      return this;
    },

    stop: function () {
      this.running = false;
      clearTimeout(this._spellT);
      clearTimeout(this._winT);
      try { speechSynthesis.cancel(); } catch (e) {}
      try { global.Confetti.stop(); } catch (e) {}
    },

    /* ── a word ───────────────────────────────────────────────── */

    _pick: function () {
      // Work up through the bands as words are finished, and never repeat one
      // until the whole band has been round.
      var b = Math.min(BANDS.length - 1, this.band);
      var q = this.queues[b];
      if (this.at[b] >= q.length) { this.queues[b] = shuffled(BANDS[b]); this.at[b] = 0; q = this.queues[b]; }
      return q[this.at[b]++];
    },

    _next: function () {
      var pick = this._pick();
      this.word = pick[0];
      this.emoji = pick[1];
      this.clue = pick[2];
      this.up = this.word.toUpperCase();     // for matching, always upper
      this.disp = proper(this.word);         // for reading, always Cat

      this.blanks = this._chooseBlanks(this.word.length);
      this.filled = [];
      this.cursor = this.blanks[0];
      this.wrong = 0;
      this.hints = 0;
      this.clueShown = false;
      this.won = false;

      this._render();
      this._say(this.word, 0.85);          // always hear it once to start
    },

    /* Which letters to hide. The first letter is always given, at least 60% of
       the word stays visible, and two blanks never sit side by side while there
       is any other choice — a gap in the middle of a word is much easier to
       read than a hole. */
    _chooseBlanks: function (n) {
      var hide = Math.max(1, n - Math.max(1, Math.ceil(n * VISIBLE)));
      var spots = [];
      for (var i = 1; i < n; i++) spots.push(i);
      spots = shuffled(spots);

      var out = [];
      for (var pass = 0; pass < 2 && out.length < hide; pass++) {
        for (var k = 0; k < spots.length && out.length < hide; k++) {
          var s = spots[k];
          if (out.indexOf(s) >= 0) continue;
          // first pass keeps them apart, second takes whatever is left
          if (pass === 0 && (out.indexOf(s - 1) >= 0 || out.indexOf(s + 1) >= 0)) continue;
          out.push(s);
        }
      }
      return out.sort(function (a, b) { return a - b; });
    },

    /* ── guessing ─────────────────────────────────────────────── */

    guess: function (letter) {
      if (!this.running || this.won) return;
      // Case never matters to the answer: 'a' and 'A' are the same letter to
      // a child, and the keyboard can be showing either.
      letter = String(letter).toUpperCase();
      var want = this.up.charAt(this.cursor);

      if (letter === want) {
        this.filled[this.cursor] = this.disp.charAt(this.cursor);
        this.lastGood = this.cursor;
        global.RoarAudio.sfx('spellgood');
        this._pop(this.cursor);
        this._advance();
      } else {
        this.wrong++;
        this.lastBad = letter;
        global.RoarAudio.sfx('spellbad');
        this._wobble(letter);
        // Three wrong guesses and the clue appears by itself — never let her
        // get stuck long enough to stop enjoying it.
        if (this.wrong % 3 === 0 && !this.clueShown) this.showClue();
      }
      this._render();
    },

    _advance: function () {
      for (var i = 0; i < this.blanks.length; i++) {
        var b = this.blanks[i];
        if (!this.filled[b]) { this.cursor = b; return; }
      }
      this._win();
    },

    _win: function () {
      var self = this;
      this.won = true;
      this.done++;
      this.streak++;
      if (this.streak > this.best) this.best = this.streak;

      // Three stars for a clean word, fewer if it needed help — but never none.
      var got = 3;
      if (this.wrong > 0 || this.hints > 1) got--;
      if (this.wrong > 3 || this.hints > 2) got--;
      this.lastStars = Math.max(1, got);
      this.stars += this.lastStars;

      // Longer words once a few have gone in cleanly.
      if (this.done % 3 === 0 && this.band < BANDS.length - 1) this.band++;

      global.RoarAudio.sfx('spellwin');
      try { global.Confetti.start(['#ffd24c', '#ff8a2b', '#e6b3ff', '#7ec8ff', '#9df08a', '#ffffff']); } catch (e) {}
      this._winT = setTimeout(function () { try { global.Confetti.stop(); } catch (e) {} }, 2600);

      var praise = PRAISE[(Math.random() * PRAISE.length) | 0];
      this.praise = praise;              // shown on the card as well as spoken,
      this._say(praise + ' ' + this.word, 0.85);   // so she reads it too
      this._render();
    },

    next: function () { if (this.running && this.won) { try { global.Confetti.stop(); } catch (e) {} this._next(); } },

    /* ── help ─────────────────────────────────────────────────── */

    hear: function () { this._say(this.word, 0.8); },

    // Letter by letter, with a beat between: "C — A — T".
    spellOut: function () {
      var self = this, i = 0;
      clearTimeout(this._spellT);
      var step = function () {
        if (!self.running || i >= self.up.length) {
          if (self.running) self._spellT = setTimeout(function () { self._say(self.word, 0.8); }, 500);
          return;
        }
        self._say(self.up.charAt(i), 0.7, true);
        i++;
        self._spellT = setTimeout(step, 750);
      };
      step();
    },

    showClue: function () {
      this.clueShown = true;
      this._render();
    },

    // First tap explains the word; after that it fills a letter in for her.
    hint: function () {
      if (!this.running || this.won) return;
      this.hints++;
      if (!this.clueShown) {
        this.showClue();
        this._say(this.clue, 0.9);
        global.RoarAudio.sfx('spellhint');
        return;
      }
      var letter = this.up.charAt(this.cursor);
      this.filled[this.cursor] = this.disp.charAt(this.cursor);
      global.RoarAudio.sfx('spellhint');
      this._pop(this.cursor);
      this._say(letter, 0.7, true);
      this._advance();
      this._render();
    },

    /* ── voice ────────────────────────────────────────────────── */

    _say: function (text, rate, spellingOut) {
      if (global.RoarAudio.muted) return;
      try {
        if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) return;
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(String(text));
        u.rate = rate || 0.85;
        // A single letter read at normal pitch can sound like a different one;
        // a touch higher and slower is much clearer to a child.
        u.pitch = spellingOut ? 1.15 : 1.05;
        u.volume = 1;
        // Choosing a nicer voice is a bonus, never a requirement: if the
        // assignment is rejected we still want the word said in the default
        // voice rather than silence.
        try { var v = this._voice(); if (v) u.voice = v; } catch (e2) {}
        speechSynthesis.speak(u);
      } catch (e) {}
    },

    _voice: function () {
      if (this._v !== undefined) return this._v;
      this._v = null;
      try {
        var list = speechSynthesis.getVoices() || [];
        var best = -1;
        for (var i = 0; i < list.length; i++) {
          var v = list[i];
          if (!/^en/i.test(v.lang || '')) continue;
          var s = 0;
          if (/enhanced|premium/i.test(v.name)) s += 5;
          if (/en-GB/i.test(v.lang)) s += 2;
          if (/samantha|karen|serena|kate|martha|moira|fiona/i.test(v.name)) s += 2;
          if (/zarvox|trinoids|albert|bells|bubbles|jester|organ|superstar|whisper|wobble|bahh|boing|good news|bad news/i.test(v.name)) s -= 20;
          if (s > best) { best = s; this._v = v; }
        }
      } catch (e) {}
      return this._v;
    },

    /* ── screen ───────────────────────────────────────────────── */

    _buildKeys: function () {
      var pad = this.el.keys;
      if (!pad) return;
      var rows = LAYOUTS[this.layout] || LAYOUTS.abc;
      var html = '';
      for (var r = 0; r < rows.length; r++) {
        html += '<div class="sp-row">';
        for (var i = 0; i < rows[r].length; i++) {
          var L = rows[r].charAt(i);
          // data-l stays upper case whatever is printed on the key, so the
          // matching never has to care which case is showing.
          html += '<button class="sp-key" type="button" data-l="' + L + '">' +
                  (this.lower ? L.toLowerCase() : L) + '</button>';
        }
        html += '</div>';
      }
      pad.innerHTML = html;
      this._labelToggles();
    },

    setLayout: function (which) {
      this.layout = which === 'abc' ? 'abc' : 'qwerty';
      save('layout', this.layout);
      this._buildKeys();
      this._render();
      global.RoarAudio.sfx('spellhint');
    },

    toggleLayout: function () { this.setLayout(this.layout === 'abc' ? 'qwerty' : 'abc'); },

    toggleCase: function () {
      this.lower = !this.lower;
      save('case', this.lower ? 'lower' : 'upper');
      this._buildKeys();
      this._render();
      global.RoarAudio.sfx('spellhint');
    },

    _labelToggles: function () {
      var e = this.el;
      if (!e) return;
      if (e.layout) {
        e.layout.textContent = this.layout === 'abc' ? '⌨️ abc' : '⌨️ qwerty';
        e.layout.setAttribute('aria-label',
          this.layout === 'abc' ? 'A to Z keyboard, tap for QWERTY' : 'QWERTY keyboard, tap for A to Z');
      }
      if (e.case) {
        e.case.textContent = this.lower ? 'a → A' : 'A → a';
        e.case.setAttribute('aria-label',
          this.lower ? 'Small letters, tap for capitals' : 'Capital letters, tap for small');
      }
    },

    _pop: function (i) { this.popAt = i; this.popT = Date.now(); },
    _wobble: function (l) { this.badAt = l; this.badT = Date.now(); },

    _render: function () {
      var e = this.el;
      if (!e) return;
      var i, html = '';

      for (i = 0; i < this.disp.length; i++) {
        var isBlank = this.blanks.indexOf(i) >= 0;
        var got = this.filled[i];
        var cls = 'sp-tile';
        if (!isBlank) cls += ' is-given';
        else if (got) cls += ' is-filled';
        else if (i === this.cursor && !this.won) cls += ' is-next';
        else cls += ' is-blank';
        if (this.popAt === i && Date.now() - this.popT < 500) cls += ' is-pop';
        // Always the written form — capital to start, small letters after —
        // whichever case the keyboard happens to be showing.
        html += '<span class="' + cls + '">' + ((!isBlank || got) ? this.disp.charAt(i) : '') + '</span>';
      }
      if (e.word) {
        // Fit the whole word across one line, however long it is: CHRISTMAS
        // gets smaller tiles than CAT rather than wrapping onto a second row.
        var n = this.disp.length;
        var room = e.word.clientWidth || 340;
        var size = Math.max(20, Math.min(46, Math.floor((room - (n - 1) * 5) / n)));
        e.word.style.setProperty('--tile', size + 'px');
        e.word.innerHTML = html;
      }
      if (e.emoji) e.emoji.textContent = this.emoji;

      if (e.clue) {
        e.clue.textContent = this.clueShown ? this.clue : 'What letters are missing?';
        e.clue.classList.toggle('is-clue', this.clueShown);
      }

      if (e.stars) e.stars.textContent = '⭐ ' + this.stars;
      if (e.streak) {
        e.streak.textContent = this.streak > 1 ? '🔥 ' + this.streak + ' in a row' : '';
        e.streak.hidden = this.streak < 2;
      }

      // the letter keys, now spread over rows
      if (e.keys) {
        var kids = e.keys.querySelectorAll('.sp-key');
        var bad = (this.badAt && Date.now() - this.badT < 450) ? this.badAt : null;
        for (i = 0; i < kids.length; i++) {
          kids[i].classList.toggle('is-wrong', kids[i].getAttribute('data-l') === bad);
          kids[i].disabled = !!this.won;
        }
      }
      this._labelToggles();

      if (e.win) {
        e.win.hidden = !this.won;
        if (this.won && e.winWord) {
          e.winWord.textContent = this.disp;
          e.winStars.textContent = '⭐'.repeat(this.lastStars);
          if (e.winPraise) e.winPraise.textContent = this.praise;
        }
      }
      if (e.pad) e.pad.hidden = !!this.won;
    }
  };

  SpellGame.WORDS = BANDS;      // exposed for testing
  global.SpellGame = SpellGame;
})(window);
