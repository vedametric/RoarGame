/*
 * game-calc.js — "SIENNA'S CALCULATOR"
 *
 * A plain, friendly calculator for children: add, take away, times, share.
 * Big buttons, a running sum you can read, and a speaker toggle that reads
 * every key and every answer out loud.
 *
 * Arithmetic runs on the pending pair (left op right) rather than on a parsed
 * string, which is how a real pocket calculator behaves and is what a child
 * expects: 2 + 3 + 4 shows 5 as soon as the second + is pressed.
 */
(function (global) {
  'use strict';

  var OPS = {
    '+': { say: 'plus',      key: 'm-plus',     apply: function (a, b) { return a + b; } },
    '-': { say: 'take away', key: 'm-takeaway', apply: function (a, b) { return a - b; } },
    '×': { say: 'times',     key: 'm-times',    apply: function (a, b) { return a * b; } },
    '÷': { say: 'shared by', key: 'm-sharedby', apply: function (a, b) { return b === 0 ? null : a / b; } }
  };

  var MAX_DIGITS = 9;

  function tidy(n) {
    if (n === null || !isFinite(n)) return null;
    // Keep it readable: no long floating-point tails on the display.
    var r = Math.round(n * 1e6) / 1e6;
    var s = String(r);
    if (s.replace('-', '').replace('.', '').length > 12) {
      s = String(Number(r.toPrecision(10)));
    }
    return s;
  }

  var CalcGame = {
    running: false,

    start: function (cfg) {
      this.el = cfg.els;
      this.speak = cfg.speak !== false;
      this.running = true;

      this.entry = '0';        // what is being typed
      this.left = null;        // the number waiting for an operator
      this.op = null;
      this.fresh = true;       // next digit starts a new number
      this.sum = '';           // the line above, e.g. "12 + 5"
      clearTimeout(this._wholeT);

      this._render();
      return this;
    },

    stop: function () {
      this.running = false;
      clearTimeout(this._wholeT);
      global.Say.stop();
    },

    setSpeak: function (on) {
      this.speak = !!on;
      if (!on) {
        clearTimeout(this._wholeT);
        try { speechSynthesis.cancel(); } catch (e) {}
      }
      this._render();
      return this.speak;
    },

    /* ── keys ─────────────────────────────────────────────────── */

    press: function (key) {
      if (!this.running) return;
      // Any other key means the number is finished with, one way or another.
      if (key !== '.' && !/^[0-9]$/.test(key)) clearTimeout(this._wholeT);

      if (key === 'C') return this._clear();
      if (key === '⌫') return this._back();
      if (key === '=') return this._equals();
      if (OPS[key]) return this._operator(key);
      if (key === '.') return this._dot();
      return this._digit(key);
    },

    _digit: function (d) {
      if (this.fresh) { this.entry = d; this.fresh = false; }
      else if (this.entry === '0') this.entry = d;
      else if (this.entry.replace('-', '').replace('.', '').length < MAX_DIGITS) {
        this.entry += d;
      }
      this._sayKey('n-' + d, d);
      this._render();
      this._sayWholeSoon();
    },

    _dot: function () {
      if (this.fresh) { this.entry = '0.'; this.fresh = false; }
      else if (this.entry.indexOf('.') < 0) this.entry += '.';
      this._sayKey('m-point', 'point');
      this._render();
      this._sayWholeSoon();
    },

    _operator: function (k) {
      // A second operator finishes the one before it, like a real calculator.
      if (this.op !== null && !this.fresh) {
        var got = this._compute();
        if (got === null) return;
      } else {
        this.left = parseFloat(this.entry);
      }
      this.op = k;
      this.fresh = true;
      this.sum = tidy(this.left) + ' ' + k;
      this._sayKey(OPS[k].key, OPS[k].say);
      this._render();
    },

    _equals: function () {
      if (this.op === null) { this._sayNumber(parseFloat(this.entry)); this._render(); return; }
      var shown = tidy(this.left) + ' ' + this.op + ' ' + this.entry;
      var got = this._compute();
      if (got === null) return;
      this.sum = shown + ' =';
      this.op = null;
      this.fresh = true;
      this._sayNumber(parseFloat(this.entry), 'm-equals');
      this._render();
    },

    _compute: function () {
      var right = parseFloat(this.entry);
      var out = OPS[this.op].apply(this.left, right);
      if (out === null || !isFinite(out)) {
        this.sum = 'oops!';
        this.entry = '0';
        this.left = null;
        this.op = null;
        this.fresh = true;
        this._sayKey('m-nozero', "you can't share by zero");
        this._render();
        return null;
      }
      this.left = out;
      this.entry = tidy(out);
      return out;
    },

    _clear: function () {
      this.entry = '0';
      this.left = null;
      this.op = null;
      this.fresh = true;
      this.sum = '';
      this._sayKey('m-clear', 'clear');
      this._render();
    },

    _back: function () {
      if (this.fresh) return;
      this.entry = this.entry.length > 1 ? this.entry.slice(0, -1) : '0';
      if (this.entry === '-' || this.entry === '') this.entry = '0';
      this._render();
      this._sayWholeSoon();
    },

    /* ── voice ────────────────────────────────────────────────── */

    /* Typing 54321 reads out "five, four, three, two, one", which tells a child
       nothing about the number they have just made. So once the typing stops,
       say the whole thing: "fifty-four thousand three hundred and twenty-one".
       No need to press equals — the wait itself is the cue. */
    _sayWholeSoon: function () {
      var self = this;
      clearTimeout(this._wholeT);
      if (!this.speak || global.RoarAudio.muted) return;
      if (this.entry.replace('-', '').replace('.', '').length < 2) return;  // "7" is already whole
      this._wholeT = setTimeout(function () { self._sayWhole(); }, 1100);
    },

    _sayWhole: function () {
      if (!this.running) return;
      var n = parseFloat(this.entry);
      if (!isFinite(n)) return;
      this._sayNumber(n);
    },

    // Words for the number, borrowed from COUNTING so both games say a number
    // the same way. Decimals are read digit by digit after the point, which is
    // how everyone actually says them.
    spell: function (n) {
      var W = global.CountGame && global.CountGame.words;
      if (!W) return String(n);
      var neg = n < 0;
      n = Math.abs(n);
      var whole = Math.floor(n);
      var out = W(whole);
      var dot = String(this.entry).split('.')[1];
      if (dot) {
        out += ' point';
        for (var i = 0; i < dot.length; i++) out += ' ' + W(+dot.charAt(i));
      }
      return (neg ? 'minus ' : '') + out;
    },

    _say: function (text, slow) {
      if (!this.speak || global.RoarAudio.muted) return;
      global.Say.speak(text, { rate: slow ? 0.9 : 1 });
    },

    _sayKey: function (key, text) {
      if (!this.speak || global.RoarAudio.muted) return;
      global.Say.line(key, text);
    },

    // Whole numbers come out of the recorded parts; anything with a decimal
    // point falls back, because "three point one four" is not worth 900 clips.
    _sayNumber: function (n, lead) {
      if (!this.speak || global.RoarAudio.muted) return;
      var keys = Math.floor(n) === n ? global.Say.numberKeys(Math.abs(n)) : null;
      var words = this.spell(n);
      if (keys) {
        if (n < 0) keys = ['m-minus'].concat(keys);
        global.Say.line(lead ? [lead].concat(keys) : keys,
                        (lead ? 'equals ' : '') + words);
      } else {
        global.Say.speak((lead ? 'equals ' : '') + words, { rate: 0.9 });
      }
    },

    sayAnswer: function () { this._say(this.entry, true); },

    /* ── screen ───────────────────────────────────────────────── */

    _render: function () {
      var e = this.el;
      if (!e) return;
      if (e.sum) e.sum.textContent = this.sum || ' ';
      if (e.out) {
        e.out.textContent = this.entry;
        // Long answers shrink so they never spill off the display.
        e.out.classList.toggle('is-long', this.entry.length > 7);
        e.out.classList.remove('pop');
        void e.out.offsetWidth;
        e.out.classList.add('pop');
      }
      if (e.speak) {
        e.speak.textContent = this.speak ? '🔊' : '🔇';
        e.speak.classList.toggle('is-off', !this.speak);
      }
    }
  };

  global.CalcGame = CalcGame;
})(window);
