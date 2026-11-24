// Bubu & Dudu: Adventure Run — mobile-first, single-player 2.5D canvas runner.
const $ = (s) => document.querySelector(s);
const canvas = $("#gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const menu = $("#menu"), stagePanel = $("#stagePanel"), winPanel = $("#winPanel");
const controls = $("#controls"), stageLabel = $("#stageLabel"), toastEl = $("#toast");
const stageNames = ["Forest Trail", "River Crossing", "Misty Mountains", "Ancient Ruins", "Neon City", "Sky-High Finale"];
const stageIcons = ["🌲", "🌊", "⛰️", "🏛️", "🌆", "🌈"];
const stageLength = 4.35;
let W = 900, H = 560, dpr = 1, last = 0, raf = 0;
let mode = "menu", selected = "bubu", unlocked = 1, totalStars = 0, completed = [];
let stage = 1, worldLength = 3900, cameraX = 0, elapsed = 0, stageStars = 0, hearts = 3, checkpointX = 0;
let lead = { x: 110, y: 0, vy: 0, grounded: true }, buddy = { x: 40, y: 0, vy: 0, grounded: true };
let moveInput = 0, jumpQueued = false, dashHeld = false, jumpBuffer = 0, coyote = 0;
let obstacles = [], pickups = [], particles = [], toastTimer = 0, lastClearSent = 0;
let soundOn = true, audioCtx = null, musicTimer = null, musicStep = 0;
const GROUND_RATIO = .73;
const PALETTES = [
  {sky1:"#8dc9a4",sky2:"#d8e8b2",far:"#5c9870",near:"#27583c",ground:"#315d3e",top:"#75a65b",accent:"#e5a45d",water:"#5dc7c0"},
  {sky1:"#79c4c0",sky2:"#d4e8c8",far:"#4b9b91",near:"#225b55",ground:"#315c4c",top:"#6cae87",accent:"#e49d64",water:"#39b8c5"},
  {sky1:"#a2c5d9",sky2:"#e9e3c8",far:"#718ba1",near:"#42586c",ground:"#455c50",top:"#8aa17a",accent:"#d98566",water:"#8ac8d4"},
  {sky1:"#d8b78a",sky2:"#f1dfb4",far:"#9d8867",near:"#66513b",ground:"#65523b",top:"#a48a5f",accent:"#df9d59",water:"#6eafb0"},
  {sky1:"#526c88",sky2:"#d08e83",far:"#41546b",near:"#253d4a",ground:"#354a43",top:"#78926b",accent:"#ff9c68",water:"#65c4cb"},
  {sky1:"#a4b5e3",sky2:"#f4c9a5",far:"#8d91c1",near:"#58648e",ground:"#4b5872",top:"#a6a3a0",accent:"#ffbf76",water:"#8bd7d0"},
];

function stableId(){let id=localStorage.getItem("bubu-dudu-player");if(!id){id=Math.random().toString(36).slice(2,10);localStorage.setItem("bubu-dudu-player",id)}return id}
const pid=stableId();
const room=new URLSearchParams(location.search).get("room")||`adventure-${pid}`;
let socket=null, reconnect=0, serverReady=false;
function localSave(){try{localStorage.setItem("bubu-dudu-save",JSON.stringify({selected,unlocked,totalStars,completed}))}catch{}}
function loadSave(){try{const s=JSON.parse(localStorage.getItem("bubu-dudu-save")||"{}");selected=s.selected==="dudu"?"dudu":"bubu";unlocked=Math.max(1,Math.min(6,Number(s.unlocked)||1));totalStars=Math.max(0,Number(s.totalStars)||0);completed=Array.isArray(s.completed)?s.completed:[]}catch{}}
loadSave();
// Standalone GitHub Pages edition: no room server required.
function send(_action) {}

function resize(){const rect=canvas.getBoundingClientRect();W=Math.max(320,rect.width);H=Math.max(260,rect.height);dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);if(mode==="playing")buildStage(stage,true)}
window.addEventListener("resize",resize);window.addEventListener("orientationchange",()=>setTimeout(resize,180));

