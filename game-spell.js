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
  /* ── the rocket ───────────────────────────────────────────────
     Five right words builds one, a piece at a time, and the fifth piece is the
     engine — so the moment it is finished it can take off. The pieces are
     named and spoken about, because "you built the nose cone" is a much better
     reward than a bar filling up.

     Bottom of the list is drawn first; each piece only appears once it has
     been earned. */
  var ROCKET = [
    { key: 'body',  name: 'the body' },
    { key: 'fins',  name: 'the fins' },
    { key: 'glass', name: 'the window' },
    { key: 'nose',  name: 'the nose cone' },
    { key: 'engine', name: 'the engine' }
  ];

  // One rocket, drawn in parts. `n` pieces are shown; the rest are waiting
  // outlines, so she can see what is still to come.
  function rocketSVG(n, flame) {
    function part(i, body) {
      var on = i < n;
      return '<g class="rk-part' + (on ? ' is-on' : '') +
             '" data-part="' + ROCKET[i].key + '">' + body + '</g>';
    }
    return '<svg class="rk" viewBox="0 0 64 116" aria-hidden="true">' +
      // body
      part(0, '<path d="M32 18 C44 34 46 56 46 78 L18 78 C18 56 20 34 32 18 Z"/>') +
      // fins
      part(1, '<path d="M18 60 L6 84 L18 78 Z"/><path d="M46 60 L58 84 L46 78 Z"/>') +
      // window
      part(2, '<circle cx="32" cy="44" r="8"/><circle cx="32" cy="44" r="4.6" class="rk-glint"/>') +
      // nose cone
      part(3, '<path d="M32 4 C38 10 42 16 44 22 L20 22 C22 16 26 10 32 4 Z"/>') +
      // engine, and the flame it makes once it is lit
      part(4, '<path d="M22 78 L42 78 L38 90 L26 90 Z"/>' +
              (flame ? '<path class="rk-flame" d="M26 90 L38 90 L32 114 Z"/>' : '')) +
      '</svg>';
  }

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
      this.cfg = cfg;
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
      this.launch = false;                // ...and whether it took off
      this.part = null;                   // the piece the last right word added
      this.band = 0;             // which length we are on
      this.queues = BANDS.map(shuffled);
      this.at = BANDS.map(function () { return 0; });

      this.readPrefs();

      this._buildKeys();
      this._next();
      return this;
    },

    stop: function () {
      this.running = false;
      clearTimeout(this._spellT);
      clearTimeout(this._winT);
      global.Say.stop();
      // Leaving mid-flight takes the rocket with you: nothing keeps running
      // over the top of whatever screen you went to.
      if (global.RocketLaunch) { try { global.RocketLaunch.stop(); } catch (e) {} }
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

      // Another piece of the rocket, and the fifth one is the engine — so it
      // launches: a bigger noise, longer confetti, balloons, and a rocket
      // sticker to keep.
      this.part = ROCKET[this.built % ROCKET.length];
      this.built++;
      this.finished = null;
      this.launch = false;
      if (this.built >= PER_BUILD) {
        this.built = 0;
        this.finished = ROCKET[ROCKET.length - 1];
        this.launch = true;
        this.stickers.push('🚀');
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

      // The fifth word does not just show a finished rocket — it flies it.
      // The card waits behind the launch and is there when she comes back.
      if (this.launch) this._launch();
    },

    _launch: function () {
      var self = this;
      var L = global.RocketLaunch;
      if (!L || !this.el.launchWrap) return;
      // Nothing else should be making a noise while the countdown is running.
      global.Say.stop();
      try { global.Confetti.stop(); } catch (e) {}
      L.play({
        wrap: this.el.launchWrap,
        canvas: this.el.launchCanvas,
        word: this.el.launchWord,
        onDone: function (planet) {
          if (!self.running) return;
          // Having flown all that way, she gets to play with whoever lives
          // there before coming back to the card.
          if (self.cfg && self.cfg.onLanded && self.cfg.onLanded(planet)) return;
          self._afterRocket();
        }
      });
    },

    // Back to the card, with the confetti waiting for her. Called when the
    // flight ends, or when she is finished with the alien.
    _afterRocket: function () {
      if (!this.running) return;
      var self = this;
      try {
        global.Confetti.start(['#ffd24c', '#ff8a2b', '#e6b3ff', '#7ec8ff',
                               '#9df08a', '#ffb3f0', '#ffffff']);
      } catch (e) {}
      clearTimeout(this._winT);
      this._winT = setTimeout(function () {
        try { global.Confetti.stop(); } catch (e) {}
      }, 3600);
      global.RoarAudio.sfx('checkpoint');
      global.Say.line('m-rocketbuilt', 'You built the whole rocket!');
      this._render();
    },

    next: function () { if (this.running && this.won) { try { global.Confetti.stop(); } catch (e) {} this._next(); } },

    skipLaunch: function () { if (global.RocketLaunch) global.RocketLaunch.skip(); },

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

    // The keyboard and the case are settings, not game state: they are read
    // back whether or not anyone has opened the spelling bee this session, so
    // the settings sheet can show and change them from anywhere.
    readPrefs: function () {
      this.layout = saved('layout', 'qwerty') === 'abc' ? 'abc' : 'qwerty';
      this.lower = saved('case', 'lower') !== 'upper';
      return this;
    },

    _buildKeys: function () {
      var pad = this.el && this.el.keys;
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
      if (this.running) global.RoarAudio.sfx('spellhint');
    },

    toggleLayout: function () { this.setLayout(this.layout === 'abc' ? 'qwerty' : 'abc'); },

    toggleCase: function () {
      this.lower = !this.lower;
      save('case', this.lower ? 'lower' : 'upper');
      this._buildKeys();
      this._render();
      if (this.running) global.RoarAudio.sfx('spellhint');
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

      // the strip: the rocket so far, and what the next word adds to it
      if (e.build) {
        var next = ROCKET[this.built % ROCKET.length];
        e.build.innerHTML =
          rocketSVG(this.built, false) +
          '<span class="sp-build-what">' +
            '<b>building a rocket</b>' +
            '<i>' + (this.built ? 'next: ' + next.name : 'start with ' + next.name) + '</i>' +
          '</span>' +
          '<span class="sp-build-count">' + this.built + '/' + PER_BUILD + '</span>';
        e.build.setAttribute('aria-label',
          'Building a rocket, ' + this.built + ' of ' + PER_BUILD + ' pieces');
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
          // A finished rocket takes over the card and launches off the top of
          // it — this is the moment worth making a fuss of. Every other right
          // word still shows the piece it just added, so the progress is
          // always something she can see.
          if (e.winBuild) {
            e.winBuild.hidden = false;
            e.winBuild.classList.toggle('is-launch', !!this.launch);
            if (this.launch) {
              e.winBuild.innerHTML =
                '<span class="sp-win-rocket">' + rocketSVG(PER_BUILD, true) + '</span>' +
                // Built by count, not by splitting a string: an emoji is two
                // code units, so split('') would hand each balloon out in
                // halves and render five pairs of broken glyphs.
                '<span class="sp-balloons" aria-hidden="true">' +
                  [0, 1, 2, 3, 4].map(function (i) {
                    return '<i style="--i:' + i + '">🎈</i>';
                  }).join('') +
                '</span>' +
                '<b>Lift off! You built the whole rocket!</b>' +
                '<i>+5 stars, and a rocket sticker to keep</i>';
            } else {
              e.winBuild.innerHTML =
                '<span class="sp-win-rocket">' + rocketSVG(this.built, false) + '</span>' +
                '<b>You added ' + (this.part ? this.part.name : 'a piece') + '!</b>' +
                '<i>' + (PER_BUILD - this.built) + ' more to launch 🚀</i>';
            }
          }
          if (e.win) e.win.classList.toggle('is-checkpoint', !!this.launch);
        }
      }
      if (e.pad) e.pad.hidden = !!this.won;
    }
  };

  SpellGame.readPrefs();        // so settings can show them before you play
  SpellGame.WORDS = BANDS;      // exposed for testing
  global.SpellGame = SpellGame;
})(window);
