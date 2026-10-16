"""Render the existing Build 4 mark and bundled font; no external resources.

Requires Playwright Python and Chromium. PNG outputs are committed so routine
frontend builds do not require a browser or change existing font dependencies.
"""
import base64
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
shell = (root / 'public/assets/js/shell.js').read_text()
svg = re.search(r'const LOGO = .*?uiHTML`(<svg.*?</svg>)`;', shell).group(1)
svg = svg.replace('${fill}', '#0E4B2C')
font = base64.b64encode((root / 'public/assets/fonts/unbounded-latin-f2b2b22d.woff2').read_bytes()).decode()
output = root / 'public/assets/brand'
output.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium')
    try:
        page = browser.new_page(viewport={'width': 1000, 'height': 240}, device_scale_factor=2)
        page.route('**/*', lambda route: route.abort())
        page.set_content(f'''<style>
          @font-face{{font-family:Unbounded;src:url(data:font/woff2;base64,{font});font-weight:100 900}}
          body{{margin:0;background:transparent;color:#0C1A13}}
          #icon{{width:64px;height:64px}} #icon svg{{width:64px;height:64px}}
          #logo{{display:inline-flex;align-items:center;gap:14px;padding:8px;
            font:700 26px Unbounded;letter-spacing:-.03em;white-space:nowrap}}
          #logo svg{{width:48px;height:48px}}
        </style><div id="icon">{svg}</div><div id="logo">{svg}<span>FindPitches</span></div>''')
        page.evaluate('()=>document.fonts.ready')
        page.locator('#icon').screenshot(path=str(output / 'findpitches-icon.png'), omit_background=True)
        page.locator('#logo').screenshot(path=str(output / 'findpitches-logo.png'), omit_background=True)
    finally:
        browser.close()
print('Rendered existing FindPitches mark and wordmark to two local PNGs')
