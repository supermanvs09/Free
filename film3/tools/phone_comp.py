"""Screen replacement for green-screen phone footage.
Per frame: key the green, take the screen region, fit its four corners, smooth them over time,
warp the rendered app screen into place and composite it under the fingers, with the screen's own
shading carried onto the interface so it sits in the light of the shot.
Usage: python phone_comp.py <clip.mp4> <in> <dur> <ui-frames-dir|test> <out-dir> [dark]"""
import os, sys, glob
import numpy as np, cv2
clip, t_in, dur, ui_dir, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4], sys.argv[5]
dark = len(sys.argv) > 6 and sys.argv[6] == 'dark'
os.makedirs(out, exist_ok=True)
cap = cv2.VideoCapture(clip); fps = cap.get(cv2.CAP_PROP_FPS)
frames = []
n_out = int(round(dur * 30))
for k in range(n_out):  # resample to 30 fps by nearest source frame
    cap.set(cv2.CAP_PROP_POS_MSEC, (t_in + k / 30) * 1000)
    ok, f = cap.read()
    if not ok: f = frames[-1]
    frames.append(cv2.resize(f, (1920, 1080), interpolation=cv2.INTER_LANCZOS4))
def mask_of(f):
    hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
    lo = (35, 60, 35) if dark else (35, 90, 70)
    m = cv2.inRange(hsv, lo, (90, 255, 255))
    b, g, r = [f[..., i].astype(np.int16) for i in range(3)]
    m &= (((g - np.maximum(r, b)) > (12 if dark else 25)) * 255).astype(np.uint8)
    return cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
def quad_of(m):
    cs, _ = cv2.findContours(cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8)), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea); h = cv2.convexHull(c)
    per = cv2.arcLength(h, True)
    for eps in np.linspace(0.01, 0.12, 40):
        a = cv2.approxPolyDP(h, eps * per, True)
        if len(a) == 4: break
    if len(a) != 4: a = cv2.boxPoints(cv2.minAreaRect(c)).reshape(-1, 1, 2)
    p = a.reshape(4, 2).astype(np.float32)
    s = p.sum(1); d = np.diff(p, axis=1).ravel()   # order: tl, tr, br, bl
    return np.array([p[np.argmin(s)], p[np.argmin(d)], p[np.argmax(s)], p[np.argmax(d)]], np.float32), cv2.contourArea(c)
masks = [mask_of(f) for f in frames]
Q = []
for m in masks:
    q, area = quad_of(m); Q.append(q)
Q = np.array(Q)
# temporal smoothing: median of 5, then a light moving average; fingers can pull a corner for a frame or two
Qs = Q.copy()
for i in range(len(Q)):
    a, b = max(0, i - 3), min(len(Q), i + 4); Qs[i] = np.median(Q[a:b], axis=0)
Qm = Qs.copy()
for i in range(len(Q)):
    a, b = max(0, i - 1), min(len(Q), i + 2); Qm[i] = Qs[a:b].mean(0)
uis = sorted(glob.glob(os.path.join(ui_dir, '*.jpg'))) if ui_dir != 'test' else None
for i, f in enumerate(frames):
    q = Qm[i]; c0 = q.mean(0); q = (c0 + (q - c0) * 1.02).astype(np.float32)   # the fit sits just inside the glass; push it to the edge
    W = int(np.linalg.norm(q[1] - q[0])); H = int(np.linalg.norm(q[3] - q[0]))
    if uis: ui = cv2.imread(uis[min(i, len(uis) - 1)])
    else:
        ui = np.full((1920, 1080, 3), 245, np.uint8); [cv2.line(ui, (0, y), (1080, y), (200, 120, 40), 3) for y in range(0, 1920, 120)]; cv2.putText(ui, 'TEST', (300, 1000), cv2.FONT_HERSHEY_SIMPLEX, 6, (40, 40, 40), 12)
    uh, uw = ui.shape[:2]
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [uw, 0], [uw, uh], [0, uh]]), q)
    warped = cv2.warpPerspective(ui, M, (1920, 1080), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    # alpha: the keyed green inside the screen quad; fingers and bezel stay
    region = np.zeros((1080, 1920), np.uint8); cv2.fillConvexPoly(region, q.astype(np.int32), 255)
    # anti-aliased screen edge: the polygon drawn with sub-pixel corners
    raa = np.zeros((1080, 1920), np.uint8); cv2.fillConvexPoly(raa, np.round(q * 16).astype(np.int32), 255, cv2.LINE_AA, 4)
    m = masks[i].copy()
    ff = f.astype(np.int16); gex = ff[..., 1] - np.maximum(ff[..., 0], ff[..., 2])
    m |= ((gex > 6) & (region > 0)).astype(np.uint8) * 255      # inside the glass, any green tint is screen
    # occluders are what is left inside the glass: fingers are wide, edge slivers and tracking marks are not
    occ = cv2.bitwise_and(cv2.bitwise_not(m), cv2.dilate(region, np.ones((5, 5), np.uint8)))   # a little past the edge, so the AA rim sits under fingers too
    occ0 = occ
    occ = cv2.morphologyEx(occ, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(occ)
    for j in range(1, n):
        if st[j, cv2.CC_STAT_AREA] < 1500: occ[lab == j] = 0
    occ = cv2.bitwise_and(occ0, cv2.dilate(occ, np.ones((41, 41), np.uint8)))   # give the fingers back their full outline
    occ = cv2.GaussianBlur(cv2.dilate(occ, np.ones((3, 3), np.uint8)).astype(np.float32) / 255, (5, 5), 0)
    m = cv2.bitwise_and(region, cv2.bitwise_not((occ > 0.5).astype(np.uint8) * 255))
    a = (raa.astype(np.float32) / 255) * (1 - occ)
    # green the corner fit missed (rounded corners, an edge the thumb pulled in) still gets the screen,
    # extended from the interface's own edge
    near = cv2.dilate(region, np.ones((25, 25), np.uint8))
    kg = cv2.bitwise_and(cv2.dilate(masks[i], np.ones((3, 3), np.uint8)), near)
    if not dark: a = np.maximum(a, cv2.GaussianBlur(kg.astype(np.float32) / 255, (5, 5), 0))
    a = a[..., None]
    # carry the screen's shading (reflections, falloff) onto the interface, gently
    v = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)[..., 2].astype(np.float32)
    mf = (m > 0).astype(np.float32); vs = cv2.blur(v * mf, (81, 81)) / (cv2.blur(mf, (81, 81)) + 1e-3)   # smooth shading, no tracking marks
    vin = vs[m > 0]; vn = (vs / (np.percentile(vin, 90) + 1e-3)).clip(0.7, 1.1)[..., None] if vin.size else 1
    lit = np.clip(warped.astype(np.float32) * (0.82 + 0.18 * vn), 0, 255)
    # despill: pull green out of the edge pixels that stay (bezel and finger edges)
    g = f.astype(np.float32); mx = np.maximum(g[..., 2], g[..., 0]); g[..., 1] = np.minimum(g[..., 1], mx * 1.0 + 2)
    o = lit * a + g * (1 - a)
    cv2.imwrite(os.path.join(out, f'f{i + 1:04d}.jpg'), o.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
print('frames', len(frames), 'quad0', Qm[0].round(1).tolist())
