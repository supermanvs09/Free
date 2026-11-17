"""Build and render the enterprise profile.

  python3 build.py          -> build/profile.html, build/deep-algorithms-enterprise-profile.png / .pdf
Edit src/profile.html for content; this script only inlines icons and shared SVG art.
"""
import pathlib, re, sys
ROOT = pathlib.Path(__file__).parent
ICONS = ROOT / "assets" / "icons"
OUT = ROOT / "build"

def icon(name, cls="ico"):
    svg = (ICONS / f"{name}.svg").read_text()
    return svg.replace("<svg ", f'<svg class="{cls}" ', 1)

WAVES = """<svg class="waves" viewBox="0 0 300 120" preserveAspectRatio="none" fill="none">""" + "".join(
    f'<path d="M0,{70+i*5} C60,{40+i*6} 120,{110-i*3} 180,{70+i*2} S270,{30+i*7} 300,{50+i*5}" stroke="#47b4ff" stroke-opacity="{0.08+i*0.035:.3f}" stroke-width="1"/>'
    for i in range(10)) + "</svg>"

FOOTWAVES = """<svg class="fw" viewBox="0 0 760 200" preserveAspectRatio="none" fill="none">""" + "".join(
    f'<path d="M0,{160-i*4} C150,{120-i*7} 300,{200-i*3} 460,{130-i*6} S680,{60+i*2} 760,{90-i*5}" stroke="#47b4ff" stroke-opacity="{0.05+i*0.03:.3f}" stroke-width="1"/>'
    for i in range(14)) + "</svg>"

RADAR = """<svg viewBox="0 0 200 112" style="position:absolute;inset:0;width:100%;height:100%;z-index:1;opacity:.5" fill="none">
<g transform="translate(150 30)" stroke="#8fd3ff"><circle r="18" stroke-opacity=".5"/><circle r="38" stroke-opacity=".35"/><circle r="60" stroke-opacity=".22"/><circle r="84" stroke-opacity=".14"/>
<path d="M0,0 L-60,40" stroke-opacity=".6"/></g></svg>"""

# CSB Bank: drop the official logo at assets/logos/csb-bank.png and it is used automatically.
csb = ROOT / "assets" / "logos" / "csb-bank.png"
CSB = ('<img src="../assets/logos/csb-bank.png" alt="CSB Bank">' if csb.exists()
       else '<span class="wm">CSB <i>Bank</i></span>')

def build():
    html = (ROOT / "src" / "profile.html").read_text()
    html = re.sub(r"\{\{icon:([\w-]+)\}\}", lambda m: icon(m.group(1)), html)
    html = re.sub(r"\{\{svg256:([\w-]+)\}\}", lambda m: (ICONS / f"{m.group(1)}.svg").read_text().replace("<svg ", '<svg width="256" height="256" ', 1), html)
    html = re.sub(r"\{\{cicon:([\w-]+)\}\}", lambda m: icon(m.group(1), "ci"), html)
    html = (html.replace("{{waves}}", WAVES).replace("{{footwaves}}", FOOTWAVES)
                .replace("{{radar}}", RADAR).replace("{{csb}}", CSB))
    assert "{{" not in html, re.findall(r"\{\{[^}]+\}\}", html)
    OUT.mkdir(exist_ok=True)
    (OUT / "profile.html").write_text(html)
    return OUT / "profile.html"

def render(path):
    import subprocess
    subprocess.run(["node", str(ROOT / "render.js"), str(path.resolve()), str(OUT)], check=True)

if __name__ == "__main__":
    out = build()
    if "--no-render" not in sys.argv:
        render(out)
    print("built", out)
