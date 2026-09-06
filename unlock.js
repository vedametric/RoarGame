/*
 * unlock.js — the key to a mini game
 *
 * Every so often a mini game is locked, and the key is one small question:
 * a sum, or a missing letter. Answer it and the game opens.
 *
 * The point is not to ration the games. It is that a child who has settled
 * into half an hour of Snake has stopped thinking, and one question every few
 * games puts a little bit of school back in without it feeling like school —
 * it takes about five seconds, it is always at her level, and getting it
 * wrong costs nothing but another go.
 *
 * So: never a punishment, never a wall. She cannot be locked out; a wrong
 * answer simply asks something else. The only thing it costs is a moment's
 * attention, which is the whole idea.
 */
(function (global) {
  'use strict';

  var COUNT = 'unlock.plays';     // mini games played since the last question
  var EVERY = 3;                  // one is always asked on the third
  var CHANCE = 0.2;               // ...and sometimes sooner, so it is not a rhythm
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function words() {
    // The spelling game's own list, shortest band first, so the words here are
    // ones she has already met.
    var b = global.SpellWords;
    if (!b || !b.length) return [['cat', '🐱'], ['dog', '🐶'], ['sun', '☀️']];
    return b[0].concat(b[1] || []);
  }

  var Unlock = {
    /* Is this one locked? Counted rather than purely random, so it cannot
       nag twice running and cannot go a whole afternoon without asking. */
    needed: function () {
      var n = parseInt(saved(COUNT, '0'), 10) || 0;
      if (n <= 0) return false;                  // the first one is always free
      return n % EVERY === 0 || Math.random() < CHANCE;
    },

    // Called whenever a mini game is actually opened.
    played: function () {
      var n = (parseInt(saved(COUNT, '0'), 10) || 0) + 1;
      save(COUNT, String(n));
      return n;
    },

    passed: function () { save(COUNT, '0'); },   // the clock starts again

    /* ── the question ─────────────────────────────────────────── */

    make: function (kind) {
      kind = kind || (Math.random() < 0.5 ? 'sum' : 'word');
      return kind === 'sum' ? this._sum() : this._word();
    },

    // Sums to twelve, and take-aways that never go below zero.
    _sum: function () {
      var add = Math.random() < 0.62;
      var a, b, answer, shown, keys;
      if (add) {
        a = 1 + ((Math.random() * 9) | 0);
        b = 1 + ((Math.random() * Math.min(9, 12 - a)) | 0);
        answer = a + b;
        shown = a + ' + ' + b;
        keys = ['n-' + a, 'm-plus', 'n-' + b];
      } else {
        a = 3 + ((Math.random() * 8) | 0);
        b = 1 + ((Math.random() * (a - 1)) | 0);
        answer = a - b;
        shown = a + ' − ' + b;
        keys = ['n-' + a, 'm-takeaway', 'n-' + b];
      }

      // Wrong answers that are near misses, because 7 next to 12 is not a
      // question, it is a formality.
      var opts = [answer];
      var tries = 0;
      while (opts.length < 4 && tries++ < 60) {
        var d = answer + (Math.random() < 0.5 ? -1 : 1) * (1 + ((Math.random() * 3) | 0));
        if (d >= 0 && d <= 20 && opts.indexOf(d) < 0) opts.push(d);
      }
      while (opts.length < 4) opts.push(opts.length + answer + 1);

      return {
        kind: 'sum',
        ask: 'What is ' + shown + '?',
        show: shown + ' = ?',
        answer: String(answer),
        options: shuffled(opts).map(String),
        say: keys
      };
    },

    // A short word with one letter taken out, and she hears the word said.
    _word: function () {
      var list = words();
      var pick = list[(Math.random() * list.length) | 0];
      var word = String(pick[0]).toUpperCase();
      var at = 1 + ((Math.random() * (word.length - 1)) | 0);   // never the first
      var missing = word.charAt(at);
      var show = word.slice(0, at) + '_' + word.slice(at + 1);

      var opts = [missing];
      while (opts.length < 4) {
        var L = LETTERS.charAt((Math.random() * 26) | 0);
        if (opts.indexOf(L) < 0) opts.push(L);
      }

      return {
        kind: 'word',
        ask: 'Which letter is missing from ' + pick[0] + '?',
        show: show.split('').join(' '),
        emoji: pick[1] || '',
        answer: missing,
        options: shuffled(opts),
        say: ['w-' + String(pick[0]).toLowerCase()]
      };
    },

    /* ── asking it ────────────────────────────────────────────────
       cfg: { els: {sheet, title, show, emoji, opts, note}, name, onPass } */

    ask: function (cfg) {
      this.cfg = cfg;
      this.el = cfg.els;
      this.tries = 0;
      this._put(this.make());
      this.el.sheet.hidden = false;
      return this;
    },

    close: function () {
      if (this.el && this.el.sheet) this.el.sheet.hidden = true;
      this.cfg = null;
    },

    _put: function (q) {
      var self = this;
      var e = this.el;
      this.q = q;

      if (e.title) {
        e.title.textContent = this.cfg.name ? 'Unlock ' + this.cfg.name : 'Unlock it!';
      }
      if (e.note) e.note.textContent = q.kind === 'sum'
        ? 'What does it come to?'
        : 'Which letter is missing?';
      if (e.emoji) {
        e.emoji.textContent = q.emoji || (q.kind === 'sum' ? '🔢' : '🔤');
      }
      if (e.show) e.show.textContent = q.show;

      if (e.opts) {
        e.opts.innerHTML = q.options.map(function (o) {
          return '<button class="key-opt" type="button" data-a="' +
                 o.replace(/"/g, '&quot;') + '">' + o + '</button>';
        }).join('');
      }
      if (e.say && q.say && global.Say) global.Say.line(q.say, q.ask);
    },

    // Her answer. Right opens the game; wrong asks something else instead of
    // sitting there telling her she is wrong.
    answer: function (given) {
      if (!this.q || !this.cfg) return false;
      var right = String(given) === String(this.q.answer);
      var self = this;

      if (right) {
        global.RoarAudio.sfx('spellwin');
        Unlock.passed();
        var go = this.cfg.onPass;
        var e = this.el;
        if (e.show) e.show.textContent = '🔓 OPEN!';
        if (e.opts) e.opts.innerHTML = '';
        setTimeout(function () {
          self.close();
          if (go) go();
        }, 550);
      } else {
        this.tries++;
        global.RoarAudio.sfx('spellbad');
        if (this.el.note) this.el.note.textContent = 'Not that one — try this instead!';
        this._put(this.make());
      }
      return right;
    }
  };

  Unlock.EVERY = EVERY;           // exposed for testing
  global.Unlock = Unlock;
})(window);
