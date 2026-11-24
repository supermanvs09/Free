// Writes src/components/scenes/land.json: Natural Earth land (public domain, via
// the world-atlas package) sampled on a near-equal-area grid, as a flat array
// [lat*10, lon*10, ...] for the dotted globe. Needs three packages that the site
// itself does not:  npm i --no-save world-atlas@2 d3-geo@3 topojson-client@3
//   node tools/scenes/gen-land.mjs src/components/scenes/land.json 1.8
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoContains } from 'd3-geo';
const require = createRequire(import.meta.url);
const topo = JSON.parse(fs.readFileSync(require.resolve('world-atlas/land-50m.json')));
const land = feature(topo, topo.objects.land);
const step = +(process.argv[3] || 2);
const out = [];
for (let lat = -58; lat <= 80; lat += step) {
  const dl = step / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  for (let lon = -180; lon < 180; lon += dl) if (geoContains(land, [lon, lat])) out.push(Math.round(lat * 10), Math.round(lon * 10));
}
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log('dots', out.length / 2);
