'use strict';
(() => {
  const cfg = window.ARM_LAB_CONFIG;
  const $ = id => document.getElementById(id);
  const deg = Math.PI / 180;
  const limits = [[-180, 180], [-20, 110], [0, 150]];
  const names = ['base', 'shoulder', 'elbow'];
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const mul = (a, s) => a.map(v => v * s);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = a => mul(a, 1 / (Math.hypot(...a) || 1));
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const canvas = $('scene'), ctx = canvas.getContext('2d');
  const chart = $('chart'), chartCtx = chart.getContext('2d');
  const state = { angles: [...cfg.home], target: null, motion: null, demo: false, paused: false, demoIndex: 0, trail: [], history: [], message: '수동 조작 대기', queue: [], visited: new Set(), color: cfg.color || 'peach', gripOpen: false, tool: 'interact', blink: false };
  const checkpoints = [[2.2, .8, .6], [.6, 1.0, 2.2], [-2.0, 1.2, .8]];
  const palettes = {
    peach: ['#d0784b','#ec9a69','#b96a45','#df8957'],
    mint: ['#6d9e91','#a2cabc','#557e75','#83b3a2'],
    lilac: ['#9e87b6','#c5b3de','#7f6c99','#b2a0ca']
  };
  const camera = { yaw: -.65, pitch: .43, zoom: 1 };
  let width = 0, height = 0, chartWidth = 0, chartHeight = 0;
  let lastTime = null, lastSample = -Infinity, dirty = true;
  let sceneFaces = [];

  function forward(angles) {
    const [b, s, e] = angles.map(v => v * deg);
    const base = [0, cfg.baseHeight, 0];
    const vector = (length, angle) => [Math.cos(b)*Math.cos(angle)*length, Math.sin(angle)*length, Math.sin(b)*Math.cos(angle)*length];
    const elbow = add(base, vector(cfg.upperArm, s));
    const tip = add(elbow, vector(cfg.forearm, s-e));
    return { base, elbow, tip };
  }
  function valid(angles) {
    if (!angles.every((a, i) => Number.isFinite(a) && a >= limits[i][0] - 1e-7 && a <= limits[i][1] + 1e-7)) return false;
    const { elbow, tip } = forward(angles);
    return elbow[1] >= cfg.floorClearance && tip[1] >= cfg.floorClearance;
  }
  function inverse(target) {
    if (!target.every(Number.isFinite)) return null;
    const [x, y, z] = target;
    if (y < cfg.floorClearance) return null;
    const r = Math.hypot(x, z), dy = y - cfg.baseHeight;
    const c = (r*r + dy*dy - cfg.upperArm**2 - cfg.forearm**2) / (2*cfg.upperArm*cfg.forearm);
    if (c < -1-1e-9 || c > 1+1e-9) return null;
    const elbow = Math.acos(Math.max(-1, Math.min(1, c)));
    const shoulder = Math.atan2(dy, r) + Math.atan2(cfg.forearm*Math.sin(elbow), cfg.upperArm+cfg.forearm*Math.cos(elbow));
    const angles = [r < 1e-8 ? state.angles[0] : Math.atan2(z, x)/deg, shoulder/deg, elbow/deg];
    return valid(angles) ? angles : null;
  }
  function feedback(message, error = false) {
    $('feedback').textContent = message;
    $('feedback').classList.toggle('error', error);
  }
  function say(message) { $('bot-message').textContent = message; }
  function updateUI() {
    names.forEach((name, i) => {
      const slider = $('joint-' + name);
      slider.value = state.angles[i];
      slider.style.setProperty('--fill', ((state.angles[i]-limits[i][0])/(limits[i][1]-limits[i][0])*100) + '%');
      $('value-' + name).textContent = Math.round(state.angles[i]) + '°';
    });
    const tip = forward(state.angles).tip;
    ['x', 'y', 'z'].forEach((axis, i) => { $('pos-' + axis).textContent = (Math.abs(tip[i]) < .005 ? 0 : tip[i]).toFixed(2); });
    $('scene-state').textContent = state.paused ? 'SIMULATION PAUSED' : state.demo ? 'DEMO SEQUENCE' : state.motion ? 'MOVING TO POSE' : 'MANUAL CONTROL';
    $('model-status').textContent = state.paused ? '일시 정지' : state.motion ? '이동 중' : '준비 완료';
    $('motion-detail').textContent = state.message;
    $('play-label').textContent = state.paused ? '이어서 재생' : state.demo || state.motion ? '일시 정지' : '데모 재생';
    $('play-icon').textContent = !state.paused && (state.demo || state.motion) ? 'Ⅱ' : '▶';
  }
  function stop() { state.motion = null; state.demo = false; state.paused = false; state.queue = []; }
  function clearPreset() { document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active')); }
  function move(angles, label, preserveDemo = false) {
    // 관절 공간의 직선 보간 경로를 표본 검사합니다. 정밀 충돌 검사는 아닙니다.
    if (!valid(angles) || Array.from({ length: 61 }, (_, i) => lerp(state.angles, angles, i/60)).some(a => !valid(a))) {
      feedback('이 경로는 바닥 여유 높이 또는 관절 제한을 벗어납니다. 홈 자세에서 다시 시도하세요.', true);
      say('거긴 조금 어려워! 홈 자세에서 다시 해볼까?');
      return false;
    }
    if (!preserveDemo) stop();
    const maxAngle = Math.max(...angles.map((a, i) => Math.abs(a-state.angles[i])));
    state.motion = { from: [...state.angles], to: [...angles], elapsed: 0, duration: Math.max(.65, maxAngle/cfg.speedDegreesPerSecond*1.5) };
    state.message = label;
    state.paused = false;
    dirty = true;
    updateUI();
    return true;
  }
  names.forEach((name, i) => $('joint-' + name).addEventListener('input', event => {
    const next = [...state.angles]; next[i] = Number(event.target.value);
    stop(); clearPreset();
    state.target = null;
    if (valid(next)) {
      state.angles = next; state.message = '관절 직접 조작';
      say('관절이 움직이면 내 집게 위치도 달라져!');
      feedback('정기구학으로 말단 좌표를 계산하고 있습니다.');
    } else feedback('바닥 여유 높이 0.15 m를 확보할 수 없는 자세입니다.', true);
    dirty = true; updateUI();
  }));
  $('target-form').addEventListener('submit', event => {
    event.preventDefault();
    const target = ['x', 'y', 'z'].map(axis => Number($('target-' + axis).value));
    const angles = inverse(target);
    if (!angles) { feedback('도달할 수 없는 목표입니다. 작업 반경·관절 범위·바닥 높이를 확인하세요.', true); say('내 팔이 닿는 곳으로 조금만 옮겨 줘!'); return; }
    if (move(angles, '목표 좌표로 이동')) {
      clearPreset(); state.target = target;
      feedback('역기구학 계산 완료. 목표 좌표로 이동합니다.');
      say('좋아, 그 좌표로 가볼게!');
    }
    dirty = true;
  });
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    const preset = cfg.presets[button.dataset.preset];
    if (move(preset.angles, preset.label)) {
      clearPreset(); button.classList.add('active'); state.target = null;
      feedback(preset.label + '로 이동합니다. 관절 각도와 궤적을 관찰하세요.');
    }
  }));
  function nextDemo() {
    const keys = ['ready', 'reach', 'pick', 'place'];
    const preset = cfg.presets[keys[state.demoIndex % keys.length]];
    state.demoIndex++;
    if (!move(preset.angles, '데모 · ' + preset.label, true)) { stop(); updateUI(); }
  }
  $('play').addEventListener('click', () => {
    if (state.motion || state.demo) {
      state.paused = !state.paused;
      feedback(state.paused ? '움직임을 일시 정지했습니다.' : '움직임을 이어서 재생합니다.');
    } else {
      state.demo = true; state.demoIndex = 0; state.target = null; clearPreset(); nextDemo();
      feedback('준비 → 앞으로 뻗기 → 집기 접근 → 옮기기 순서로 반복합니다.');
    }
    updateUI(); dirty = true;
  });
  $('home').addEventListener('click', () => { if (move(cfg.home, '홈 자세로 이동')) { clearPreset(); state.target = null; feedback('기준 자세로 돌아갑니다.'); } });
  $('reset').addEventListener('click', () => {
    stop(); clearPreset(); state.angles = [...cfg.home]; state.target = null; state.trail = []; state.history = []; state.message = '수동 조작 대기'; state.visited.clear(); state.gripOpen = false;
    ['x', 'y', 'z'].forEach((axis, i) => { $('target-' + axis).value = [1.8, 1.4, 1][i]; });
    $('show-trail').checked = true; resetCamera();
    updateMission(); updateGrip(); say('다시 시작! 목표 A부터 톡 눌러볼래?');
    feedback('관절·목표 좌표·궤적·그래프를 초기화했습니다.'); dirty = true; updateUI();
  });
  $('show-trail').addEventListener('change', () => { dirty = true; });
  $('student-label').textContent = cfg.studentId;
  document.querySelectorAll('[data-bot-name]').forEach(el => { el.textContent = cfg.nickname || '아리'; });
  document.querySelectorAll('[data-color]').forEach(button => {
    const active = button.dataset.color === state.color;
    button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    button.addEventListener('click', () => {
      state.color = button.dataset.color;
      document.querySelectorAll('[data-color]').forEach(b => { const selected = b === button; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected)); });
      say('새 옷, 마음에 들어!'); dirty = true;
    });
  });
  function updateGrip() { $('grip').setAttribute('aria-pressed', String(state.gripOpen)); $('grip').textContent = state.gripOpen ? '집게 닫기' : '집게 열기'; }
  $('grip').addEventListener('click', () => { state.gripOpen = !state.gripOpen; updateGrip(); say(state.gripOpen ? '짜잔! 집게를 펼쳤어.' : '꼬옥! 실제 물체를 잡는 기능은 아니야.'); dirty = true; });
  $('wave').addEventListener('click', () => {
    stop(); clearPreset(); state.target = null;
    const poses = [[0,70,90],[-22,70,90],[22,70,90],[-22,70,90],[22,70,90],[...cfg.home]];
    if (move(poses[0], '인사하기')) { state.queue = poses.slice(1); say('안녕! 만나서 반가워 :)'); }
  });
  function updateMission() {
    document.querySelectorAll('[data-checkpoint]').forEach(b => { const done = state.visited.has(Number(b.dataset.checkpoint)); b.classList.toggle('done', done); b.setAttribute('aria-label', '목표 ' + String.fromCharCode(65 + Number(b.dataset.checkpoint)) + (done ? ' 완료, 다시 이동' : '로 이동')); });
    $('mission-score').textContent = state.visited.size + ' / 3';
  }
  function checkMission() {
    const tip = forward(state.angles).tip;
    checkpoints.forEach((point, i) => {
      if (!state.visited.has(i) && Math.hypot(...sub(point, tip)) < .08) {
        state.visited.add(i); updateMission(); dirty = true;
        say(state.visited.size === 3 ? '세 곳 모두 도착! 우리 꽤 좋은 팀인데?' : String.fromCharCode(65+i) + ' 도착! 다음 목표도 눌러 줘.');
      }
    });
  }
  function goToTarget(target, label = '화면에서 선택한 목표') {
    const angles = inverse(target);
    if (!angles) { feedback('이 위치는 작업 공간 밖입니다. 목표 마커 A·B·C를 눌러보세요.', true); say('앗, 거기는 내 팔이 닿지 않아!'); return false; }
    if (!move(angles, label)) return false;
    state.target = [...target]; clearPreset();
    ['x','y','z'].forEach((axis,i) => { $('target-'+axis).value = target[i].toFixed(2); });
    feedback('화면에서 선택한 위치를 역기구학으로 계산했습니다.'); say('알겠어, 저기로 가볼게!'); dirty = true;
    return true;
  }
  document.querySelectorAll('[data-checkpoint]').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.checkpoint); goToTarget(checkpoints[i], '작은 도전 · 목표 ' + String.fromCharCode(65+i)); }));
  document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => {
    state.tool = button.dataset.tool;
    document.querySelectorAll('[data-tool]').forEach(b => { const active = b === button; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    $('canvas-help').textContent = state.tool === 'interact' ? '집게 드래그 · 목표 클릭 · 스크롤 확대' : '드래그로 시점 회전 · 스크롤 확대';
    canvas.style.cursor = state.tool === 'interact' ? 'pointer' : 'grab';
  }));
  function setFocus(active) {
    $('playground').classList.toggle('focus-mode', active); document.body.classList.toggle('focus-open', active);
    $('focus-mode').setAttribute('aria-pressed', String(active)); $('focus-mode').querySelector('span').textContent = active ? '돌아가기' : '크게 보기';
    requestAnimationFrame(resize);
  }
  $('focus-mode').addEventListener('click', () => setFocus(!$('playground').classList.contains('focus-mode')));
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && $('playground').classList.contains('focus-mode')) { setFocus(false); $('focus-mode').focus(); } });
  $('export').addEventListener('click', () => {
    const data = { model: 'ARM-03', simulation: 'browser-kinematics-only', timestamp: new Date().toISOString(), units: { angles: 'degree', position: 'meter' }, linkLengths: { baseHeight: cfg.baseHeight, upperArm: cfg.upperArm, forearm: cfg.forearm }, joints: { base: state.angles[0], shoulder: state.angles[1], elbow: state.angles[2] }, endEffector: forward(state.angles).tip, target: state.target, color: state.color, gripperOpen: state.gripOpen, checkpointsReached: [...state.visited], samples: state.history.map(s => ({ seconds: s.time, angles: s.angles })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'arm-lab-state.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // 작은 직교 투영 렌더러. 외부 WebGL/네트워크 의존성 없이 동작합니다.
  function project(p) {
    const scale = Math.min(width/7.6, height/5.8)*camera.zoom;
    const horizontal = p[0]*Math.cos(camera.yaw)-p[2]*Math.sin(camera.yaw);
    const depth = p[0]*Math.sin(camera.yaw)+p[2]*Math.cos(camera.yaw);
    return [width*.45+horizontal*scale, height*.56+depth*Math.sin(camera.pitch)*scale-(p[1]-1.15)*Math.cos(camera.pitch)*scale];
  }
  function pointOnPlane(x, y, planeHeight) {
    const o = project([0,planeHeight,0]), px = project([1,planeHeight,0]), pz = project([0,planeHeight,1]);
    const a=px[0]-o[0], b=pz[0]-o[0], c=px[1]-o[1], d=pz[1]-o[1], det=a*d-b*c;
    if(Math.abs(det)<1e-5) return null;
    const sx=x-o[0], sy=y-o[1];
    return [(sx*d-b*sy)/det,planeHeight,(a*sy-sx*c)/det];
  }
  function line(points, color, lineWidth = 1, dash = []) {
    ctx.beginPath(); points.map(project).forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  }
  function polygon(points, color, stroke = '#1c262d') {
    ctx.beginPath(); points.map(project).forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath();
    ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = .6; ctx.stroke();
  }
  function face(points, color) {
    const mean = mul(points.reduce((a, p) => add(a, p), [0,0,0]), 1/points.length);
    const direction = [Math.sin(camera.yaw)*Math.cos(camera.pitch), Math.sin(camera.pitch), Math.cos(camera.yaw)*Math.cos(camera.pitch)];
    sceneFaces.push({ points, color, depth: dot(mean, direction) });
  }
  function boxBetween(a, b, halfWidth, halfDepth, colors) {
    const axis = unit(sub(b, a));
    const side = mul(unit(cross(axis, Math.abs(axis[1]) > .98 ? [1,0,0] : [0,1,0])), halfWidth);
    const other = mul(unit(cross(axis, side)), halfDepth);
    const corners = center => [add(add(center, side), other), add(sub(center, side), other), sub(sub(center, side), other), add(sub(center, other), side)];
    const v = [...corners(a), ...corners(b)];
    [[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].forEach((ids, i) => face(ids.map(j => v[j]), colors[i%colors.length]));
  }
  function cylinder(center, axis, radius, length, color) {
    axis = unit(axis);
    const side = unit(cross(axis, Math.abs(axis[1]) > .98 ? [1,0,0] : [0,1,0]));
    const up = cross(axis, side);
    const rings = [-1,1].map(sign => Array.from({ length: 16 }, (_, i) => add(add(center, mul(axis, sign*length/2)), add(mul(side, radius*Math.cos(i*Math.PI/8)), mul(up, radius*Math.sin(i*Math.PI/8))))));
    face(rings[0], color[0]); face(rings[1], color[1]);
    for (let i=0;i<16;i++) face([rings[0][i],rings[0][(i+1)%16],rings[1][(i+1)%16],rings[1][i]], color[i%color.length]);
  }
  function labelAt(p, text, color, offsetX = 0, offsetY = 0) {
    const screen = project(p); ctx.font = '9px Consolas,monospace'; ctx.fillStyle = color; ctx.fillText(text, screen[0]+offsetX, screen[1]+offsetY);
  }
  function renderScene() {
    ctx.clearRect(0,0,width,height);
    const bg = ctx.createRadialGradient(width*.45,height*.45,5,width*.5,height*.5,width*.8);
    bg.addColorStop(0,'#2d3a41'); bg.addColorStop(1,'#1c252c'); ctx.fillStyle=bg; ctx.fillRect(0,0,width,height);
    for(let i=-8;i<=8;i++) { const v=i*.5; line([[v,0,-4],[v,0,4]],i===0?'#46575c':'#35444b',i===0?.8:.5); line([[-4,0,v],[4,0,v]],i===0?'#46575c':'#35444b',i===0?.8:.5); }
    const ring = Array.from({length:97},(_,i)=>[3.3*Math.cos(i*Math.PI/48),.002,3.3*Math.sin(i*Math.PI/48)]);
    line(ring,'#47605f',.8,[3,6]);
    line([[0,.01,0],[1, .01,0]],'#ad6d5d',1.4); labelAt([1.1,.01,0],'X','#ba8778');
    line([[0,.01,0],[0,1,0]],'#79987c',1.4); labelAt([0,1.1,0],'Y','#a0b49a',-3);
    line([[0,.01,0],[0,.01,1]],'#668f9e',1.4); labelAt([0,.01,1.15],'Z','#8aa6b1');
    const { base, elbow, tip } = forward(state.angles);
    // 바닥 그림자는 위치를 보여주기 위한 표현이며 물리적 그림자 해석이 아닙니다.
    polygon([[-.52,.005,-.52],[.52,.005,-.52],[.52,.005,.52],[-.52,.005,.52]],'#182127','#182127');
    if ($('show-trail').checked && state.trail.length>1) line(state.trail,'#7c9da9',1.5);
    if (state.target) {
      const [x,y,z]=state.target, d=.13;
      line([[x-d,y,z],[x+d,y,z]],'#9ed8cd',1.7); line([[x,y-d,z],[x,y+d,z]],'#9ed8cd',1.7); line([[x,y,z-d],[x,y,z+d]],'#9ed8cd',1.7);
      line([[x,0,z],[x,y,z]],'#648981',.8,[3,4]);
      labelAt(state.target,'TARGET','#a7d7c9',12,-12);
    }
    sceneFaces=[];
    const pale=['#c6c8c1','#e6e6dc','#b9bdb7','#d7d9d0'];
    const orange=palettes[state.color] || palettes.peach;
    const dark=['#48575e','#617078','#39474f'];
    checkpoints.forEach((point,i) => {
      const done=state.visited.has(i), [x,y,z]=point;
      const pad=Array.from({length:33},(_,j)=>[x+.24*Math.cos(j*Math.PI/16),.018,z+.24*Math.sin(j*Math.PI/16)]);
      polygon(pad,done?'#456253':'#435555',done?'#719f7d':'#6f8581');
      line([[x,.02,z],point],done?'#7aa08b66':'#8ca6a155',1,[3,5]);
      const sphere=project(point);
      ctx.beginPath();ctx.arc(...sphere,done?15:17,0,Math.PI*2);ctx.fillStyle=done?'#8caf91':'#e6d5ac';ctx.fill();
      ctx.strokeStyle=done?'#adcab0':'#f3e5c4';ctx.lineWidth=1.5;ctx.stroke();
      ctx.font='bold 12px Consolas,monospace';ctx.textAlign='center';ctx.fillStyle=done?'#325947':'#766446';ctx.fillText(done?'✓':String.fromCharCode(65+i),sphere[0],sphere[1]+4);ctx.textAlign='left';
    });
    boxBetween([0,.04,0],[0,.17,0],.43,.40,dark);
    cylinder([0,.27,0],[0,1,0],.28,.22,pale);
    cylinder([0,.44,0],[0,1,0],.23,.18,orange);
    boxBetween([0,.45,0],base,.15,.14,pale);
    boxBetween(base,elbow,.13,.12,pale);
    boxBetween(elbow,tip,.105,.09,pale);
    const tangent=[-Math.sin(state.angles[0]*deg),0,Math.cos(state.angles[0]*deg)];
    cylinder(base,tangent,.23,.33,orange);
    cylinder(elbow,tangent,.19,.29,orange);
    cylinder(tip,tangent,.13,.24,dark);
    for (const center of [base,elbow]) {
      cylinder(add(center,mul(tangent,.19)),tangent,.085,.04,dark);
      cylinder(add(center,mul(tangent,-.19)),tangent,.075,.04,dark);
    }
    const forwardDir=unit(sub(tip,elbow));
    for(const sign of [-1,1]) {
      const root=add(tip,mul(tangent,(state.gripOpen?.23:.12)*sign));
      boxBetween(root,add(root,mul(forwardDir,.24)),.045,.04,dark);
    }
    sceneFaces.sort((a,b)=>a.depth-b.depth).forEach(f=>polygon(f.points,f.color));
    const tipScreen=project(tip);
    // 카메라를 향하는 작은 표정은 친근한 시각 표현이며 센서가 아닙니다.
    ctx.save();ctx.translate(tipScreen[0],tipScreen[1]-7);
    ctx.beginPath();ctx.roundRect(-22,-17,44,30,10);ctx.fillStyle=orange[1];ctx.fill();ctx.strokeStyle='#233239';ctx.lineWidth=1.1;ctx.stroke();
    ctx.beginPath();ctx.roundRect(-17,-11,34,19,6);ctx.fillStyle='#edece0';ctx.fill();
    for(const ex of [-7,7]) {ctx.beginPath();if(state.blink){ctx.moveTo(ex-2,-2);ctx.lineTo(ex+2,-2);ctx.strokeStyle='#52605c';ctx.lineWidth=2;ctx.stroke();}else{ctx.ellipse(ex,-2,2,3,0,0,Math.PI*2);ctx.fillStyle='#52605c';ctx.fill();}}
    ctx.beginPath();ctx.arc(0,0,3.5,.2,Math.PI-.2);ctx.strokeStyle='#87907a';ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle='#e4b4a177';ctx.beginPath();ctx.arc(-12,3,2.5,0,Math.PI*2);ctx.arc(12,3,2.5,0,Math.PI*2);ctx.fill();ctx.restore();
    line([tip,[tip[0],0,tip[2]]],'#83978e66',.7,[3,5]);
    labelAt(tip,'TCP','#deb593',29,-6);
    labelAt(elbow,'J3','#a4b1af',18,-14);
    labelAt(base,'J2','#a4b1af',-35,-12);
    labelAt([0,.15,0],'J1','#8d9f9f',-34,9);
  }
  function renderChart(now) {
    const c=chartCtx, w=chartWidth,h=chartHeight;
    c.clearRect(0,0,w,h);
    const left=30,right=w-8,top=10,bottom=h-14;
    const y=value=>top+(180-value)/360*(bottom-top);
    c.font='8px Consolas,monospace';
    [-180,-90,0,90,180].forEach(v=>{c.strokeStyle=v===0?'#e1e6db':'#eff1e9';c.lineWidth=1;c.beginPath();c.moveTo(left,y(v));c.lineTo(right,y(v));c.stroke();c.fillStyle='#abb3a2';c.fillText(String(v),0,y(v)+3);});
    [0,5,10,15,20].forEach(age=>{const x=right-age/20*(right-left);c.strokeStyle='#f0f2eb';c.beginPath();c.moveTo(x,top);c.lineTo(x,bottom);c.stroke();});
    ['#ee794d','#678b90','#b3a287'].forEach((color,j)=>{
      c.beginPath();state.history.forEach((sample,i)=>{const x=right-(now-sample.time)/20*(right-left);if(i)c.lineTo(x,y(sample.angles[j]));else c.moveTo(x,y(sample.angles[j]));});c.lineWidth=1.6;c.strokeStyle=color;c.stroke();
      if(state.history.length){c.beginPath();c.arc(right,y(state.history[state.history.length-1].angles[j]),2.4,0,Math.PI*2);c.fillStyle=color;c.fill();}
    });
  }
  function resize() {
    const ratio=Math.min(window.devicePixelRatio||1,2);
    const rect=canvas.getBoundingClientRect(), cr=chart.getBoundingClientRect();
    width=rect.width;height=rect.height;canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
    chartWidth=cr.width;chartHeight=cr.height;chart.width=Math.round(cr.width*ratio);chart.height=Math.round(cr.height*ratio);chartCtx.setTransform(ratio,0,0,ratio,0,0);
    renderChart(performance.now()/1000);
    dirty=true;
  }
  function resetCamera() { camera.yaw=-.65;camera.pitch=.43;camera.zoom=1;setViewActive('perspective');dirty=true; }
  function setViewActive(view) { document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));}); }
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    const view=button.dataset.view;
    if(view==='front'){camera.yaw=0;camera.pitch=.07;}else if(view==='top'){camera.yaw=0;camera.pitch=1.48;}else{camera.yaw=-.65;camera.pitch=.43;}
    setViewActive(view);dirty=true;
  }));
  $('camera-reset').addEventListener('click',resetCamera);
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0 && e.button!==1)return;
    const rect=canvas.getBoundingClientRect(), x=e.clientX-rect.left,y=e.clientY-rect.top;
    const tip=forward(state.angles).tip, screen=project(tip);
    const mode=state.tool==='orbit'||e.altKey||e.button===1?'orbit':Math.hypot(x-screen[0],y-screen[1])<34?'gripper':'surface';
    drag={mode,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,tip:[...tip]};
    canvas.setPointerCapture(e.pointerId);
    if(mode==='gripper'){stop();clearPreset();say('잡았다! 천천히 끌어 줘.');canvas.style.cursor='grabbing';}
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag)return;
    if(drag.mode==='orbit'){
      camera.yaw+=(e.clientX-drag.x)*.008;camera.pitch=Math.max(.06,Math.min(1.48,camera.pitch+(e.clientY-drag.y)*.006));
      drag.x=e.clientX;drag.y=e.clientY;setViewActive('perspective');dirty=true;
    }else if(drag.mode==='gripper'){
      const scale=Math.min(width/7.6,height/5.8)*camera.zoom;
      const dx=(e.clientX-drag.startX)/scale, dy=-(e.clientY-drag.startY)/(Math.cos(camera.pitch)*scale);
      const candidate=add(drag.tip,[Math.cos(camera.yaw)*dx,dy,-Math.sin(camera.yaw)*dx]);
      const angles=inverse(candidate);
      // 한 번의 입력에서도 중간 관절 경로가 바닥을 통과하지 않도록 확인합니다.
      if(angles && Array.from({length:21},(_,i)=>lerp(state.angles,angles,i/20)).every(valid)){
        state.angles=angles;state.target=[...candidate];state.message='집게 직접 드래그';
        ['x','y','z'].forEach((axis,i)=>{$('target-'+axis).value=candidate[i].toFixed(2);});
        updateUI();checkMission();feedback('집게의 위치를 역기구학으로 관절 각도에 반영했습니다.');dirty=true;
      }else{say('이쪽은 조금 어려워. 가까운 곳으로 움직여 줘!');}
    }
  });
  canvas.addEventListener('pointerup',e=>{
    if(!drag)return;
    if(drag.mode==='surface'&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<8){
      const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
      const hit=checkpoints.findIndex(p=>{const s=project(p);return Math.hypot(x-s[0],y-s[1])<27;});
      if(hit>=0)goToTarget(checkpoints[hit],'작은 도전 · 목표 '+String.fromCharCode(65+hit));else{
        const ground=pointOnPlane(x,y,0);
        if(ground){ground[1]=Number($('target-y').value);const rounded=ground.map(v=>Math.round(v*10)/10);goToTarget(rounded,'바닥 위 목표로 이동');}
      }
    }
    if(drag.mode==='gripper'){say('좋았어! 관절 각도와 좌표도 확인해 봐.');state.message='직접 조작 완료';updateUI();}
    drag=null;canvas.style.cursor=state.tool==='interact'?'pointer':'grab';
  });
  canvas.addEventListener('pointercancel',()=>{drag=null;canvas.style.cursor=state.tool==='interact'?'pointer':'grab';});
  canvas.addEventListener('lostpointercapture',()=>{drag=null;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();camera.zoom=Math.max(.6,Math.min(1.65,camera.zoom-e.deltaY*.001));dirty=true;},{passive:false});
  canvas.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home'].includes(e.key))return;
    e.preventDefault();
    if(e.key==='Home')resetCamera();else if(e.key==='+'||e.key==='-')camera.zoom=Math.max(.6,Math.min(1.65,camera.zoom+(e.key==='+'?.1:-.1)));else{
      camera.yaw+=e.key==='ArrowRight'?.08:e.key==='ArrowLeft'?-.08:0;
      camera.pitch=Math.max(.06,Math.min(1.48,camera.pitch+(e.key==='ArrowDown'?.06:e.key==='ArrowUp'?-.06:0)));
    }
    dirty=true;
  });
  function tick(ms) {
    const seconds=ms/1000, dt=lastTime===null?0:Math.min(.05,(ms-lastTime)/1000);lastTime=ms;
    const blink=seconds%4.5<.13;if(blink!==state.blink){state.blink=blink;dirty=true;}
    if(state.motion&&!state.paused){
      const m=state.motion;m.elapsed+=dt;const t=Math.min(1,m.elapsed/m.duration), smooth=t*t*(3-2*t);
      state.angles=lerp(m.from,m.to,smooth);dirty=true;updateUI();
      checkMission();
      if(t===1){state.motion=null;if(state.demo)nextDemo();else if(state.queue.length){const next=state.queue.shift();if(!move(next,'인사하기',true))stop();}else{state.message='목표 도달';updateUI();}}
    }
    if(seconds-lastSample>=.1){
      const point=forward(state.angles).tip,prev=state.trail[state.trail.length-1];
      if(!prev||Math.hypot(...sub(point,prev))>.015){state.trail.push([...point]);if(state.trail.length>500)state.trail.shift();dirty=true;}
      state.history.push({time:seconds,angles:[...state.angles]});state.history=state.history.filter(s=>seconds-s.time<=20);lastSample=seconds;renderChart(seconds);
    }
    if(dirty){renderScene();dirty=false;}
    requestAnimationFrame(tick);
  }
  window.ARM_LAB=Object.freeze({ forward, inverse, valid, project, pointOnPlane, getState:()=>({ angles:[...state.angles], tip:forward(state.angles).tip, paused:state.paused, demo:state.demo, moving:!!state.motion, target:state.target&&[...state.target], color:state.color, gripperOpen:state.gripOpen, checkpointsReached:[...state.visited], tool:state.tool }) });
  new ResizeObserver(resize).observe(canvas.parentElement);
  new ResizeObserver(resize).observe(chart.parentElement);
  document.addEventListener('visibilitychange',()=>{lastTime=null;});
  resize();updateUI();requestAnimationFrame(tick);
})();
