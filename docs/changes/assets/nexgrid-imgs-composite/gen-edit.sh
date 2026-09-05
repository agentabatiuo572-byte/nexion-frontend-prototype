#!/usr/bin/env bash
# gen-edit.sh <box|rack> — OpenAI images/edits(gpt-image-2)重生成品牌字样
# 前提:Nexion-uniapp/.env.local 里有 OPENAI_API_KEY(或已 export);走系统代理(HTTP(S)_PROXY)。
# 输出 ai-<scene>-1/2.png 到本目录;人工核对拼写/细节后再替换 src/static/img/products/(旧图先移 .trash)。
# 注意:edits 接口会整图重绘(非仅遮罩区)——遮罩只约束"字样必须在哪";整图保真度需人工终检。
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../../../.." && pwd)"
KEY="${OPENAI_API_KEY:-$(sed -n 's/^OPENAI_API_KEY=//p' "$ROOT/.env.local")}"
[ -z "$KEY" ] && { echo "no OPENAI_API_KEY (env or $ROOT/.env.local)"; exit 1; }
SCENE="$1"

if [ "$SCENE" = "box" ]; then
  IMG="$DIR/box.png"; MASK="$DIR/mask-box.png"
  PROMPT='Photorealistic product shot of a black GPU tower PC, unchanged except the brand lettering. On the brushed-metal side panel the backlit logotype reads exactly "NEXGRID" - seven capital letters N,E,X,G,R,I,D - written vertically reading bottom-to-top, each letter rotated 90 degrees counterclockwise, wide squared techno font, bright lime-green backlit letters with subtle dark bevel edge and soft green glow spilling onto the brushed panel, filling the same vertical strip the previous logo occupied. The tiny glowing logo on the square AIO pump face also reads exactly "NEXGRID" in small lime-green capitals. Keep lighting, materials, composition and every other detail identical to the source image.'
else
  IMG="$DIR/rack.png"; MASK="$DIR/mask-rack.png"
  PROMPT='Photorealistic 2U rack-mount GPU server chassis, unchanged except the brand lettering. The glowing logotype on the black front mesh panel reads exactly "NEXGRID" - seven capital letters N,E,X,G,R,I,D - in bold squared industrial capitals, bright lime-green emissive letters with a soft green bloom lighting the surrounding mesh, letters upright with the baseline rising slightly toward the right following the panel perspective, same letter height and same central position on the panel as the previous logo. Keep lighting, materials, composition and every other detail identical to the source image.'
fi

curl -s --max-time 280 https://api.openai.com/v1/images/edits \
  -H "Authorization: Bearer $KEY" \
  -F "model=gpt-image-2" \
  -F "image=@$IMG" \
  -F "mask=@$MASK" \
  -F "prompt=$PROMPT" \
  -F "size=1024x1024" \
  -F "quality=high" \
  -F "n=2" \
  -o "$DIR/resp-$SCENE.json"

node -e "
const fs=require('fs');
const j=JSON.parse(fs.readFileSync('$DIR/resp-$SCENE.json','utf8'));
if(j.error){console.log('API ERROR:',JSON.stringify(j.error).slice(0,400));process.exit(1);}
j.data.forEach((d,i)=>{fs.writeFileSync('$DIR/ai-$SCENE-'+(i+1)+'.png',Buffer.from(d.b64_json,'base64'));console.log('saved ai-$SCENE-'+(i+1)+'.png');});
"
