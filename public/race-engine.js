// Deterministic simulation shared by browser and server. 30 ticks per second.
export function createRace(seed){return {seed:seed>>>0,tick:0,lane:1,speed:26,mode:'coast',distance:0,time:45,hp:3,objects:[],nextId:1,invulnerable:0,lastMove:-20,done:false,pickups:0};}
function random(s){s.seed=(Math.imul(1664525,s.seed)+1013904223)>>>0;return s.seed/4294967296;}
export function stepRace(s,actions=[]){if(s.done)return s;for(const a of actions){if((a==='left'||a==='right')&&s.tick-s.lastMove>=4){s.lane=Math.max(0,Math.min(3,s.lane+(a==='left'?-1:1)));s.lastMove=s.tick;}else if(['gas','brake','coast'].includes(a))s.mode=a;}
 const target=s.mode==='gas'?46:s.mode==='brake'?14:28;s.speed+=(target-s.speed)*.035;s.distance+=s.speed/30;s.time-=1/30;if(s.invulnerable>0)s.invulnerable--;
 if(s.tick%34===0){const lane=Math.floor(random(s)*4),oil=random(s)<.2;s.objects.push({id:s.nextId++,lane,y:-30,type:oil?'oil':'car',velocity:lane<2?17:-9});}
 for(const o of s.objects){o.y+=(s.speed+o.velocity)*1.65/30;if(o.lane===s.lane&&o.y>356&&o.y<397&&!o.hit){o.hit=true;if(o.type==='oil'){s.time=Math.min(60,s.time+3);s.pickups++;}else if(!s.invulnerable){s.hp--;s.speed=14;s.invulnerable=45;}}}
 s.objects=s.objects.filter(o=>o.y<490&&!o.hit);s.tick++;s.done=s.hp<=0||s.time<=0||s.tick>=1800;return s;
}
