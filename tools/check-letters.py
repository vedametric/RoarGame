#!/usr/bin/env python3
"""
tools/check-letters.py — prove the alphabet clips say the right letters.

SPELL IT reads a word out one letter at a time, so a letter that comes out as
a different letter teaches a child the wrong thing. This happened: the clips
used to spell the names out phonetically, and "ay" for A phonemises to ˈaɪ —
the very same sound as "eye", and as the letter I. The game said "I" whenever
it meant "A".

This checks every letter, in every voice that ships, against the phonemes an
English letter name should have, and that no two letters sound alike. Run it
after changing a voice or the letter text.

    python3 tools/check-letters.py
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

WANT = {
    'A': 'ˈeɪ',   'B': 'bˈiː',  'C': 'sˈiː',  'D': 'dˈiː',  'E': 'ˈiː',
    'F': 'ˈɛf',   'G': 'dʒˈiː', 'H': 'ˈeɪtʃ', 'I': 'ˈaɪ',   'J': 'dʒˈeɪ',
    'K': 'kˈeɪ',  'L': 'ˈɛl',   'M': 'ˈɛm',   'N': 'ˈɛn',   'O': 'ˈəʊ',
    'P': 'pˈiː',  'Q': 'kjˈuː', 'R': 'ˈɑː',   'S': 'ˈɛs',   'T': 'tˈiː',
    'U': 'jˈuː',  'V': 'vˈiː',  'W': 'dˈʌbəljˌuː', 'X': 'ˈɛks',
    'Y': 'wˈaɪ',  'Z': 'zˈɛd',
}


def main():
    from piper import PiperVoice

    # the packs, read straight out of the generator so the two cannot disagree
    src = open(os.path.join(HERE, 'build-voice.py')).read()
    ns = {}
    exec(src[src.index('PACKS = ['):src.index(']\n\n\ndef ffmpeg') + 1], ns)
    packs = ns['PACKS']

    vdir = os.path.join(HERE, '.voices')
    bad = []
    for pack in packs:
        model = os.path.join(vdir, pack['model'] + '.onnx')
        if not os.path.exists(model):
            print('  %-6s model not downloaded, skipped' % pack['id'])
            continue
        v = PiperVoice.load(model)
        seen = {}
        for L, want in WANT.items():
            got = ''.join(''.join(s) for s in v.phonemize(L))
            if got != want:
                bad.append('%s: %s says %s, expected %s' % (pack['id'], L, got, want))
            if got in seen:
                bad.append('%s: %s sounds exactly like %s (%s)' % (pack['id'], L, seen[got], got))
            seen[got] = L
        print('  %-6s 26 letters checked' % pack['id'])

    if bad:
        print('\nPROBLEMS:\n  ' + '\n  '.join(bad))
        raise SystemExit(1)
    print('\nevery letter says itself, and no two sound alike')


if __name__ == '__main__':
    main()
