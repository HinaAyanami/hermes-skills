#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Download open-source icons from the Iconify public API and emit icons.js.

Emits `window.ICONS = { key: {vb, body} }`, to be inlined by the page:

    <script src="icons.js"></script>
    <script>
      document.querySelectorAll('[data-icon]').forEach(function (el) {
        var ic = window.ICONS[el.getAttribute('data-icon')];
        if (ic) el.innerHTML = '<svg viewBox="' + ic.vb + '" fill="currentColor" '
          + 'width="100%" height="100%">' + ic.body + '</svg>';
      });
    </script>

Usage:
  python fetch_icons.py                        # default concept set below
  python fetch_icons.py out.js brain=ph:brain rod=mdi:fishing

Notes:
  * The API answers HTTP 403 to Python's default User-Agent; a browser-ish UA
    is required (curl passes by default, which masks the cause).
  * Phosphor (ph) and Material Design Icons (mdi) are MIT / Apache-2.0.
  * Inlining avoids any file:// subresource or CORS question at record time.
"""
import json
import re
import sys
import urllib.request

DEFAULT = {
    'mobile': 'ph:device-mobile', 'eye': 'ph:eye', 'brain': 'ph:brain',
    'fishing': 'mdi:fishing', 'pickaxe': 'mdi:pickaxe', 'lock': 'ph:lock',
    'power': 'ph:power', 'heart': 'ph:heart', 'person': 'ph:person',
    'hand': 'ph:hand', 'spiral': 'ph:spiral', 'bowl': 'ph:bowl-food',
    'chats': 'ph:chats', 'share': 'ph:share-fat', 'target': 'ph:target',
}

API = 'https://api.iconify.design/%s.svg'
UA = 'Mozilla/5.0'


def fetch(prefix, name):
    req = urllib.request.Request(API % (prefix + '/' + name),
                                 headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode('utf-8')


def main(argv):
    out = argv[1] if len(argv) > 1 else 'icons.js'
    spec = {}
    for a in argv[2:]:
        key, _, ref = a.partition('=')
        spec[key] = ref
    if not spec:
        spec = dict(DEFAULT)

    icons = {}
    for key, ref in spec.items():
        prefix, _, name = ref.partition(':')
        try:
            svg = fetch(prefix, name)
        except Exception as e:                                # noqa: BLE001
            print('FAIL %-9s %r' % (key, e))
            continue
        vb = re.search(r'viewBox="([^"]+)"', svg)
        body = re.sub(r'^.*?<svg[^>]*>', '', svg, flags=re.S)
        body = re.sub(r'</svg>\s*$', '', body, flags=re.S).strip()
        icons[key] = {'vb': vb.group(1) if vb else '0 0 256 256', 'body': body}
        print('OK   %-9s %-16s %d chars' % (key, icons[key]['vb'], len(body)))

    with open(out, 'w', encoding='utf-8') as f:
        f.write('window.ICONS = ' + json.dumps(icons, ensure_ascii=False) + ';\n')
    print('%s written with %d icons' % (out, len(icons)))


if __name__ == '__main__':
    main(sys.argv)
