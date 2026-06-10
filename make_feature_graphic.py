import sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

sys.stdout.reconfigure(encoding='utf-8')

W, H = 1024, 500
base = "C:/Users/rogue/Desktop/KitchenForge"
out_dir = os.path.join(base, "screenshots")
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, "feature_graphic_1024x500.png")

# ---- vertical gradient background ----
c_top = (27, 94, 32)
c_bot = (60, 140, 66)
img = Image.new("RGB", (W, H), c_top)
px = img.load()
for y in range(H):
    t = y / (H - 1)
    r = int(c_top[0] + (c_bot[0]-c_top[0])*t)
    g = int(c_top[1] + (c_bot[1]-c_top[1])*t)
    b = int(c_top[2] + (c_bot[2]-c_top[2])*t)
    for x in range(W):
        px[x, y] = (r, g, b)

# ---- decorative translucent circles ----
overlay = Image.new("RGBA", (W, H), (0,0,0,0))
od = ImageDraw.Draw(overlay)
od.ellipse([W-230, -160, W+180, 250], fill=(255,255,255,16))
od.ellipse([W-120, 200, W+260, 600], fill=(255,255,255,12))
od.ellipse([-180, 320, 170, 660], fill=(255,255,255,10))
img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

# ---- app icon, rounded, with soft shadow ----
icon_path = os.path.join(base, "icon-512.png")
ICON = 290
icon = Image.open(icon_path).convert("RGBA").resize((ICON, ICON), Image.LANCZOS)
mask = Image.new("L", (ICON, ICON), 0)
ImageDraw.Draw(mask).rounded_rectangle([0,0,ICON,ICON], radius=62, fill=255)
icon.putalpha(mask)
ix, iy = 78, (H-ICON)//2
shadow = Image.new("RGBA", (W, H), (0,0,0,0))
sd = ImageDraw.Draw(shadow)
sd.rounded_rectangle([ix+8, iy+14, ix+ICON+8, iy+ICON+14], radius=62, fill=(0,0,0,90))
shadow = shadow.filter(ImageFilter.GaussianBlur(16))
img = Image.alpha_composite(img.convert("RGBA"), shadow).convert("RGB")
img.paste(icon, (ix, iy), icon)
draw = ImageDraw.Draw(img, "RGBA")

# ---- fonts ----
def font(paths, size):
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

BOLD = ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"]
SEMI = ["C:/Windows/Fonts/segoeuisb.ttf", "C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"]
REG  = ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"]

tx = ix + ICON + 52
avail = W - tx - 48           # right margin 48

def fit(text, paths, start, max_w, floor=24):
    s = start
    while s > floor:
        f = font(paths, s)
        if draw.textlength(text, font=f) <= max_w:
            return f, s
        s -= 2
    return font(paths, floor), floor

title_txt = "KitchenForge"
tag_txt   = "Smart Pantry & Recipes"
sub_txt   = "Track food · Cook smarter · Waste nothing"

f_title, s_title = fit(title_txt, BOLD, 88, avail)
f_tag,   s_tag   = fit(tag_txt,   SEMI, 40, avail)
f_sub,   s_sub   = fit(sub_txt,   REG,  29, avail)

def th(f, t):
    b = draw.textbbox((0,0), t, font=f)
    return b[3]-b[1]

h_title = th(f_title, title_txt)
h_tag   = th(f_tag, tag_txt)
h_sub   = th(f_sub, sub_txt)

gap1, gap2, under_gap = 26, 16, 18
under_h = 6
block_h = h_title + under_gap + under_h + gap1 + h_tag + gap2 + h_sub
y = (H - block_h)//2 - 6   # nudge up slightly for optical balance

# draw using anchor 'la' (left/ascender) for consistent placement
draw.text((tx, y), title_txt, font=f_title, fill=(255,255,255), anchor="la")
yb = y + h_title + under_gap
draw.rounded_rectangle([tx, yb, tx+230, yb+under_h], radius=3, fill=(129,199,132))
yt = yb + under_h + gap1
draw.text((tx, yt), tag_txt, font=f_tag, fill=(233,245,233), anchor="la")
ys = yt + h_tag + gap2
draw.text((tx, ys), sub_txt, font=f_sub, fill=(197,225,199), anchor="la")

img.save(out, "PNG")
print(f"Saved {out}  title={s_title}px tag={s_tag}px sub={s_sub}px  titleW={int(draw.textlength(title_txt,font=f_title))}/{avail}")
