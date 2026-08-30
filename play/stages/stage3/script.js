(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const W = 320;
  const H = 224;
  const SCALE = canvas.width / W;

  const minimap = $('#minimap');
  const mctx = minimap.getContext('2d');
  mctx.imageSmoothingEnabled = false;

  const manifest = {
    bg: 'images/battle_bg_hd.png',
    hero: 'images/shibata_spritesheet.png',
    enemy: 'images/enemy_spritesheet.png',
    portrait: 'images/portrait.png',
  };
  const images = {};

  const HERO_FW = 96, HERO_FH = 96, HERO_COLS = 5;
  const SOLDIER_FW = 80, SOLDIER_FH = 64, SOLDIER_COLS = 5;

  const heroAnim = {
    idle:   { frames:[0,1], ms:190, loop:true },
    walk:   { frames:[2,3,4,5], ms:95, loop:true },
    attack: { frames:[6,7,8,9,10], ms:76, loop:false },
    kakare: { frames:[11,12,13,14,15,16], ms:88, loop:false },
  };
  const enemyAnim = { idle:[0,1], walk:[2,3,4,5], attack:[6,7], hit:[8], down:[9] };

  const controls = window.KAKARE_CONFIG ? KAKARE_CONFIG.load() : {
    up:['ArrowUp','KeyW'], down:['ArrowDown','KeyS'], left:['ArrowLeft','KeyA'], right:['ArrowRight','KeyD'], attack:['Space','KeyJ'], pause:['KeyP','Escape']
  };
  const pressedCodes = new Set();
  const keys = {up:false,down:false,left:false,right:false};
  const isBound = (code, action) => (controls[action] || []).includes(code);
  function syncMoveKeys(){
    keys.up = controls.up.some(code => pressedCodes.has(code));
    keys.down = controls.down.some(code => pressedCodes.has(code));
    keys.left = controls.left.some(code => pressedCodes.has(code));
    keys.right = controls.right.some(code => pressedCodes.has(code));
  }

  const BEST_KEY = 'kakare_shibata_stage3_best_kills_v1';
  function loadBest(){
    try { return Math.max(0, Number(localStorage.getItem(BEST_KEY) || 0) || 0); }
    catch(e){ return 0; }
  }
  function saveBest(v){
    try { localStorage.setItem(BEST_KEY, String(v)); }
    catch(e){}
  }

  const game = {
    started:false,
    paused:false,
    sound:true,
    audio:null,
    kills:0,
    specials:0,
    elapsed:0,
    best:loadBest(),
    bestAtStart:0,
    spawnTimer:0,
    shake:0,
    flash:0,
    specialQueued:false,
  };

  let player = null;
  let enemies = [];
  let effects = [];
  let last = 0;
  let raf = 0;
  let enemyId = 0;

  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const rand = (a,b) => Math.random()*(b-a)+a;
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

  function formatTime(sec){
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec/60);
    const s = sec%60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function loadAll(){
    return Promise.all(Object.entries(manifest).map(([key,src]) => new Promise((resolve,reject) => {
      const img = new Image();
      img.onload = () => { images[key] = img; resolve(); };
      img.onerror = reject;
      img.src = src;
    })));
  }

  function initAudio(){
    if(game.audio) return;
    try { game.audio = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e){ game.sound = false; }
  }
  function tone(freq,d=.06,type='square',vol=.02){
    if(!game.sound || !game.audio) return;
    const t = game.audio.currentTime;
    const o = game.audio.createOscillator();
    const g = game.audio.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g).connect(game.audio.destination); o.start(t); o.stop(t+d);
  }

  function newPlayer(){
    return {x:150,y:180,hp:100,morale:0,facing:1,anim:'idle',frame:0,timer:0,transient:false,attackLock:0,inv:0,speedX:75,speedY:53};
  }

  function resetBattle(){
    player = newPlayer();
    enemies = [];
    effects = [];
    enemyId = 0;
    game.kills = 0;
    game.specials = 0;
    game.elapsed = 0;
    game.spawnTimer = 0;
    game.shake = 0;
    game.flash = 0;
    game.specialQueued = false;
    game.best = loadBest();
    game.bestAtStart = game.best;
    for(let i=0;i<5;i++) spawnEnemy(true);
    updateHudDom();
    updateAttackButton();
    drawMinimap();
  }

  // 0:00=5体 → 0:45=6 → 1:30=7 ... とじわじわ増える。上限14体。
  function enemyTargetCount(){
    return Math.min(14, 5 + Math.floor(game.elapsed / 45));
  }

  function spawnEnemy(initial=false){
    // 左右が主軸、上下は少しだけ。
    const roll = Math.random();
    let x,y,spawnSide;
    if(roll < .41){
      spawnSide='left'; x=initial?rand(8,72):rand(-12,16); y=rand(146,209);
    }else if(roll < .82){
      spawnSide='right'; x=initial?rand(246,314):rand(304,334); y=rand(146,209);
    }else if(roll < .91){
      spawnSide='top'; x=rand(35,285); y=initial?rand(137,145):rand(131,139);
    }else{
      spawnSide='bottom'; x=rand(35,285); y=initial?rand(207,214):rand(214,221);
    }
    enemies.push({
      id:enemyId++,x,y,spawnSide,hp:54,state:'walk',frame:Math.floor(rand(0,4)),timer:rand(0,80),attackCd:rand(.42,1.05),hitTime:0,downTime:0,speed:rand(28,39),dead:false
    });
  }

  function ensureEnemies(dt){
    game.spawnTimer -= dt;
    const desired = enemyTargetCount();
    const living = enemies.reduce((n,e)=>n+(!e.dead?1:0),0);
    if(living < desired && game.spawnTimer <= 0){
      spawnEnemy(false);
      // 必殺後も一気に全補充せず、少しずつ戻す。
      game.spawnTimer = Math.max(.45, .68 - game.elapsed/1800);
    }
  }

  function setHeroAnim(name,transient=false){
    if(player.transient && !transient) return;
    if(player.anim===name && !transient) return;
    player.anim=name; player.frame=0; player.timer=0; player.transient=transient;
  }
  function finishHeroTransient(){ player.transient=false; setHeroAnim('idle'); }

  function attack(){
    if(!game.started || game.paused) return;
    if(player.morale >= 100){
      if(player.attackLock>0 || player.transient){ game.specialQueued=true; updateHudDom(); return; }
      special(); return;
    }
    if(player.attackLock>0 || player.transient) return;

    player.attackLock=.34;
    setHeroAnim('attack',true);
    tone(430,.05,'square',.027);
    const hitX=player.x+player.facing*45;
    let hitAny=false;

    for(const e of enemies){
      if(e.dead) continue;
      const dx=e.x-player.x, dy=Math.abs(e.y-player.y);
      const facingOK=player.facing>0?dx>-14:dx<14;
      if(facingOK && Math.abs(e.x-hitX)<54 && dy<31){
        e.hp-=20; e.hitTime=.13; e.state='hit'; e.x+=player.facing*10; hitAny=true;
        if(player.morale<100) player.morale=clamp(player.morale+7,0,100);
        effects.push({type:'spark',x:e.x,y:e.y-27,life:.16});
        if(e.hp<=0) killEnemy(e,false);
      }
    }
    effects.push({type:'slash',x:player.x+player.facing*34,y:player.y-32,facing:player.facing,life:.15});
    if(hitAny){ game.shake=.08; tone(620,.045,'square',.018); }
    else tone(310,.04,'triangle',.014);
    updateHudDom(); updateAttackButton();
  }

  function special(){
    game.specialQueued=false;
    player.morale=0;
    player.attackLock=.78;
    player.inv=.92;
    setHeroAnim('kakare',true);
    game.specials++;
    game.shake=.44;
    game.flash=.12;
    $('#specialText').classList.add('active');
    setTimeout(()=>$('#specialText').classList.remove('active'),520);
    tone(170,.17,'sawtooth',.032); setTimeout(()=>tone(350,.14,'square',.025),95);
    effects.push({type:'ring',x:player.x,y:player.y-28,life:.48});
    effects.push({type:'dust',x:player.x,y:player.y-4,life:.55});
    for(const e of enemies){
      if(!e.dead && dist(player,e)<92){ e.hp=0; e.x+=Math.sign(e.x-player.x||1)*18; killEnemy(e,true); }
    }
    updateHudDom(); updateAttackButton();
  }

  function killEnemy(e,bySpecial){
    if(e.dead) return;
    e.dead=true; e.state='down'; e.downTime=.46;
    game.kills++;
    if(!bySpecial && player.morale<100) player.morale=clamp(player.morale+12,0,100);
    effects.push({type:'burst',x:e.x,y:e.y-22,life:.24});
    tone(680,.04,'square',.016);
    updateHudDom(); updateAttackButton();
  }

  function updatePlayer(dt){
    player.attackLock=Math.max(0,player.attackLock-dt);
    player.inv=Math.max(0,player.inv-dt);
    let dx=0,dy=0;
    if(!player.transient){ if(keys.left)dx--; if(keys.right)dx++; if(keys.up)dy--; if(keys.down)dy++; }
    if(dx||dy){
      const l=Math.hypot(dx,dy)||1; dx/=l; dy/=l;
      player.x=clamp(player.x+dx*player.speedX*dt,28,292);
      player.y=clamp(player.y+dy*player.speedY*dt,143,209);
      if(dx) player.facing=dx>0?1:-1;
      if(player.morale<100) player.morale=clamp(player.morale+dt*4.7,0,100);
      setHeroAnim('walk');
    }else if(!player.transient){
      if(player.morale<100) player.morale=clamp(player.morale-dt*.42,0,100);
      setHeroAnim('idle');
    }
    const a=heroAnim[player.anim]; player.timer+=dt*1000;
    if(player.timer>=a.ms){
      player.timer-=a.ms; player.frame++;
      if(player.frame>=a.frames.length){ if(a.loop)player.frame=0; else finishHeroTransient(); }
    }
    if(game.specialQueued && player.morale>=100 && player.attackLock<=0 && !player.transient) special();
  }

  function updateEnemies(dt){
    for(const e of enemies){
      if(e.dead){ e.downTime-=dt; continue; }
      if(e.hitTime>0){ e.hitTime-=dt; e.state='hit'; continue; }
      const dx=player.x-e.x, dy=player.y-e.y, l=Math.hypot(dx,dy)||1;
      e.attackCd-=dt;
      if(l<32 && Math.abs(dy)<25){
        e.state='attack';
        if(e.attackCd<=0){
          e.attackCd=rand(.76,1.04);
          if(player.inv<=0){
            player.hp-=9; player.inv=.43;
            if(player.morale<100) player.morale=clamp(player.morale-9,0,100);
            game.shake=.16; game.flash=.08;
            effects.push({type:'hurt',x:player.x,y:player.y-34,life:.18});
            tone(105,.1,'sawtooth',.026);
          }
        }
      }else{
        e.state='walk';
        const sep=l<53?.42:1;
        e.x+=dx/l*e.speed*dt*sep;
        e.y+=dy/l*e.speed*dt*.66*sep;
        e.x=clamp(e.x,15,312); e.y=clamp(e.y,143,211);
      }
      e.timer+=dt*1000;
      const arr=enemyAnim[e.state]||enemyAnim.walk;
      const ms=e.state==='attack'?155:110;
      if(e.timer>=ms){ e.timer-=ms; e.frame=(e.frame+1)%arr.length; }
    }
    enemies=enemies.filter(e=>!(e.dead&&e.downTime<=0));
  }

  function updateEffects(dt){
    for(const f of effects) f.life-=dt;
    effects=effects.filter(f=>f.life>0);
    game.shake=Math.max(0,game.shake-dt);
    game.flash=Math.max(0,game.flash-dt);
  }

  function finishRun(){
    player.hp=0;
    game.started=false;
    cancelAnimationFrame(raf);
    const oldBest=game.bestAtStart;
    const newBest=Math.max(oldBest,game.kills);
    if(newBest>game.best){ game.best=newBest; saveBest(newBest); }
    else if(game.kills>oldBest){ game.best=game.kills; saveBest(game.kills); }
    $('#resultKills').textContent=game.kills;
    $('#resultBest').textContent=Math.max(oldBest,game.kills);
    $('#resultTime').textContent=formatTime(game.elapsed);
    $('#resultSpecials').textContent=`${game.specials}回`;
    $('#recordBadge').classList.toggle('active',game.kills>oldBest);
    updateHudDom();
    $('#gameOverOverlay').classList.add('active');
  }

  function checkState(){
    if(player.hp<=0){ finishRun(); return false; }
    return true;
  }

  function drawFrame(img,index,fw,fh,cols,x,y,w,h,flip=false,alpha=1){
    const sx=(index%cols)*fw, sy=Math.floor(index/cols)*fh;
    ctx.save(); ctx.globalAlpha=alpha;
    if(flip){ ctx.translate(x+w,0); ctx.scale(-1,1); ctx.drawImage(img,sx,sy,fw,fh,0,y,w,h); }
    else ctx.drawImage(img,sx,sy,fw,fh,x,y,w,h);
    ctx.restore();
  }
  function shadow(x,y,w=18){ ctx.save(); ctx.fillStyle='rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x,y,w,5,0,0,Math.PI*2); ctx.fill(); ctx.restore(); }

  function drawWorld(){
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(images.bg,0,0,canvas.width,canvas.height);
    ctx.save(); ctx.setTransform(SCALE,0,0,SCALE,0,0);
    const sx=game.shake>0?(Math.random()-.5)*3:0, sy=game.shake>0?(Math.random()-.5)*2:0; ctx.translate(sx,sy);
    const actors=[];
    for(const e of enemies){
      actors.push({y:e.y,draw:()=>{
        shadow(e.x,e.y,14);
        const arr=enemyAnim[e.state]||enemyAnim.walk;
        const fi=e.dead?9:arr[Math.min(e.frame,arr.length-1)];
        // 元スプライトは右向き。勝家より右にいる敵は反転し、刃先を勝家側へ向ける。
        drawFrame(images.enemy,fi,SOLDIER_FW,SOLDIER_FH,SOLDIER_COLS,e.x-28,e.y-51,56,45,e.x>player.x,e.hitTime>0?.65:1);
      }});
    }
    actors.push({y:player.y+1,draw:()=>{
      shadow(player.x,player.y,20);
      const arr=heroAnim[player.anim].frames, fi=arr[Math.min(player.frame,arr.length-1)];
      const blink=player.inv>0&&Math.floor(performance.now()/70)%2===0;
      if(!blink) drawFrame(images.hero,fi,HERO_FW,HERO_FH,HERO_COLS,player.x-47,player.y-84,94,94,player.facing<0,1);
    }});
    actors.sort((a,b)=>a.y-b.y).forEach(a=>a.draw());
    drawEffects(); ctx.restore();
    if(game.flash>0){ ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle=`rgba(255,65,42,${game.flash*1.55})`; ctx.fillRect(0,0,canvas.width,canvas.height); }
    drawMinimap();
  }

  function drawEffects(){
    for(const f of effects){
      if(f.type==='slash'){
        ctx.save(); ctx.translate(f.x,f.y); if(f.facing<0)ctx.scale(-1,1); ctx.globalAlpha=Math.min(1,f.life*7);
        ctx.strokeStyle='#fff6d5';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,34,-1.05,1.05);ctx.stroke();
        ctx.strokeStyle='#ffb62d';ctx.lineWidth=5;ctx.globalAlpha*=.78;ctx.beginPath();ctx.arc(0,0,40,-1.05,1.05);ctx.stroke();ctx.restore();
      }else if(f.type==='ring'){
        ctx.save();ctx.globalAlpha=Math.min(1,f.life*2.6);const t=1-f.life/.48,r=50+t*55;
        ctx.strokeStyle='#ffbf27';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(f.x,f.y,r,24+t*18,0,0,Math.PI*2);ctx.stroke();
        ctx.strokeStyle='#fff3bd';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(f.x,f.y,r-7,18+t*15,0,0,Math.PI*2);ctx.stroke();ctx.restore();
      }else if(f.type==='spark'||f.type==='burst'||f.type==='hurt'){
        ctx.save();ctx.globalAlpha=Math.min(1,f.life*6);ctx.fillStyle=f.type==='hurt'?'#ff5040':'#fff1a2';
        for(let i=0;i<7;i++){const a=i*Math.PI*2/7;ctx.fillRect(f.x+Math.cos(a)*10,f.y+Math.sin(a)*8,3,2);}ctx.restore();
      }else if(f.type==='dust'){
        ctx.save();ctx.globalAlpha=Math.min(1,f.life*2);ctx.fillStyle='#d5b07b';for(let i=0;i<12;i++)ctx.fillRect(f.x-34+i*6,f.y+(i%3)*3,7,4);ctx.restore();
      }
    }
  }

  function drawMinimap(){
    if(!player) return;
    const MW=minimap.width,MH=minimap.height; mctx.clearRect(0,0,MW,MH); mctx.fillStyle='rgba(18,13,10,.9)';mctx.fillRect(0,0,MW,MH);
    mctx.strokeStyle='rgba(191,151,78,.38)';mctx.lineWidth=1;
    for(let i=1;i<4;i++){mctx.beginPath();mctx.moveTo(i*MW/4,0);mctx.lineTo(i*MW/4,MH);mctx.stroke();mctx.beginPath();mctx.moveTo(0,i*MH/4);mctx.lineTo(MW,i*MH/4);mctx.stroke();}
    const mapX=x=>8+(x/W)*(MW-16), mapY=y=>8+((y-140)/76)*(MH-16);
    for(const e of enemies){if(!e.dead){mctx.fillStyle='#d23c32';mctx.fillRect(mapX(e.x)-3,mapY(e.y)-3,6,6);}}
    mctx.fillStyle='#ffe16b';mctx.fillRect(mapX(player.x)-4,mapY(player.y)-4,8,8);
  }

  function updateHudDom(){
    if(!player) return;
    const hp=clamp(player.hp,0,100), morale=clamp(player.morale,0,100);
    $('#hpBar').style.width=`${hp}%`; $('#moraleBar').style.width=`${morale}%`;
    $('#hpValue').textContent=Math.ceil(hp); $('#moraleValue').textContent=Math.floor(morale);
    $('#hudKills').textContent=game.kills; $('#bigKills').textContent=game.kills;
    $('#pressureValue').textContent=enemyTargetCount(); $('#timeValue').textContent=formatTime(game.elapsed);
    $('#bestValue').textContent=Math.max(game.best,game.kills);
    $('#moraleReady').classList.toggle('active',morale>=100);
  }
  function updateAttackButton(){
    if(!player) return;
    const ready=player.morale>=100; const btn=$('#attackBtn'); btn.textContent=ready?'かかれ':'斬'; btn.classList.toggle('ready',ready);
  }

  function update(dt){
    if(!game.started||game.paused) return;
    game.elapsed+=dt;
    ensureEnemies(dt);
    updatePlayer(dt); updateEnemies(dt); updateEffects(dt); updateAttackButton(); updateHudDom();
  }

  function loop(ts){
    const dt=Math.min((ts-last)/1000||0,.033); last=ts; update(dt); drawWorld(); if(game.started&&checkState()) raf=requestAnimationFrame(loop);
  }

  function startBattle(){
    resetBattle(); game.started=true; game.paused=false;
    $('#startOverlay').classList.remove('active'); $('#gameOverOverlay').classList.remove('active'); $('#pauseText').classList.remove('active');
    last=performance.now(); cancelAnimationFrame(raf); raf=requestAnimationFrame(loop);
  }

  $('#startBtn').onclick=()=>{initAudio();if(game.audio?.state==='suspended')game.audio.resume();startBattle();};
  $('#retryBtn').onclick=startBattle;
  $('#titleBtn').onclick=()=>KAKARE_NAV.go('title','../../title/index.html');
  $('#pauseBtn').onclick=()=>{if(!game.started)return;game.paused=!game.paused;$('#pauseText').classList.toggle('active',game.paused);};
  $('#soundBtn').onclick=()=>{initAudio();game.sound=!game.sound;$('#soundBtn').textContent=game.sound?'♪ ON':'♪ OFF';};
  $('#attackBtn').onpointerdown=e=>{e.preventDefault();attack();};

  addEventListener('keydown',e=>{
    const relevant=['up','down','left','right','attack','pause'].some(action=>isBound(e.code,action));
    if(relevant)e.preventDefault(); pressedCodes.add(e.code); syncMoveKeys();
    if(isBound(e.code,'attack')&&!e.repeat)attack();
    if(isBound(e.code,'pause')&&!e.repeat)$('#pauseBtn').click();
  },{passive:false});
  addEventListener('keyup',e=>{pressedCodes.delete(e.code);syncMoveKeys();});
  $$('.pad').forEach(btn=>{
    const dir=btn.dataset.dir; const on=e=>{e.preventDefault();keys[dir]=true;}; const off=e=>{e.preventDefault();keys[dir]=false;};
    btn.addEventListener('pointerdown',on);btn.addEventListener('pointerup',off);btn.addEventListener('pointercancel',off);btn.addEventListener('pointerleave',off);
  });

  loadAll().then(()=>{resetBattle();drawWorld();}).catch(err=>console.error(err));
})();
