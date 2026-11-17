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


def orbit_light(W=600, H=360):
    """NHI header art on a light background: glass shield with the Deep Algorithms mark,
    flat orbit ellipse and six NHI types in white circles, labels below (own artwork)."""
    cx, cy = W / 2, H / 2 - 8
    nodes = [("APIs", "o-code", cx, 40), ("Automations", "o-robot", 70, 112), ("Cloud Workloads", "o-cloud", W - 70, 112),
             ("Service Accounts", "o-user-gear", 70, 250), ("Databases", "o-database", cx, 290), ("CI/CD Pipelines", "o-infinity", W - 70, 250)]
    sw, sh = 126, 148
    svg = f"""<svg class="orb-svg" viewBox="0 0 {W} {H}" fill="none">
<defs><radialGradient id="lg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#4fb3ff" stop-opacity=".35"/><stop offset="1" stop-color="#4fb3ff" stop-opacity="0"/></radialGradient>
<linearGradient id="ls" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6eefc"/></linearGradient>
<linearGradient id="lr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a6d9ff" stop-opacity="0"/><stop offset=".5" stop-color="#a6d9ff" stop-opacity=".8"/><stop offset="1" stop-color="#a6d9ff" stop-opacity="0"/></linearGradient></defs>
<circle cx="{cx}" cy="{cy}" r="{H*0.5}" fill="url(#lg)"/>
<ellipse cx="{cx}" cy="{cy+18}" rx="{W*0.49}" ry="{H*0.13}" stroke="url(#lr)" stroke-width="1.6"/>
<ellipse cx="{cx}" cy="{cy+18}" rx="{W*0.4}" ry="{H*0.09}" stroke="#a6d9ff" stroke-opacity=".3" stroke-dasharray="3 6"/>
<circle cx="{cx}" cy="{cy}" r="{sh*0.66}" stroke="#a6d9ff" stroke-opacity=".25"/>
<g stroke="#a6d9ff" stroke-opacity=".4" stroke-dasharray="3 5">""" + "".join(f'<path d="M{cx} {cy} L{x} {y}"/>' for _, _, x, y in nodes) + f"""</g>
<g fill="#a6d9ff" fill-opacity=".8"><circle cx="{cx-W*0.49}" cy="{cy+18}" r="3"/><circle cx="{cx+W*0.49}" cy="{cy+18}" r="3"/><circle cx="{cx-W*0.25}" cy="{cy+18+H*0.112}" r="2.5"/><circle cx="{cx+W*0.27}" cy="{cy+18-H*0.11}" r="2.5"/></g>
<g transform="translate({cx-sw/2} {cy-sh/2}) scale({sw/100} {sh/118})" style="filter:drop-shadow(0 10px 18px rgba(14,26,92,.18))">
<path d="M50 2 L94 18 V58 C94 88 74 106 50 116 C26 106 6 88 6 58 V18 Z" fill="url(#ls)" stroke="#bcd3f7" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M50 10 L87 23.5 V58 C87 83 70 98 50 107 C30 98 13 83 13 58 V23.5 Z" stroke="#0E1A5C" stroke-opacity=".08" stroke-width="1.4"/></g>
</svg>"""
    mark = f'<img class="orb-mark" src="../assets/brand/deep-algorithms-mark.png" alt="" style="left:{cx-sw*0.25}px;top:{cy-sh*0.23}px;width:{sw*0.5}px">'
    nd = "".join(f'<div class="ol-n" style="left:{x-30}px;top:{y-30}px"><span class="c">{icon(ic)}</span><b>{lab}</b></div>' for lab, ic, x, y in nodes)
    return f'<div class="orb orb-light dark" style="width:{W}px;height:{H}px">{svg}{mark}{nd}</div>'


