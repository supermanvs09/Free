"""Search free-licence footage (Coverr, Mixkit) for real, non-AI, non-premium clips.
Writes <out>/cands.json and downloads 360-px thumbnails for review.
Usage: python find_footage.py <out-dir> "query one" "query two" ..."""
import json, os, re, sys, urllib.request, urllib.parse, concurrent.futures as cf
out, qs = sys.argv[1], sys.argv[2:]
os.makedirs(os.path.join(out, 'th'), exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/124 Safari/537.36'}
def get(u):
    try: return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read()
    except Exception as e: return b''
path = os.path.join(out, 'cands.json')
C = json.load(open(path)) if os.path.exists(path) else {}
def coverr(q):
    s = get('https://coverr.co/s?q=' + urllib.parse.quote(q)).decode('utf-8', 'ignore')
    m = re.search(r'<script id="ng-state" type="application/json">(.*?)</script>', s, re.S)
    if not m: return []
    res = []
    def walk(o):
        if isinstance(o, dict):
            if 'urls' in o and 'title' in o and isinstance(o.get('urls'), dict) and o['urls'].get('mp4'):
                if not o.get('isAiGenerated') and not o.get('isPremium') and not o.get('isVertical'):
                    res.append({'id': 'cv_' + o['id'], 'src': 'coverr', 'title': o['title'].strip(), 'desc': (o.get('description') or '')[:160], 'dur': float(o.get('duration') or 0),
                                'w': o.get('maxWidth'), 'mp4': o['urls']['mp4'], 'prev': o['urls'].get('mp4Preview'), 'thumb': o.get('thumbnail'), 'page': 'https://coverr.co/videos/' + o.get('slug', ''), 'q': q})
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(json.loads(m.group(1)))
    return res
def mixkit(q):
    s = get('https://mixkit.co/free-stock-video/' + re.sub(r'[^a-z0-9]+', '-', q.lower()).strip('-') + '/').decode('utf-8', 'ignore')
    res = []
    for slug, vid in re.findall(r'href="/free-stock-video/([a-z0-9-]+)-(\d+)/"', s):
        res.append({'id': 'mk_' + vid, 'src': 'mixkit', 'title': slug.replace('-', ' '), 'desc': '', 'dur': 0, 'w': None,
                    'mp4': f'https://assets.mixkit.co/videos/{vid}/{vid}-1080.mp4', 'mp4_4k': f'https://assets.mixkit.co/videos/{vid}/{vid}-2160.mp4',
                    'prev': f'https://assets.mixkit.co/videos/{vid}/{vid}-360.mp4', 'thumb': f'https://assets.mixkit.co/videos/{vid}/{vid}-thumb-360-0.jpg',
                    'page': f'https://mixkit.co/free-stock-video/{slug}-{vid}/', 'q': q})
    return res
with cf.ThreadPoolExecutor(8) as ex:
    for res in ex.map(lambda q: coverr(q) + mixkit(q), qs):
        for r in res:
            if r['id'] not in C: C[r['id']] = r
            elif r['q'] not in C[r['id']]['q']: C[r['id']]['q'] += ' | ' + r['q']
json.dump(C, open(path, 'w'), indent=0)
def th(r):
    p = os.path.join(out, 'th', r['id'] + '.jpg')
    if not os.path.exists(p):
        b = get(r['thumb'].replace('width=640', 'width=480') if r['thumb'] else '')
        if b: open(p, 'wb').write(b)
with cf.ThreadPoolExecutor(12) as ex: list(ex.map(th, C.values()))
print(len(C), 'candidates')
