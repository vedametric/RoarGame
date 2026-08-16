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
    '+': { say: 'plus',     apply: function (a, b) { return a + b; } },
    '-': { say: 'take away', apply: function (a, b) { return a - b; } },
    '×': { say: 'times',    apply: function (a, b) { return a * b; } },
    '÷': { say: 'shared by', apply: function (a, b) { return b === 0 ? null : a / b; } }
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

      this._render();
      return this;
    },

    stop: function () {
      this.running = false;
      try { speechSynthesis.cancel(); } catch (e) {}
    },

    setSpeak: function (on) {
      this.speak = !!on;
      if (!on) { try { speechSynthesis.cancel(); } catch (e) {} }
      this._render();
      return this.speak;
    },

    /* ── keys ─────────────────────────────────────────────────── */

    press: function (key) {
      if (!this.running) return;

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
      this._say(d);
      this._render();
    },

    _dot: function () {
      if (this.fresh) { this.entry = '0.'; this.fresh = false; }
      else if (this.entry.indexOf('.') < 0) this.entry += '.';
      this._say('point');
      this._render();
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
      this._say(OPS[k].say);
      this._render();
    },

    _equals: function () {
      if (this.op === null) { this._say(this.entry); this._render(); return; }
      var shown = tidy(this.left) + ' ' + this.op + ' ' + this.entry;
      var got = this._compute();
      if (got === null) return;
      this.sum = shown + ' =';
      this.op = null;
      this.fresh = true;
      this._say('equals ' + this.entry, true);
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
        this._say("you can't share by zero", true);
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
      this._say('clear');
      this._render();
    },

    _back: function () {
      if (this.fresh) return;
      this.entry = this.entry.length > 1 ? this.entry.slice(0, -1) : '0';
      if (this.entry === '-' || this.entry === '') this.entry = '0';
      this._render();
    },

    /* ── voice ────────────────────────────────────────────────── */

    _say: function (text, slow) {
      if (!this.speak || global.RoarAudio.muted) return;
      try {
        if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) return;
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(String(text));
        u.rate = slow ? 0.85 : 1;
        u.pitch = 1;
        u.volume = 1;
        speechSynthesis.speak(u);
      } catch (e) {}
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
