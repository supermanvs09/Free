"""Build and render the Deep Algorithms brochures.

  python3 build.py              -> build/<doc>_tagline-<n>.html/.png/.pdf for every brochure and tagline
  python3 build.py --no-render  -> HTML only

Edit content in src/*.html (shared styles in src/base.css). Placeholders such as
{{icon:fingerprint}} and {{tagline}} are filled here.
"""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).parent
ICONS = ROOT / "assets" / "icons"
OUT = ROOT / "build"

DOCS = {
    "deep-algorithms-enterprise-profile": "profile.html",
    "adapid-nhi-security-brochure": "nhi-security.html",
}
TAGLINES = {
    1: "Protecting identities, <em>securing intelligence</em>, empowering enterprises.",
    2: "Making Digital Security <em>Smarter, Stronger</em> and Proactive.",
}


def icon(name, cls="ico", size=None):
    svg = (ICONS / f"{name}.svg").read_text()
    attrs = f'class="{cls}" ' + (f'width="{size}" height="{size}" ' if size else "")
    return svg.replace("<svg ", f"<svg {attrs}", 1)


WAVES = '<svg class="waves" viewBox="0 0 300 120" preserveAspectRatio="none" fill="none">' + "".join(
    f'<path d="M0,{70+i*5} C60,{40+i*6} 120,{110-i*3} 180,{70+i*2} S270,{30+i*7} 300,{50+i*5}" stroke="#4fb3ff" stroke-opacity="{0.08+i*0.035:.3f}" stroke-width="1"/>'
    for i in range(10)) + "</svg>"

FOOTWAVES = '<svg class="fw" viewBox="0 0 760 200" preserveAspectRatio="none" fill="none">' + "".join(
    f'<path d="M0,{160-i*4} C150,{120-i*7} 300,{200-i*3} 460,{130-i*6} S680,{60+i*2} 760,{90-i*5}" stroke="#4fb3ff" stroke-opacity="{0.05+i*0.03:.3f}" stroke-width="1"/>'
    for i in range(14)) + "</svg>"

RADAR = """<svg viewBox="0 0 200 112" style="position:absolute;inset:0;width:100%;height:100%;z-index:1;opacity:.5" fill="none">
<g transform="translate(150 30)" stroke="#a6d9ff"><circle r="18" stroke-opacity=".5"/><circle r="38" stroke-opacity=".35"/><circle r="60" stroke-opacity=".22"/><circle r="84" stroke-opacity=".14"/>
<path d="M0,0 L-60,40" stroke-opacity=".6"/></g></svg>"""