SCAN = {
    "profile": dict(photo="hero-ai.jpg", center="fingerprint-thin",
                    chips=[("HUMAN · 0.12", -300, 34, 108), ("AI AGENT · 0.31", -150, 160, 118), ("NHI · 0.07", 60, 112, 94)]),
    "nhi": dict(photo="hero-dc.jpg", center="shield-check-thin",
                chips=[("SERVICE ACCT · 0.07", -330, 34, 150), ("API KEY · 0.92", -160, 150, 112), ("CI/CD TOKEN · 0.31", 0, 112, 142)]),
}


def scanart(kind):
    """First-build header art: masked photo underlay, glow, scan rings, centre icon, scan line, nodes, score chips."""
    k = SCAN[kind]
    chips = "".join(
        f'<g transform="translate({x} {y})"><rect x="-11" y="-15" width="{w}" height="23" rx="11.5" fill="#0E1A5C" stroke="#4fb3ff" stroke-opacity=".6"/><text>{t}</text></g>'
        for t, x, y, w in k["chips"])
    return f"""<div class="hero-art"><div class="ph" style="background-image:url(../assets/photos/{k['photo']})"></div>
<svg viewBox="0 0 720 500" fill="none">
<defs><radialGradient id="glow-{kind}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#4fb3ff" stop-opacity=".5"/><stop offset="1" stop-color="#4fb3ff" stop-opacity="0"/></radialGradient>
<linearGradient id="scan-{kind}" x1="0" x2="1"><stop offset="0" stop-color="#a6d9ff" stop-opacity="0"/><stop offset=".5" stop-color="#a6d9ff" stop-opacity=".95"/><stop offset="1" stop-color="#a6d9ff" stop-opacity="0"/></linearGradient>
<linearGradient id="ring-{kind}" x1="0" x2="1"><stop offset="0" stop-color="#2a5bea"/><stop offset="1" stop-color="#a6d9ff"/></linearGradient></defs>
<g transform="translate(430 270)">
<circle r="190" fill="url(#glow-{kind})"/>
<circle r="205" stroke="#2a5bea" stroke-opacity=".3"/>
<circle r="172" stroke="url(#ring-{kind})" stroke-opacity=".75" stroke-width="1.5" stroke-dasharray="2 9"/>
<circle r="150" stroke="#a6d9ff" stroke-opacity=".35"/>
<path d="M0,-150 A150,150 0 0 1 130,-75" stroke="#a6d9ff" stroke-width="3" stroke-linecap="round"/>
<path d="M-130,75 A150,150 0 0 1 -150,0" stroke="#4fb3ff" stroke-width="3" stroke-linecap="round"/>
<circle r="122" stroke="#4fb3ff" stroke-opacity=".2" stroke-width="18"/>
<g transform="translate(-80 -80) scale(.625)" color="#d8eeff">{icon(k['center'], '', 256)}</g>
<rect x="-112" y="-1.5" width="224" height="3" rx="1.5" fill="url(#scan-{kind})"/>
<g fill="#a6d9ff"><circle cx="-205" cy="0" r="4"/><circle cx="0" cy="-205" r="3"/><circle cx="145" cy="145" r="4"/><circle cx="-120" cy="-140" r="3"/></g>
<g stroke="#a6d9ff" stroke-opacity=".45"><path d="M-205,0 L-290,-50 L-360,-24"/><path d="M-120,-140 L-180,-196 L-250,-186"/></g>
<g fill="#4fb3ff"><circle cx="-290" cy="-50" r="3"/><circle cx="-360" cy="-24" r="2.5"/><circle cx="-180" cy="-196" r="2.5"/></g>
<g font-family="Plus Jakarta Sans" font-size="11.5" font-weight="700" letter-spacing="1.3" fill="#d8eeff">{chips}</g>
</g></svg></div>"""


def build(src, tagline):
    html = (ROOT / "src" / src).read_text()
    html = re.sub(r"\{\{svg256:([\w-]+)\}\}", lambda m: icon(m.group(1), "", 256), html)
    html = html.replace("{{orbit-light}}", orbit_light())
    html = re.sub(r"\{\{scan:(\w+)\}\}", lambda m: scanart(m.group(1)), html)
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
