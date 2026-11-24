#!/usr/bin/env bash
# Joins the recorded segments into one MP4 with chapters.
#   tools/walkthrough/make-video.sh <frames-dir> <out.mp4>
# Each segment is a folder of f00000.jpg… frames plus chapters.json (record.mjs);
# intro.png and devices.png come from cards.mjs.
set -euo pipefail
F=${1:-walkthrough-frames}; OUT=${2:-walkthrough.mp4}
HERE=$(cd "$(dirname "$0")" && pwd)
FPS=30; XF=0.5
ORDER=$(node -e "import('$HERE/script.mjs').then(m=>console.log(m.ORDER.join(' ')))")
TMP=$(mktemp -d)
enc() { ffmpeg -loglevel error -y "$@" -c:v libx264 -preset medium -crf 14 -pix_fmt yuv420p -r $FPS "$TMP/$SEG.mp4"; }

# intro card: 3.5 s, fades in from black
SEG=intro; enc -loop 1 -t 3.5 -framerate $FPS -i "$F/intro.png" -vf "fade=in:0:20"
LIST=(intro)
for SEG in $ORDER; do
  if [ "$SEG" = devices ]; then
    # phone (780x1688 frames) and tablet (820x1180) side by side on the backdrop
    enc -loop 1 -framerate $FPS -i "$F/devices.png" -framerate $FPS -i "$F/phone/f%05d.jpg" -framerate $FPS -i "$F/tablet/f%05d.jpg" -filter_complex \
      "[1]scale=-2:900,pad=iw+16:ih+16:8:8:color=0x2a3446[ph];[2]scale=-2:900,pad=iw+16:ih+16:8:8:color=0x2a3446[tb];[0][ph]overlay=300+(444-overlay_w)/2:84:shortest=1[a];[a][tb]overlay=880+(740-overlay_w)/2:84:shortest=1"
  else
    enc -framerate $FPS -i "$F/$SEG/f%05d.jpg"
  fi
  LIST+=("$SEG")
done

# join with short cross-fades, and write chapters
INPUTS=(); FILTER=""; PREV="[0:v]"; OFF=0; META="$TMP/meta.txt"
echo ";FFMETADATA1" > "$META"; : > "${OUT%.mp4}-chapters.txt"
for i in "${!LIST[@]}"; do
  INPUTS+=(-i "$TMP/${LIST[$i]}.mp4")
  D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP/${LIST[$i]}.mp4")
  START=$OFF
  node -e "
    const fs=require('fs');const seg='${LIST[$i]}',start=$START,d=$D;
    let ch=[];try{ch=JSON.parse(fs.readFileSync('$F/'+seg+'/chapters.json')).chapters}catch{}
    if(seg==='intro')ch=[{t:0,text:'Introduction'}]; if(seg==='devices')ch=[{t:0,text:'Phone and tablet'}];
    const fmt=(s)=>{s=Math.round(s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
    ch.forEach((c,k)=>{const a=start+c.t,b=k+1<ch.length?start+ch[k+1].t:start+d-$XF;
      fs.appendFileSync('$META','[CHAPTER]\nTIMEBASE=1/1000\nSTART='+Math.round(a*1000)+'\nEND='+Math.round(b*1000)+'\ntitle='+c.text+(c.sub?' — '+c.sub:'')+'\n');
      fs.appendFileSync('${OUT%.mp4}-chapters.txt',fmt(a)+'  '+c.text+(c.sub?' — '+c.sub:'')+'\n');});"
  if [ "$i" -gt 0 ]; then
    FILTER+="${PREV}[$i:v]xfade=transition=fade:duration=$XF:offset=$(node -e "console.log(($OFF).toFixed(3))")[v$i];"
    PREV="[v$i]"
  fi
  OFF=$(node -e "console.log($OFF + $D - $XF)")
done
ffmpeg -loglevel error -y "${INPUTS[@]}" -i "$META" -filter_complex "${FILTER%;}" -map "$PREV" -map_metadata ${#LIST[@]} -map_chapters ${#LIST[@]} \
  -c:v libx264 -preset slow -crf 20 -tune animation -pix_fmt yuv420p -movflags +faststart "$OUT"
rm -rf "$TMP"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
