import json
import unittest
from pathlib import Path
import hashlib
from html.parser import HTMLParser
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]


class References(HTMLParser):
    def __init__(self):
        super().__init__();self.references=[];self.ids=[]
    def handle_starttag(self,tag,attrs):
        values=dict(attrs)
        if 'id' in values:self.ids.append(values['id'])
        for attr in ('src','href'):
            if attr in values:self.references.append(values[attr])


class SiteTests(unittest.TestCase):
    def test_catalog_has_27_unique_looks_and_real_transparent_garments(self):
        catalog=json.loads((ROOT/'static/catalog.json').read_text())
        self.assertEqual(len(catalog),27);self.assertEqual(len({x['id'] for x in catalog}),27)
        for item in catalog:
            keys=['dress'] if item['onePiece'] else [x for x in item['categories'] if x!='auto']
            for key in keys:
                path=ROOT/f"static/garments/{item['id']:02d}-{key}.webp"
                with Image.open(path) as image:
                    self.assertEqual(image.mode,'RGBA')
                    self.assertGreater(image.width,50);self.assertGreater(image.height,50)
                    self.assertEqual(image.getchannel('A').getextrema(),(0,255))

    def test_project_path_assets_and_anchor_targets_resolve(self):
        parser=References();parser.feed((ROOT/'index.html').read_text())
        self.assertEqual(len(parser.ids),len(set(parser.ids)))
        for reference in parser.references:
            if reference.startswith('#'):self.assertIn(reference[1:],parser.ids)
            elif '://' not in reference:
                self.assertFalse(reference.startswith('/'))
                self.assertTrue((ROOT/'docs'/reference).exists(),reference)

    def test_privacy_boundary_stays_browser_local(self):
        script=(ROOT/'static/app.js').read_text();compositor=(ROOT/'static/local-compositor.js').read_text()
        local=''.join(path.read_text() for path in (ROOT/'static').glob('*.js'))
        for prohibited in ('XMLHttpRequest','sendBeacon','localStorage','sessionStorage','indexedDB','FASHN_API_KEY','https://api.'):
            self.assertNotIn(prohibited,local)
        self.assertEqual(script.count('fetch('),2)
        self.assertIn("fetch('static/catalog.json')",script.replace('"',"'"))
        self.assertIn('非 AI 換衣',compositor)
        html=(ROOT/'index.html').read_text()
        self.assertIn("connect-src 'self'",html)
        self.assertIn("script-src 'self' 'wasm-unsafe-eval'",html)
        detector=(ROOT/'static/on-device-body.js').read_text()
        self.assertNotIn('https://',detector)
        self.assertRegex(detector,r"new URL\(\s*['\"]\./models/pose_landmarker_lite.task['\"]\s*,\s*import.meta.url")

    def test_pinned_local_models_and_fit_metadata(self):
        for name,sha in [('pose_landmarker_lite.task','59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'),('selfie_multiclass.tflite','c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0')]:
            self.assertEqual(hashlib.sha256((ROOT/'static/models'/name).read_bytes()).hexdigest(),sha)
        metadata=json.loads((ROOT/'static/garments/fit.json').read_text())
        for entry in metadata.values():
            self.assertEqual(len(entry['pose']),8)
            self.assertEqual(len(entry['crop']),4)
            self.assertGreater(entry['crop'][2],0);self.assertGreater(entry['crop'][3],0)
        self.assertEqual(len(metadata),50)

    def test_generated_source_files_match(self):
        self.assertEqual((ROOT/'index.html').read_bytes(),(ROOT/'docs/index.html').read_bytes())
        for source in (ROOT/'static').rglob('*'):
            if source.is_file():self.assertEqual(source.read_bytes(),(ROOT/'docs'/source.relative_to(ROOT)).read_bytes(),str(source))


if __name__=='__main__':unittest.main()