function showToast(text){toastEl.textContent=text;toastEl.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove("show"),1600)}
function updateHUD(){ $("#starCount").textContent=`☆ ${totalStars}`; }
function showOnly(which){menu.classList.toggle("hidden",which!=="menu");stagePanel.classList.toggle("hidden",which!=="stages");winPanel.classList.toggle("hidden",which!=="win");controls.classList.toggle("visible",which==="playing");stageLabel.classList.toggle("hidden",which!=="playing");$("#pauseBtn").classList.toggle("hidden",which!=="playing"&&which!=="paused")}
function selectCharacter(name){selected=name;document.querySelectorAll(".bear-card").forEach(b=>b.classList.toggle("selected",b.dataset.character===name));send({type:"select",character:name});localSave();speak(name==="bubu"?"Bubu!":"Dudu!");}
document.querySelectorAll(".bear-card").forEach(b=>b.addEventListener("click",()=>selectCharacter(b.dataset.character)));
$("#startBtn").addEventListener("click",()=>{audioStart();mode="stages";renderStageGrid();showOnly("stages")});
$("#backMenu").addEventListener("click",()=>{mode="menu";showOnly("menu")});
function renderStageGrid(){const grid=$("#stageGrid");grid.innerHTML="";stageNames.forEach((name,i)=>{const n=i+1,done=completed.includes(n),locked=n>unlocked;const b=document.createElement("button");b.className="stage-card"+(n===stage?" current":"");b.disabled=locked;b.innerHTML=`<span class="stage-emoji">${locked?"🔒":stageIcons[i]}</span><strong class="stage-name">${String(n).padStart(2,"0")} · ${name}</strong><span class="stage-sub">${done?"✓ Cleared":locked?"Locked":"Tap to play"}</span>`;b.addEventListener("click",()=>{audioStart();startStage(n)});grid.append(b)})}
function startStage(n){stage=n;mode="playing";stageStars=0;hearts=3;elapsed=0;lastClearSent=0;buildStage(n,false);lead={x:W*.22,y:0,vy:0,grounded:true};buddy={x:W*.12,y:0,vy:0,grounded:true};cameraX=0;particles=[];showOnly("playing");$("#stageLabel").textContent=`STAGE ${String(n).padStart(2,"0")} · ${stageNames[n-1].toUpperCase()}`;speak(selected==="bubu"?"Bubu, let's go!":"Dudu, let's go!");}
function buildStage(n,keepPosition){const oldX=lead.x;worldLength=W*stageLength;const types=[
  ["log","gap","crate","log","gap","spinner"],
  ["crate","gap","swing","gap","log","spinner"],
  ["gap","rock","log","gap","swing","rock"],
  ["crate","gap","spikes","log","gap","spinner"],
  ["log","gap","crate","swing","gap","spikes"],
  ["gap","spinner","rock","gap","swing","spikes"],
][n-1];
  obstacles=types.map((type,i)=>({type,x:worldLength*(.17+i*.112),w:type==="gap"?W*.105:W*(type==="swing"?.07:.065),h:type==="crate"?W*.075:type==="rock"?W*.065:type==="spikes"?W*.055:W*.045,phase:i*.9}));
  pickups=[.29,.53,.78].map((p,i)=>({x:worldLength*p,y:0,got:false,phase:i*1.7}));
  checkpointX=0;if(keepPosition)lead.x=oldX;
}
function openWin(){if(mode!=="playing")return;mode="win";showOnly("win");const stars=Math.max(1,stageStars);const already=completed.includes(stage);if(!already){totalStars+=stars;completed=[...completed,stage];unlocked=Math.max(unlocked,Math.min(6,stage+1));localSave();send({type:"clear",stage,stars})}$("#winStars").textContent="⭐ ".repeat(stars).trim();$("#winMessage").textContent=`${selected==="bubu"?"Bubu":"Dudu"} led the way and your buddy made it too! You collected ${stageStars} bonus stars.`;$("#nextBtn").textContent=stage<6?"NEXT STAGE ➜":"PLAY AGAIN ↻";$("#nextBtn").onclick=()=>{if(stage<6)startStage(stage+1);else{mode="stages";renderStageGrid();showOnly("stages")}};speak("Yay! Stage complete!");updateHUD();}
$("#replayBtn").addEventListener("click",()=>startStage(stage));$("#stageMenuBtn").addEventListener("click",()=>{mode="stages";renderStageGrid();showOnly("stages")});
$("#pauseBtn").addEventListener("click",()=>{if(mode==="playing"){mode="paused";showToast("Paused · tap play to continue");$("#pauseBtn").textContent="▶"}else if(mode==="paused"){mode="playing";$("#pauseBtn").textContent="Ⅱ"}});

