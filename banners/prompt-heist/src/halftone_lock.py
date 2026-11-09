# Renders a halftone, sticker-cut, cracked padlock as a transparent PNG.
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math, random
random.seed(7)
W,H=1400,1700
S=1  # base scale
# --- shading map (0=dark,255=light) ---
shade=Image.new('L',(W,H),0); d=ImageDraw.Draw(shade)
mask=Image.new('L',(W,H),0); m=ImageDraw.Draw(mask)
bx0,by0,bx1,by1=180,720,1220,1580   # body
# shackle: thick arc
for r in range(0,1):
    pass
sh=Image.new('L',(W,H),0); sd=ImageDraw.Draw(sh)
sd.rounded_rectangle((340,180,1060,1100),radius=360,fill=255)
sd.rounded_rectangle((470,310,930,1100),radius=230,fill=0)
sd.rectangle((340,760,1060,1100),fill=0)
sd.rectangle((340,640,470,800),fill=255); sd.rectangle((930,640,1060,800),fill=255)
# lift the right leg of shackle (open lock)
sh=sh.transform(sh.size,Image.AFFINE,(1,0,0,0,1,110))  # lift whole shackle: unlocked
mask=ImageChops.lighter(mask,sh)
m=ImageDraw.Draw(mask); m.rounded_rectangle((bx0,by0,bx1,by1),radius=70,fill=255)
# shading: light from top-left
grad=Image.new('L',(W,H))
gp=grad.load()
for y in range(H):
    for x in range(0,W):
        v=255-int(0.55*((x/W)*180+(y/H)*150))
        gp[x,y]=max(0,min(255,v))
# body side bevel darker on right
bev=Image.new('L',(W,H),0); bd=ImageDraw.Draw(bev)
bd.rounded_rectangle((bx1-150,by0,bx1,by1),radius=70,fill=90)
bd.rectangle((bx0,by1-110,bx1,by1),fill=70)
bev=bev.filter(ImageFilter.GaussianBlur(40))
tone=ImageChops.subtract(grad,bev)
# shackle inner shadow
shd=Image.new('L',(W,H),0); ImageDraw.Draw(shd).rounded_rectangle((470,310,930,1100),radius=230,outline=110,width=60)
shd=shd.filter(ImageFilter.GaussianBlur(30)); shd.paste(0,(0,by0,W,H))
tone=ImageChops.subtract(tone,shd)
# --- crack (jagged gap) ---
crack=[(560,720),(610,860),(560,960),(690,1060),(640,1180),(760,1270),(720,1400),(820,1580)]
gap=Image.new('L',(W,H),0); gd=ImageDraw.Draw(gap)
gd.line(crack,fill=255,width=34,joint='curve')
mask=ImageChops.subtract(mask,gap)
# --- keyhole as prompt cursor area: leave a clean cutout rectangle ---
kh=(820,1020,1080,1180)
# --- halftone ---
step=15
dots=Image.new('L',(W*2,H*2),0); dd=ImageDraw.Draw(dots)
tp=tone.load(); mp=mask.load()
ang=math.radians(22)
for gy in range(-H,2*H,step):
    for gx in range(-W,2*W,step):
        x=gx*math.cos(ang)-gy*math.sin(ang); y=gx*math.sin(ang)+gy*math.cos(ang)
        xi,yi=int(x),int(y)
        if 0<=xi<W and 0<=yi<H and mp[xi,yi]>128 and not (kh[0]<xi<kh[2] and kh[1]<yi<kh[3]):
            r=(tp[xi,yi]/255)**1.15*step*0.62
            if r>0.9: dd.ellipse(((x-r)*2,(y-r)*2,(x+r)*2,(y+r)*2),fill=255)
dots=dots.resize((W,H),Image.LANCZOS)
# --- sticker outline (rough white border) ---
out=mask.filter(ImageFilter.MaxFilter(41))
rough=Image.effect_noise((W,H),40).filter(ImageFilter.GaussianBlur(3))
out=ImageChops.multiply(out, rough.point(lambda v:255 if v>60 else 255))
out=out.filter(ImageFilter.GaussianBlur(1.2)).point(lambda v:255 if v>120 else 0)
inner=mask.filter(ImageFilter.MaxFilter(5))
# compose RGBA: sticker white ring, black inside, white dots
ink=(242,240,234)
img=Image.new('RGBA',(W,H),(0,0,0,0))
ring=Image.new('RGBA',(W,H),ink+(255,)); img.paste(ring,(0,0),out)
body=Image.new('RGBA',(W,H),(14,15,17,255)); img.paste(body,(0,0),inner)
dotl=Image.new('RGBA',(W,H),ink+(255,)); img.paste(dotl,(0,0),ImageChops.multiply(dots,inner))
# keyhole cursor block (red) drawn later in HTML; mark position
img.save('lock.png')
print('keyhole', kh)
