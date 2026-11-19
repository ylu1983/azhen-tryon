"""Build static Pages output and editorial garment cutouts; never handles uploads."""
import json
import shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parents[1]
# Shoulder left/right, shoulder Y, hem Y, bottom left/right, waist Y, ankle/hem Y.
# Percent coordinates are editorial approximations from the shop's model references.
BOUNDS = {
    1:(36,63,22,46,38,64,45,91), 2:(29,70,28,88,36,65,65,98),
    3:(37,63,20,50,34,66,49,91), 4:(34,65,23,54,30,69,52,96),
    5:(33,68,20,56,37,67,51,96), 6:(34,67,21,48,34,66,46,92),
    7:(35,65,23,51,35,65,49,92), 8:(34,66,21,49,32,66,46,95),
    9:(37,64,24,55,34,66,52,96), 10:(37,68,19,58,37,68,49,92),
    11:(29,49,29,49,30,49,45,88), 12:(34,61,22,95,31,65,36,95),
    13:(33,65,21,54,36,65,51,92), 14:(33,67,20,81,31,69,37,81),
    15:(34,66,20,49,35,65,47,91), 16:(36,64,20,52,31,68,49,95),
    17:(35,65,22,57,35,65,51,91), 18:(36,65,21,57,36,65,50,71),
    19:(34,66,24,49,32,67,46,93), 20:(38,64,24,52,36,66,49,93),
    21:(33,66,23,51,34,66,48,93), 22:(38,64,26,94,32,68,45,94),
    23:(37,67,24,49,33,69,46,95), 24:(38,64,25,48,35,67,47,94),
    25:(37,66,25,57,35,68,51,95), 26:(36,66,25,52,35,67,50,94),
    27:(35,65,24,58,35,66,53,94),
}


def cutout(image, points, path, clothing):
    mask = Image.new('L', image.size)
    ImageDraw.Draw(mask).polygon([(round(x*image.width/100),round(y*image.height/100)) for x,y in points],fill=255)
    mask = ImageChops.multiply(mask,clothing.resize(image.size)).filter(ImageFilter.GaussianBlur(.6))
    result = image.convert('RGBA'); result.putalpha(mask)
    box=mask.getbbox()
    if not box:raise ValueError(f'Empty garment: {path}')
    result = result.crop(box); result.thumbnail((650,900))
    result.save(path,'WEBP',quality=91,method=6)
    return [box[0],box[1],box[2]-box[0],box[3]-box[1]]


def build():
    catalog=json.loads((ROOT/'static/catalog.json').read_text())
    metadata=json.loads((ROOT/'static/garments/fit.json').read_text())
    for item in catalog:
        keys=['dress'] if item['onePiece'] else [key for key in item['categories'] if key!='auto']
        for key in keys:
            name=f"{item['id']:02d}-{key}"
            assert name in metadata and (ROOT/f'static/garments/{name}.webp').exists(),name
    output=ROOT/'docs'; output.mkdir(exist_ok=True)
    shutil.copy2(ROOT/'index.html',output/'index.html')
    shutil.copytree(ROOT/'static',output/'static',dirs_exist_ok=True)
    (output/'.nojekyll').touch()
    print(f'Built {len(catalog)} looks to docs/')


if __name__=='__main__':
    build()