// Sound is synthesized locally, so the game has no external audio dependencies.
function audioStart(){if(!soundOn)return;if(!audioCtx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audioCtx=new AC()}if(audioCtx.state==="suspended")audioCtx.resume();if(!musicTimer){musicStep=0;musicTimer=setInterval(()=>{if(mode!=="playing"||!soundOn||!audioCtx)return;const seq=[392,494,587,494,440,523,659,523,392,494,587,784,659,587,494,440];const f=seq[musicStep++%seq.length];tone(f,.17,"triangle",.035);if(musicStep%4===0)tone(f/2,.28,"sine",.018)},360)}}
function tone(freq,duration,wave="sine",volume=.05){if(!audioCtx||!soundOn)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=wave;o.frequency.value=freq;g.gain.setValueAtTime(.0001,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(volume,audioCtx.currentTime+.018);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration+.03)}
function sfx(kind){if(!soundOn)return;audioStart();if(kind==="jump"){tone(240,.09,"sine",.045);setTimeout(()=>tone(440,.12,"triangle",.03),45)}else if(kind==="star"){tone(660,.1,"sine",.05);setTimeout(()=>tone(880,.16,"sine",.04),70)}else if(kind==="hit"){tone(130,.18,"sawtooth",.035)}else if(kind==="win"){[523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,.22,"triangle",.04),i*110))}}
function speak(text){if(!soundOn||!("speechSynthesis"in window))return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=.92;u.pitch=1.3;u.volume=.8;speechSynthesis.speak(u)}catch{}}
$("#soundBtn").addEventListener("click",()=>{soundOn=!soundOn;$("#soundBtn").textContent=soundOn?"♫":"♪̸";if(soundOn)audioStart();else{if(musicTimer){clearInterval(musicTimer);musicTimer=null}if(window.speechSynthesis)speechSynthesis.cancel()}});

// Touch joystick and keyboard share the same input values.
const base=$("#stickBase"),knob=$("#stickKnob");let stickPointer=null;
function setStick(e){const r=base.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.34,len=Math.hypot(dx,dy)||1,mag=Math.min(max,len);moveInput=Math.max(-1,Math.min(1,dx/max));knob.style.left=`calc(50% + ${dx/len*mag}px)`;knob.style.top=`calc(50% + ${dy/len*mag}px)`}
function resetStick(){stickPointer=null;moveInput=0;knob.style.left="50%";knob.style.top="50%"}
base.addEventListener("pointerdown",e=>{stickPointer=e.pointerId;base.setPointerCapture(e.pointerId);setStick(e)});base.addEventListener("pointermove",e=>{if(e.pointerId===stickPointer)setStick(e)});base.addEventListener("pointerup",e=>{if(e.pointerId===stickPointer)resetStick()});base.addEventListener("pointercancel",resetStick);
function doJump(){if(mode!=="playing")return;jumpBuffer=.16;audioStart()}
$("#jumpBtn").addEventListener("pointerdown",e=>{e.preventDefault();doJump();$("#jumpBtn").style.transform="scale(.94)"});["pointerup","pointercancel","pointerleave"].forEach(ev=>$("#jumpBtn").addEventListener(ev,()=>$("#jumpBtn").style.transform=""));
$("#dashBtn").addEventListener("pointerdown",e=>{e.preventDefault();dashHeld=true});["pointerup","pointercancel","pointerleave"].forEach(ev=>$("#dashBtn").addEventListener(ev,()=>dashHeld=false));
const keys=new Set();window.addEventListener("keydown",e=>{if(["ArrowLeft","ArrowRight","ArrowUp","Space","KeyA","KeyD","KeyW"].includes(e.code))e.preventDefault();keys.add(e.code);if((e.code==="Space"||e.code==="ArrowUp"||e.code==="KeyW")&&!e.repeat)doJump();if(e.code==="Escape"&&mode==="playing")$("#pauseBtn").click()});window.addEventListener("keyup",e=>keys.delete(e.code));window.addEventListener("blur",()=>{keys.clear();resetStick();dashHeld=false});

