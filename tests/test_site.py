import json
import unittest
from pathlib import Path
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
        for prohibited in ('XMLHttpRequest','sendBeacon','localStorage','sessionStorage','indexedDB','FASHN_API_KEY','https://api.'):
            self.assertNotIn(prohibited,script+compositor)
        self.assertEqual(script.count('fetch('),1)
        self.assertIn("fetch('static/catalog.json')",script.replace('"',"'"))
        self.assertIn('非 AI 換衣',compositor)

    def test_generated_source_files_match(self):
        self.assertEqual((ROOT/'index.html').read_bytes(),(ROOT/'docs/index.html').read_bytes())
        for source in (ROOT/'static').rglob('*'):
            if source.is_file():self.assertEqual(source.read_bytes(),(ROOT/'docs'/source.relative_to(ROOT)).read_bytes(),str(source))


if __name__=='__main__':unittest.main()
