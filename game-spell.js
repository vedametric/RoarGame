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

  /* The words live in spell-words.js: 360 of them, banded by length, each with
     a picture and a clue. Kept separate because it is data, not game, and
     because tools/phrases.js reads it to work out what audio to record. */
  var BANDS = global.SpellWords;

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
  /* Something to build. Five right words finishes one, which is near enough to
     see coming but far enough to be worth wanting; each finished one is kept
     as a sticker she can look at. */
  var BUILDS = [
    { name: 'a rocket',   top: '🚀', colour: '#ff8a2b' },
    { name: 'a castle',   top: '🏰', colour: '#7ec8ff' },
    { name: 'a unicorn',  top: '🦄', colour: '#e6b3ff' },
    { name: 'a rainbow',  top: '🌈', colour: '#9df08a' },
    { name: 'a dinosaur', top: '🦕', colour: '#ffd24c' },
    { name: 'a pirate ship', top: '🏴‍☠️', colour: '#ff8a8a' },
    { name: 'a birthday cake', top: '🎂', colour: '#ffb3f0' },
    { name: 'a spaceship', top: '🛸', colour: '#a78bfa' }
  ];
  var PER_BUILD = 5;          // right words to finish one

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
      this.built = 0;                     // parts of the current build
      this.buildAt = 0;                   // which one she is on
      this.stickers = this._loadStickers();
      this.finished = null;               // the build just completed, for the card
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
      global.Say.stop();
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
      global.Say.line(this._key('w', this.word), this.word);   // hear it once to start
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

      // Any gap it fits, not only the one we happen to be pointing at. A child
      // reads the whole word and taps the letter she has spotted, which may
      // belong to the second gap — marking that wrong is just unfair.
      var at = this._gapFor(letter);

      if (at >= 0) {
        this.filled[at] = this.disp.charAt(at);
        this.lastGood = at;
        global.RoarAudio.sfx('spellgood');
        this._pop(at);
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

    // The gap this letter would fill: the one she is on if it fits there,
    // otherwise the leftmost empty one it fits, or -1 if it fits none.
    _gapFor: function (letter) {
      if (!this.filled[this.cursor] && this.up.charAt(this.cursor) === letter) {
        return this.cursor;
      }
      for (var i = 0; i < this.blanks.length; i++) {
        var b = this.blanks[i];
        if (!this.filled[b] && this.up.charAt(b) === letter) return b;
      }
      return -1;
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

      // Another piece of whatever is being built, and every fifth one finishes
      // it: a bigger noise, longer confetti, and a sticker to keep.
      this.built++;
      this.finished = null;
      if (this.built >= PER_BUILD) {
        this.built = 0;
        this.finished = BUILDS[this.buildAt % BUILDS.length];
        this.stickers.push(this.finished.top);
        this._saveStickers();
        this.buildAt++;
        this.stars += 5;                  // the checkpoint is worth something
      }

      global.RoarAudio.sfx(this.finished ? 'checkpoint' : 'spellwin');
      try {
        global.Confetti.start(this.finished
          ? ['#ffd24c', '#ff8a2b', '#e6b3ff', '#7ec8ff', '#9df08a', '#ffb3f0', '#ffffff']
          : ['#ffd24c', '#ff8a2b', '#e6b3ff', '#7ec8ff', '#9df08a', '#ffffff']);
      } catch (e) {}
      var stop = this.finished ? 4200 : 2600;
      this._winT = setTimeout(function () { try { global.Confetti.stop(); } catch (e) {} }, stop);

      var pi = (Math.random() * PRAISE.length) | 0;
      this.praise = PRAISE[pi];          // shown on the card as well as spoken,
      global.Say.line(['p-' + pi, this._key('w', this.word)],   // so she reads it too
                      this.praise + ' ' + this.word);
      this._render();
    },

    next: function () { if (this.running && this.won) { try { global.Confetti.stop(); } catch (e) {} this._next(); } },

    /* ── help ─────────────────────────────────────────────────── */

    hear: function () { global.Say.line(this._key('w', this.word), this.word); },

    // Letter by letter, with a beat between: "C — A — T".
    spellOut: function () {
      var self = this, i = 0;
      clearTimeout(this._spellT);
      var step = function () {
        if (!self.running || i >= self.up.length) {
          if (self.running) self._spellT = setTimeout(function () {
            global.Say.line(self._key('w', self.word), self.word);
          }, 500);
          return;
        }
        global.Say.line('l-' + self.up.charAt(i).toLowerCase(), self.up.charAt(i));
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
        global.Say.line(this._key('c', this.word), this.clue);
        global.RoarAudio.sfx('spellhint');
        return;
      }
      var letter = this.up.charAt(this.cursor);
      this.filled[this.cursor] = this.disp.charAt(this.cursor);
      global.RoarAudio.sfx('spellhint');
      this._pop(this.cursor);
      global.Say.line('l-' + letter.toLowerCase(), letter);
      this._advance();
      this._render();
    },

    /* ── voice ────────────────────────────────────────────────── */

    // Everything here has a recorded clip; Say falls back to the browser voice
    // on its own if one is ever missing.
    _say: function (text, rate, spellingOut) {
      global.Say.speak(text, { rate: rate || 0.9, pitch: spellingOut ? 1.15 : 1.1 });
    },

    _key: function (kind, of) { return kind + '-' + String(of).toLowerCase(); },


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

    _loadStickers: function () {
      try { return JSON.parse(saved('stickers', '[]')) || []; } catch (e) { return []; }
    },
    _saveStickers: function () {
      // Keep the last two rows' worth; a hundred of them would only shrink.
      if (this.stickers.length > 24) this.stickers = this.stickers.slice(-24);
      try { save('stickers', JSON.stringify(this.stickers)); } catch (e) {}
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

      // the build strip: five blocks that grow, then the thing itself
      if (e.build) {
        var b = BUILDS[this.buildAt % BUILDS.length];
        var bits = '';
        for (i = 0; i < PER_BUILD; i++) {
          bits += '<i class="sp-brick' + (i < this.built ? ' is-on' : '') + '"' +
                  ' style="--h:' + (34 + i * 9) + '%;--c:' + b.colour + '"></i>';
        }
        e.build.innerHTML =
          '<span class="sp-build-what">building ' + b.name + '</span>' +
          '<span class="sp-bricks">' + bits + '</span>' +
          '<span class="sp-crown' + (this.built ? ' is-near' : '') + '">' + b.top + '</span>';
        e.build.setAttribute('aria-label',
          'Building ' + b.name + ', ' + this.built + ' of ' + PER_BUILD);
      }
      if (e.stickers) {
        e.stickers.innerHTML = this.stickers.map(function (s) {
          return '<span class="sp-sticker">' + s + '</span>';
        }).join('');
        e.stickers.hidden = !this.stickers.length;
      }
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
          // A finished build takes over the card — this is the moment worth
          // making a fuss of.
          if (e.winBuild) {
            e.winBuild.hidden = !this.finished;
            if (this.finished) {
              e.winBuild.innerHTML =
                '<span class="sp-win-thing">' + this.finished.top + '</span>' +
                '<b>You built ' + this.finished.name + '!</b>' +
                '<i>+5 stars, and a sticker to keep</i>';
            }
          }
          if (e.win) e.win.classList.toggle('is-checkpoint', !!this.finished);
        }
      }
      if (e.pad) e.pad.hidden = !!this.won;
    }
  };

  SpellGame.WORDS = BANDS;      // exposed for testing
  global.SpellGame = SpellGame;
})(window);
