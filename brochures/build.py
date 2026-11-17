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


def build(src, tagline):
    html = (ROOT / "src" / src).read_text()
    html = re.sub(r"\{\{svg256:([\w-]+)\}\}", lambda m: icon(m.group(1), "", 256), html)
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


if __name__ == "__main__":
    main()
