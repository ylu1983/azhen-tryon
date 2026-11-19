"""Offline catalog authoring only. Never accepts customer photos or makes API calls."""
import json
import numpy as np
import mediapipe as mp
from PIL import Image
from build import ROOT, BOUNDS, cutout


def prepare():
    vision = mp.tasks.vision
    base = mp.tasks.BaseOptions
    pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=base(model_asset_path=str(ROOT/'static/models/pose_landmarker_lite.task')),
        num_poses=1))
    segmenter = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=base(model_asset_path=str(ROOT/'static/models/selfie_multiclass.tflite')),
        output_category_mask=True))
    metadata = {}
    catalog = json.loads((ROOT/'static/catalog.json').read_text())
    for item in catalog:
        number=item['id']; l,r,t,h,bl,br,waist,hem=BOUNDS[number]; c=(l+r)/2; w=r-l
        image=Image.open(ROOT/f'static/assets/outfit-{number:02d}-large.webp').convert('RGB')
        sample=mp.Image(image_format=mp.ImageFormat.SRGB,data=np.array(image))
        found=pose.detect(sample).pose_landmarks
        if not found: raise ValueError(f'No catalog model pose: {number}')
        points=[]
        for a,b in ((11,12),(23,24),(25,26),(27,28)):
            pair=sorted([found[0][a],found[0][b]],key=lambda p:p.x)
            points.extend([[round(p.x*image.width,3),round(p.y*image.height,3)] for p in pair])
        categories=segmenter.segment(sample).category_mask.numpy_view().copy()
        clothing=Image.fromarray(np.where(categories==4,255,0).astype(np.uint8))
        if number==1:
            yy,xx=np.indices(categories.shape);landmarks=found[0]
            radius=abs(landmarks[11].x-landmarks[12].x)*image.width*.095
            arms=np.zeros(categories.shape,dtype=bool)
            for a,b in ((13,15),(14,16),(15,19),(16,20)):
                ax,ay=landmarks[a].x*image.width,landmarks[a].y*image.height
                bx,by=landmarks[b].x*image.width,landmarks[b].y*image.height
                dx,dy=bx-ax,by-ay
                position=np.clip(((xx-ax)*dx+(yy-ay)*dy)/max(dx*dx+dy*dy,1),0,1)
                arms|=(xx-ax-position*dx)**2+(yy-ay-position*dy)**2<radius**2
            alpha=np.where((categories==1)|(categories==3)|((categories==2)&arms),255,0).astype(np.uint8)
            front=image.convert('RGBA');front.putalpha(Image.fromarray(alpha));front.thumbnail((800,1200))
            front.save(ROOT/'static/garments/demo-foreground.webp','WEBP',quality=92,method=6)
        shapes={}
        if item['onePiece']:
            shapes['dress']=[(l,t),(c-w*.18,t+1),(c,t+5),(c+w*.18,t+1),(r,t),
                (r+1,t+17),(r-4,t+20),(br,hem),(bl,hem),(l+4,t+20),(l-1,t+17)]
        else:
            shapes['tops']=[(l,t),(c-w*.16,t+2),(c,t+5),(c+w*.16,t+2),(r,t),
                (r+1,min(t+14,h-2)),(r-4,min(t+15,h-2)),(r-3,h),(l+3,h),
                (l+4,min(t+15,h-2)),(l-1,min(t+14,h-2))]
            if 'bottoms' in item['categories']:
                shapes['bottoms']=[(bl+2,waist),(br-2,waist),(br,hem),(bl,hem)]
        for key,shape in shapes.items():
            name=f'{number:02d}-{key}'
            crop=cutout(image,shape,ROOT/f'static/garments/{name}.webp',clothing)
            metadata[name]={'pose':points,'crop':crop,'kind': 'skirt' if '裙' in item['name'] else key}
        print(f'Prepared look {number:02d}',flush=True)
    pose.close();segmenter.close()
    (ROOT/'static/garments/fit.json').write_text(json.dumps(metadata,ensure_ascii=False,separators=(',',':'))+'\n')


if __name__=='__main__': prepare()