function groundY(){return H*GROUND_RATIO}
function jumpBear(b,force){if(b.grounded||force){b.vy=-H*.79;b.grounded=false}}
function hitObstacle(){hearts--;sfx("hit");if(hearts<=0){showToast("Let's try that trail again!");hearts=3;lead.x=Math.max(W*.22,checkpointX);buddy.x=lead.x-W*.09}else{lead.x=Math.max(W*.22,checkpointX);buddy.x=lead.x-W*.09}lead.y=buddy.y=0;lead.vy=buddy.vy=0;lead.grounded=buddy.grounded=true;}
function update(dt){elapsed+=dt;const left=keys.has("ArrowLeft")||keys.has("KeyA"),right=keys.has("ArrowRight")||keys.has("KeyD");let axis=moveInput+(right?1:0)-(left?1:0);axis=Math.max(-1,Math.min(1,axis));const speed=W*(dashHeld||keys.has("ShiftLeft")? .63:.43);lead.x=Math.max(0,lead.x+axis*speed*dt);if(axis===0)lead.x=Math.max(0,lead.x+W*.28*dt);jumpBuffer=Math.max(0,jumpBuffer-dt);coyote=lead.grounded?.11:Math.max(0,coyote-dt);if(jumpBuffer>0&&(lead.grounded||coyote>0)){jumpBear(lead,true);jumpBuffer=0;sfx("jump");}
  lead.vy+=H*2.25*dt;lead.y+=lead.vy*dt;if(lead.y>=0){lead.y=0;lead.vy=0;lead.grounded=true;coyote=.11}
  const targetX=lead.x-W*.095;buddy.x+=(targetX-buddy.x)*Math.min(1,dt*7);if(lead.vy< -20&&buddy.grounded){buddy._jumpDelay=(buddy._jumpDelay??.18)-dt;if(buddy._jumpDelay<=0){jumpBear(buddy,true);buddy._jumpDelay=.18}}else if(lead.grounded){buddy._jumpDelay=.18}
  buddy.vy+=H*2.25*dt;buddy.y+=buddy.vy*dt;if(buddy.y>=0){buddy.y=0;buddy.vy=0;buddy.grounded=true}
  // Gap detection and obstacle collision apply to both bears.
  const groundAt=x=>{const gap=obstacles.find(o=>o.type==="gap"&&x>o.x&&x<o.x+o.w);return !gap};
  for(const b of [lead,buddy]){if(!groundAt(b.x)&&b.y===0){b._fall=(b._fall||0)+dt;if(b._fall>.14){hitObstacle();return}}else b._fall=0;
    const hit=obstacles.find(o=>o.type!=="gap"&&Math.abs(b.x-(o.x+o.w/2))<o.w*.48&&b.y> -o.h*.68);if(hit&&b._hitCooldown<=0){b._hitCooldown=.85;hitObstacle();return}b._hitCooldown=Math.max(0,(b._hitCooldown||0)-dt)}
  for(const p of pickups){if(!p.got&&Math.abs(lead.x-p.x)<W*.055&&Math.abs(lead.y+H*.1)<H*.17){p.got=true;stageStars=Math.min(3,stageStars+1);sfx("star");for(let i=0;i<12;i++)particles.push({x:p.x,y:groundY()+lead.y-H*.12,vx:(Math.random()-.5)*W*.45,vy:-Math.random()*H*.6,life:.7,color:"#ffe18b"})}}
  if(lead.x>worldLength*.52&&checkpointX<worldLength*.45){checkpointX=worldLength*.48;showToast("Checkpoint saved!")}cameraX=Math.max(0,Math.min(worldLength-W*.72,lead.x-W*.3));if(lead.x>worldLength-W*.28){sfx("win");openWin();}
  particles=particles.filter(p=>p.life>0);particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=H*.8*dt;p.life-=dt});
}

function roundedRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
function drawBackground(){const pal=PALETTES[stage-1]||PALETTES[0],g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,pal.sky1);g.addColorStop(1,pal.sky2);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  const sunX=W*.78,sunY=H*.19;const glow=ctx.createRadialGradient(sunX,sunY,2,sunX,sunY,W*.22);glow.addColorStop(0,"rgba(255,242,190,.72)");glow.addColorStop(1,"rgba(255,242,190,0)");ctx.fillStyle=glow;ctx.fillRect(0,0,W,H*.58);
  ctx.fillStyle=pal.far;ctx.beginPath();ctx.moveTo(0,H*.55);for(let x=0;x<=W+30;x+=30)ctx.lineTo(x,H*.39+Math.sin((x+cameraX*.12)*.009)*H*.055+Math.cos(x*.017)*H*.018);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();
  ctx.fillStyle=pal.near;ctx.beginPath();ctx.moveTo(0,H*.65);for(let x=0;x<=W+20;x+=20)ctx.lineTo(x,H*.51+Math.sin((x+cameraX*.24)*.012)*H*.05);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();
  for(let i=0;i<13;i++){const x=((i*137-cameraX*.34)%(W+180)+W+180)%(W+180)-70,y=H*(.43+(i%3)*.055),sz=H*(.11+(i%4)*.015);drawTree(x,y,sz,pal.near,.7)}
  if(stage===2||stage===6){ctx.fillStyle=pal.water;ctx.globalAlpha=.42;ctx.beginPath();ctx.moveTo(0,H*.67);ctx.quadraticCurveTo(W*.4,H*.58,W,H*.69);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();ctx.globalAlpha=1}
}
function drawTree(x,y,s,color,a=1){ctx.save();ctx.globalAlpha=a;ctx.fillStyle="#574737";ctx.fillRect(x-s*.06,y-s*.25,s*.12,s*.65);ctx.fillStyle=color;for(let k=0;k<3;k++){ctx.beginPath();ctx.moveTo(x,y-s*(1.05-k*.27));ctx.lineTo(x-s*(.45-k*.1),y-s*(.22-k*.12));ctx.lineTo(x+s*(.45-k*.1),y-s*(.22-k*.12));ctx.closePath();ctx.fill()}ctx.restore()}
function drawGround(){const pal=PALETTES[stage-1];const gy=groundY();for(let x=Math.floor(cameraX/(W*.14))*W*.14;x<cameraX+W*1.2;x+=W*.14){const sx=x-cameraX;const gap=obstacles.some(o=>o.type==="gap"&&x>o.x&&x<o.x+o.w);if(gap)continue;ctx.fillStyle=pal.ground;ctx.fillRect(sx,gy,W*.16,H-gy);ctx.fillStyle=pal.top;ctx.fillRect(sx,gy,W*.16,H*.025);ctx.fillStyle="rgba(255,255,255,.07)";ctx.fillRect(sx,gy+H*.025,W*.16,2);for(let k=0;k<4;k++){ctx.fillStyle="rgba(16,36,24,.22)";ctx.beginPath();ctx.ellipse(sx+W*(.02+k*.038),gy+H*(.07+(k%2)*.035),W*.008,H*.006,0,0,Math.PI*2);ctx.fill()}}
}
function drawObstacle(o){const x=o.x-cameraX,gy=groundY();if(x<-W*.2||x>W*1.2)return;ctx.save();if(o.type==="gap"){ctx.fillStyle="#132b28";ctx.fillRect(x,gy,o.w,H-gy);ctx.fillStyle="rgba(7,18,17,.55)";ctx.fillRect(x,gy,o.w,H*.08);ctx.restore();return}
  if(o.type==="log"){ctx.fillStyle="#76503a";roundedRect(ctx,x,gy-o.h*.72,o.w,o.h*.72,o.h*.3);ctx.fill();ctx.strokeStyle="#b27b4d";ctx.lineWidth=3;ctx.stroke();ctx.strokeStyle="#4e3428";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+o.w*.18,gy-o.h*.36,o.h*.12,o.h*.23,0,0,Math.PI*2);ctx.stroke()}
  else if(o.type==="crate"){ctx.fillStyle="#9a6742";roundedRect(ctx,x,gy-o.h,o.w,o.h,6);ctx.fill();ctx.strokeStyle="#d6a16a";ctx.lineWidth=3;ctx.stroke();ctx.strokeStyle="#64432f";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x+5,gy-o.h+5);ctx.lineTo(x+o.w-5,gy-5);ctx.moveTo(x+o.w-5,gy-o.h+5);ctx.lineTo(x+5,gy-5);ctx.stroke()}
  else if(o.type==="rock"){ctx.fillStyle="#778b7a";ctx.beginPath();ctx.moveTo(x,gy);ctx.lineTo(x+o.w*.18,gy-o.h*.72);ctx.lineTo(x+o.w*.6,gy-o.h);ctx.lineTo(x+o.w,gy-o.h*.55);ctx.lineTo(x+o.w*.92,gy);ctx.closePath();ctx.fill();ctx.strokeStyle="#b1c4a8";ctx.lineWidth=2;ctx.stroke()}
  else if(o.type==="spikes"){ctx.fillStyle="#d77d65";for(let i=0;i<4;i++){const sx=x+i*o.w/4;ctx.beginPath();ctx.moveTo(sx,gy);ctx.lineTo(sx+o.w/8,gy-o.h);ctx.lineTo(sx+o.w/4,gy);ctx.fill()}}
  else if(o.type==="spinner"){const a=elapsed*2+o.phase,cx=x+o.w/2,cy=gy-o.h*.75;ctx.save();ctx.translate(cx,cy);ctx.rotate(a);ctx.fillStyle="#e0a45f";roundedRect(ctx,-o.w*.5,-5,o.w,10,5);ctx.fill();ctx.fillStyle="#6c4d3b";ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.fill();ctx.restore()}
  else if(o.type==="swing"){const a=Math.sin(elapsed*2+o.phase)*.7,cx=x+o.w/2;ctx.strokeStyle="#e2d2a9";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx,gy-o.h*2.2);ctx.lineTo(cx+Math.sin(a)*o.w*.8,gy-o.h*.25);ctx.stroke();ctx.fillStyle="#d07e53";ctx.beginPath();ctx.arc(cx+Math.sin(a)*o.w*.8,gy-o.h*.25,o.h*.28,0,Math.PI*2);ctx.fill()}
  ctx.restore()}