def orbit(kind):
    """Shield-and-orbit header art (own artwork, brand palette). Centre: Deep Algorithms mark."""
    if kind == "nhi":
        W, H = 640, 330
        nodes = [("APIs", "o-code", 320, 34, "r"), ("Automations", "o-robot", 128, 92, "l"),
                 ("Cloud Workloads", "o-cloud", 512, 92, "r"), ("Service Accounts", "o-user-gear", 128, 238, "l"),
                 ("Databases", "o-database", 320, 296, "r"), ("CI/CD Pipelines", "o-infinity", 512, 238, "r")]
    else:
        W, H = 660, 400
        nodes = [("AI Agents", "o-robot", 330, 44, "l"), ("Humans", "o-user", 136, 116, "l"),
                 ("MCP Servers", "o-plugs-connected", 524, 116, "r"), ("Machine Identities", "o-key", 136, 284, "l"),
                 ("Data", "o-database", 330, 356, "r"), ("Copilots", "o-sparkle", 524, 284, "r")]
    cx, cy = W / 2, H / 2
    sw, sh = (128, 150) if kind == "nhi" else (150, 176)
    lines = "".join(f'<path d="M{cx} {cy} L{x} {y}"/>' for _, _, x, y, _ in nodes)
    svg = f"""<svg class="orb-svg" viewBox="0 0 {W} {H}" fill="none">
<defs><radialGradient id="og-{kind}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#4fb3ff" stop-opacity=".55"/><stop offset="1" stop-color="#4fb3ff" stop-opacity="0"/></radialGradient>
<linearGradient id="sg-{kind}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9ecff"/></linearGradient></defs>
<circle cx="{cx}" cy="{cy}" r="{H*0.5}" fill="url(#og-{kind})"/>
<ellipse cx="{cx}" cy="{cy}" rx="{W*0.47}" ry="{H*0.17}" stroke="#a6d9ff" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="3 6"/>
<ellipse cx="{cx}" cy="{cy}" rx="{W*0.36}" ry="{H*0.33}" stroke="#4fb3ff" stroke-opacity=".35"/>
<circle cx="{cx}" cy="{cy}" r="{sh*0.62}" stroke="#a6d9ff" stroke-opacity=".3"/>
<g stroke="#a6d9ff" stroke-opacity=".5" stroke-dasharray="2 5">{lines}</g>
<g fill="#a6d9ff"><circle cx="{cx-W*0.47}" cy="{cy}" r="3.5"/><circle cx="{cx+W*0.47}" cy="{cy}" r="3.5"/><circle cx="{cx-W*0.2}" cy="{cy+H*0.155}" r="2.5"/><circle cx="{cx+W*0.22}" cy="{cy-H*0.153}" r="2.5"/></g>
<g transform="translate({cx-sw/2} {cy-sh/2}) scale({sw/100} {sh/118})">
<path d="M50 2 L94 18 V58 C94 88 74 106 50 116 C26 106 6 88 6 58 V18 Z" fill="url(#sg-{kind})" stroke="#a6d9ff" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M50 11 L86 24 V58 C86 82 70 97 50 106 C30 97 14 82 14 58 V24 Z" stroke="#0E1A5C" stroke-opacity=".12" stroke-width="1.4"/></g>
</svg>"""
    mark = f'<img class="orb-mark" src="../assets/brand/deep-algorithms-mark.png" alt="" style="left:{cx-sw*0.24}px;top:{cy-sh*0.22}px;width:{sw*0.48}px">'
    nd = "".join(
        f'<div class="orb-n {side}" style="left:{x-28}px;top:{y-28}px"><span class="c">{icon(ic)}</span><b>{label}</b></div>'
        for label, ic, x, y, side in nodes)
    return f'<div class="orb orb-{kind}" style="width:{W}px;height:{H}px">{svg}{mark}{nd}</div>'


def build(src, tagline):
    html = (ROOT / "src" / src).read_text()
    html = re.sub(r"\{\{svg256:([\w-]+)\}\}", lambda m: icon(m.group(1), "", 256), html)
    html = re.sub(r"\{\{orbit:(\w+)\}\}", lambda m: orbit(m.group(1)), html)
    html = re.sub(r"\{\{icon:([\w-]+)\}\}", lambda m: icon(m.group(1)), html)
    html = re.sub(r"\{\{cicon:([\w-]+)\}\}", lambda m: icon(m.group(1), "ci"), html)
    html = (html.replace("{{waves}}", WAVES).replace("{{footwaves}}", FOOTWAVES)
                .replace("{{radar}}", RADAR).replace("{{tagline}}", tagline))
    assert "{{" not in html, re.findall(r"\{\{[^}]+\}\}", html)
    return html


def main():
    OUT.mkdir(exist_ok=True)
    pages = []
    for name, src in DOCS.items():
        for n, tag in TAGLINES.items():
            out = OUT / f"{name}_tagline-{n}.html"
            out.write_text(build(src, tag))
            pages.append(str(out.resolve()))
    if "--no-render" not in sys.argv:
        subprocess.run(["node", str(ROOT / "render.js"), *pages], check=True)
        from PIL import Image  # PDF from the 300 dpi PNG: no transparency/blend effects for viewers to misdraw
        for p in pages:
            png = pathlib.Path(p).with_suffix(".png")
            Image.open(png).convert("RGB").save(png.with_suffix(".pdf"), resolution=300.0)


if __name__ == "__main__":
    main()
