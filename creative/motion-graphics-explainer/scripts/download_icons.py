#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Fetch open-source icons from the Iconify API into a local icons.js.

Usage:
  edit ICONS below (name -> (set, icon)), then
  python download_icons.py [out.js]        # default icons.js

Emits:  window.ICONS = { name: { vb, body } }
Sets:   'ph' = Phosphor (MIT), 'mdi' = Material Design Icons (Apache-2.0).
        A missing icon returns HTTP 404 and silently leaves a blank spot.
"""
import json
import re
import sys
import urllib.request

ICONS = {
    'mobile':  ('ph',  'device-mobile'),
    'eye':     ('ph',  'eye'),
    'brain':   ('ph',  'brain'),
    'person':  ('ph',  'person'),
    'spiral':  ('ph',  'spiral'),
    'lock':    ('ph',  'lock'),
    'power':   ('ph',  'power'),
    'heart':   ('ph',  'heart'),
    'chats':   ('ph',  'chats'),
    'share':   ('ph',  'share-fat'),
    'target':  ('ph',  'target'),
    'fishing': ('mdi', 'fishing'),
    'pickaxe': ('mdi', 'pickaxe'),
}


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else 'icons.js'
    out = {}
    for name, (prefix, icon) in ICONS.items():
        url = 'https://api.iconify.design/%s/%s.svg' % (prefix, icon)
        try:
            # The API 403s Python's default User-Agent; send a browser-ish one.
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=25) as r:
                svg = r.read().decode('utf-8')
        except Exception as e:                                  # noqa: BLE001
            print('FAIL %-8s %r' % (name, e))
            continue

        vb = re.search(r'viewBox="([^"]+)"', svg)
        body = re.sub(r'^.*?<svg[^>]*>', '', svg, flags=re.S)
        body = re.sub(r'</svg>\s*$', '', body, flags=re.S).strip()
        out[name] = {'vb': vb.group(1) if vb else '0 0 256 256', 'body': body}
        print('OK   %-8s vb=%-14s %d chars' % (name, out[name]['vb'], len(body)))

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('window.ICONS = ' + json.dumps(out, ensure_ascii=False) + ';\n')
    print('%s written with %d icons' % (out_path, len(out)))


if __name__ == '__main__':
    main()
