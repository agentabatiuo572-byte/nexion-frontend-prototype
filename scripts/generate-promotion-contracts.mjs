import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root=process.env.NEXGRID_BACKEND_ROOT;
if(!root)throw new Error('NEXGRID_BACKEND_ROOT must identify the reviewed backend checkout');
const bytes=readFileSync(path.join(root,'docs/specs/growth-promotions/openapi.json'));
const schemas=JSON.parse(bytes).components.schemas;
const roots=['PublicPromotion','PublicPromotionPage','Quote','QuoteInput','ExpectedReward','Reward','RewardPage','ReferralProgress','OrderReceipt','CommandReceipt'];
const used=new Set();
function type(s){
  if(s.$ref){const name=s.$ref.split('/').at(-1);collect(name);return name;}
  if(s.const!==undefined)return JSON.stringify(s.const);
  if(s.enum)return s.enum.map(v=>JSON.stringify(v)).join(' | ');
  if(s.oneOf||s.anyOf)return '('+(s.oneOf||s.anyOf).map(type).join(' | ')+')';
  if(Array.isArray(s.type))return s.type.map(t=>type({...s,type:t})).join(' | ');
  if(s.type==='object')return '{ '+Object.entries(s.properties||{}).map(([k,v])=>JSON.stringify(k)+(s.required?.includes(k)?'': '?')+': '+type(v)).join('; ')+' }';
  if(s.type==='array')return 'Array<'+type(s.items)+'>';
  return ({integer:'number',number:'number',boolean:'boolean',string:'string',null:'null'})[s.type]||'unknown';
}
const declarations=new Map();
function collect(name){if(used.has(name))return;used.add(name);if(!schemas[name])throw new Error('Missing '+name);declarations.set(name,type(schemas[name]));}
roots.forEach(collect);
const output='// Generated from the reviewed OpenAPI. Run scripts/generate-promotion-contracts.mjs; no business calculations.\n// Source SHA256: '+createHash('sha256').update(bytes).digest('hex')+'\n'+[...declarations].map(([k,v])=>'export type '+k+' = '+v+';').join('\n')+'\n';
const destination=new URL('../src/api/promotion-contracts.ts',import.meta.url);
if(process.argv.includes('--check')){if(readFileSync(destination,'utf8')!==output)throw new Error('Promotion contract types have drifted');}
else writeFileSync(destination,output);