function drawPickups(){const gy=groundY();for(const p of pickups){if(p.got)continue;const x=p.x-cameraX,y=gy-H*.13+Math.sin(elapsed*3+p.phase)*H*.012;if(x<-30||x>W+30)continue;ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(elapsed*2+p.phase)*.15);ctx.shadowColor="#ffe08a";ctx.shadowBlur=14;ctx.fillStyle="#ffdc79";ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?W*.012:W*.025;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.restore()}}
function drawBear(b,color,leadBear){const x=b.x-cameraX,y=groundY()+b.y,scale=Math.max(34,Math.min(W*.105,70)),bob=b.grounded?Math.sin(elapsed*11+(leadBear?0:1.2))*scale*.018:0;ctx.save();ctx.translate(x,y+bob);const brown=color==="brown",fur=brown?"#85543a":"#eee5d1",fur2=brown?"#4c2e22":"#c8b99d",muzzle=brown?"#c99a78":"#fff2db",eye=brown?"#21150f":"#382e27";
  // soft ground shadow
  ctx.fillStyle="rgba(7,18,12,.3)";ctx.beginPath();ctx.ellipse(0,3,scale*.48,scale*.12,0,0,Math.PI*2);ctx.fill();
  ctx.translate(0,-scale*.03);const bodyY=-scale*.43;
  // back paws
  ctx.fillStyle=fur2;ctx.beginPath();ctx.ellipse(-scale*.22,-scale*.13+Math.max(0,Math.sin(elapsed*12+(leadBear?0:1))*scale*.06),scale*.17,scale*.13,-.18,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(scale*.2,-scale*.13-Math.max(0,Math.sin(elapsed*12+(leadBear?0:1))*scale*.06),scale*.17,scale*.13,.18,0,Math.PI*2);ctx.fill();
  // torso and arms
  const bodyGrad=ctx.createLinearGradient(-scale*.35,-scale*.75,scale*.3,0);bodyGrad.addColorStop(0,fur);bodyGrad.addColorStop(1,fur2);ctx.fillStyle=bodyGrad;ctx.beginPath();ctx.ellipse(0,bodyY,scale*.36,scale*.38,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=fur2;ctx.beginPath();ctx.ellipse(scale*.27,-scale*.47,scale*.12,scale*.2,-.45,0,Math.PI*2);ctx.fill();
  // head and ears
  ctx.fillStyle=fur;ctx.beginPath();ctx.arc(-scale*.25,-scale*.92,scale*.16,0,Math.PI*2);ctx.arc(scale*.25,-scale*.92,scale*.16,0,Math.PI*2);ctx.fill();ctx.fillStyle=muzzle;ctx.beginPath();ctx.arc(-scale*.25,-scale*.92,scale*.08,0,Math.PI*2);ctx.arc(scale*.25,-scale*.92,scale*.08,0,Math.PI*2);ctx.fill();
  const head=ctx.createRadialGradient(-scale*.18,-scale*1.1,scale*.04,0,-scale*.93,scale*.55);head.addColorStop(0,fur);head.addColorStop(1,fur2);ctx.fillStyle=head;ctx.beginPath();ctx.ellipse(0,-scale*.94,scale*.42,scale*.43,0,0,Math.PI*2);ctx.fill();
  // muzzle, cheeks, eyes and nose
  ctx.fillStyle=muzzle;ctx.beginPath();ctx.ellipse(scale*.11,-scale*.81,scale*.22,scale*.17,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=brown?"#d68d83":"#e9a4a0";ctx.globalAlpha=.48;ctx.beginPath();ctx.arc(-scale*.2,-scale*.8,scale*.07,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  ctx.fillStyle=eye;ctx.beginPath();ctx.arc(-scale*.12,-scale*.99,scale*.035,0,Math.PI*2);ctx.arc(scale*.18,-scale*.99,scale*.035,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(-scale*.13,-scale*1.005,scale*.012,0,Math.PI*2);ctx.arc(scale*.17,-scale*1.005,scale*.012,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=eye;ctx.beginPath();ctx.ellipse(scale*.09,-scale*.84,scale*.06,scale*.04,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle=eye;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(scale*.09,-scale*.8);ctx.quadraticCurveTo(scale*.1,-scale*.74,scale*.17,-scale*.77);ctx.stroke();
  // tiny fur glints
  ctx.strokeStyle=brown?"rgba(255,222,190,.28)":"rgba(255,255,255,.7)";ctx.lineWidth=1.3;for(let i=0;i<7;i++){const fx=-scale*.22+i*scale*.07;ctx.beginPath();ctx.moveTo(fx,-scale*1.15+Math.sin(i*3)*scale*.025);ctx.lineTo(fx+scale*.035,-scale*1.11);ctx.stroke()}
  // neck scarf on lead bear, follower has matching collar
  if(leadBear){ctx.fillStyle=selected==="bubu"?"#d98b61":"#7fc0a2";ctx.beginPath();ctx.moveTo(-scale*.2,-scale*.65);ctx.lineTo(scale*.22,-scale*.65);ctx.lineTo(scale*.15,-scale*.54);ctx.lineTo(-scale*.1,-scale*.55);ctx.closePath();ctx.fill()}
  ctx.restore()}
function drawRope(){const x1=buddy.x-cameraX+W*.018,y1=groundY()+buddy.y-H*.075,x2=lead.x-cameraX-W*.025,y2=groundY()+lead.y-H*.075;ctx.save();ctx.strokeStyle="#5a3e2a";ctx.lineWidth=Math.max(3,W*.006);ctx.lineCap="round";ctx.beginPath();ctx.moveTo(x1,y1);ctx.quadraticCurveTo((x1+x2)/2,y1+H*.04,x2,y2);ctx.stroke();ctx.strokeStyle="#d8b58a";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x1,y1-1);ctx.quadraticCurveTo((x1+x2)/2,y1+H*.04-1,x2,y2-1);ctx.stroke();ctx.restore()}
function drawFinish(){const x=worldLength-cameraX,gy=groundY();if(x<-40||x>W+80)return;ctx.strokeStyle="#f6d98e";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x,gy);ctx.lineTo(x,gy-H*.48);ctx.stroke();ctx.fillStyle="#f6d98e";ctx.beginPath();ctx.moveTo(x,gy-H*.48);ctx.lineTo(x+W*.15,gy-H*.42);ctx.lineTo(x,gy-H*.36);ctx.fill();ctx.fillStyle="#264432";ctx.font=`900 ${Math.max(10,W*.018)}px system-ui`;ctx.fillText("FINISH",x+8,gy-H*.4)}
function drawParticles(){for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/.7);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x-cameraX,p.y,3,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1}
function drawHUD(){if(mode!=="playing"&&mode!=="paused")return;const barW=W*.3;ctx.fillStyle="rgba(6,22,15,.52)";roundedRect(ctx,W*.35,72,barW,8,5);ctx.fill();ctx.fillStyle="#f4d17c";roundedRect(ctx,W*.35,72,barW*Math.max(0,lead.x/worldLength),8,5);ctx.fill();ctx.font=`800 ${Math.max(10,W*.018)}px system-ui`;ctx.fillStyle="#f6f3e8";ctx.fillText(`${Math.max(0,Math.min(100,Math.round(lead.x/worldLength*100)))}%`,W*.35+barW+8,80);ctx.fillText("♥ ".repeat(hearts),W*.06,82);ctx.fillStyle="#ffe08a";ctx.fillText(`★ ${stageStars}/3`,W*.84,82)}
function render(){ctx.clearRect(0,0,W,H);drawBackground();drawGround();for(const o of obstacles)drawObstacle(o);drawPickups();drawFinish();drawRope();const leadColor=selected==="bubu"?"cream":"brown",buddyColor=selected==="bubu"?"brown":"cream";drawBear(buddy,buddyColor,false);drawBear(lead,leadColor,true);drawParticles();drawHUD();if(mode==="paused"){ctx.fillStyle="#06150eb8";ctx.fillRect(0,0,W,H);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font=`900 ${W*.055}px system-ui`;ctx.fillText("PAUSED",W/2,H/2);ctx.textAlign="left"}}
function loop(t){const dt=Math.min(.032,(t-last)/1000||0);last=t;if(mode==="playing")update(dt);render();raf=requestAnimationFrame(loop)}
resize();updateHUD();raf=requestAnimationFrame(loop);
