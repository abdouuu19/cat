/* Hungry Cat - Mobile Edition */
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Logical view size
  const VIEW_W = 800;
  const VIEW_H = 450;

  const scoreEl = document.getElementById('score');
  const highEl = document.getElementById('highscore');
  const finalScoreEl = document.getElementById('finalScore');
  const finalHighEl = document.getElementById('finalHigh');

  const overlayEl = document.getElementById('overlay');
  const gameoverEl = document.getElementById('gameover');

  const playBtn = document.getElementById('play');
  const restartBtn = document.getElementById('restart');
  const shareBtn = document.getElementById('share');

  const leftBtn = document.getElementById('left');
  const rightBtn = document.getElementById('right');
  const muteBtn = document.getElementById('mute');

  // Assets
  const images = {
    background: loadImage('assets/images/background.jpg'),
    cat: loadImage('assets/images/cat.png'),
    fish: loadImage('assets/images/fish-normal.png'),
    golden: loadImage('assets/images/fish-golden.png'),
    water: loadImage('assets/images/water-drop.png'),
  };

  const sounds = {
    catch: new Audio('assets/sounds/meow.mp3'),
    splash: new Audio('assets/sounds/splash.mp3'),
    gameover: new Audio('assets/sounds/gameover.mp3'),
  };

  // Audio defaults
  Object.values(sounds).forEach(a => {
    a.preload = 'auto';
    a.volume = 0.7;
  });

  let isMuted = false;

  function playSound(name) {
    if (isMuted) return;
    const s = sounds[name];
    if (!s) return;
    try {
      s.currentTime = 0;
      s.play();
    } catch {}
  }

  function haptic(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch {}
    }
  }

  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
  }

  // Game state
  const world = {
    started: false,
    gameOver: false,
    score: 0,
    best: Number(localStorage.getItem('hungrycat_highscore') || 0),
    speed: 140, // initial fall speed (px/s)
    spawnEveryMs: 950, // spawn interval
    lastSpawnAt: 0,
    time: 0,
    slowmo: 0, // seconds of slow-motion after game over
  };

  highEl.textContent = String(world.best);

  const cat = {
    x: VIEW_W / 2,
    y: VIEW_H - 96,
    width: 96,
    height: 72,
    velocityX: 0,
    maxSpeed: 380, // px/s
    accel: 1800,   // px/s^2
  };

  const inputs = {
    left: false,
    right: false,
  };

  const tilt = {
    active: false,
    gamma: 0, // LR tilt in degrees
  };

  const drops = [];
  const particles = [];

  const TYPES = {
    FISH: 'fish',
    GOLD: 'gold',
    WATER: 'water',
  };

  function resetGame() {
    world.started = true;
    world.gameOver = false;
    world.score = 0;
    world.speed = 140;
    world.spawnEveryMs = 950;
    world.lastSpawnAt = 0;
    world.time = 0;
    world.slowmo = 0;
    drops.length = 0;
    particles.length = 0;
    cat.x = VIEW_W / 2;
    cat.y = VIEW_H - 96;
    cat.velocityX = 0;
    updateScore(0);
  }

  function endGame() {
    world.gameOver = true;
    world.started = false;
    world.slowmo = 0.45;
    finalScoreEl.textContent = String(world.score);
    if (world.score > world.best) {
      world.best = world.score;
      localStorage.setItem('hungrycat_highscore', String(world.best));
    }
    highEl.textContent = String(world.best);
    finalHighEl.textContent = String(world.best);
    show(gameoverEl);
  }

  function updateScore(delta) {
    world.score += delta;
    scoreEl.textContent = String(world.score);

    // Progression: accelerate and increase spawn rate slightly
    const speedCap = 540;
    const spawnCap = 360;
    world.speed = Math.min(speedCap, 140 + world.score * 8);
    world.spawnEveryMs = Math.max(spawnCap, 950 - world.score * 12);
  }

  function spawnDrop() {
    const roll = Math.random();
    const isGold = roll > 0.82; // ~18%
    const isWater = !isGold && roll < 0.22; // ~22%

    const type = isWater ? TYPES.WATER : isGold ? TYPES.GOLD : TYPES.FISH;

    const baseSize = type === TYPES.WATER ? 44 : 48;
    const width = baseSize + Math.random() * 12;
    const height = width;

    const obj = {
      type,
      x: 24 + Math.random() * (VIEW_W - 48),
      y: -height,
      width,
      height,
      rotation: (Math.random() * Math.PI) - Math.PI / 2,
      rotationSpeed: (Math.random() * 0.8 - 0.4),
      vy: world.speed * (0.9 + Math.random() * 0.25),
    };
    drops.push(obj);
  }

  function rectsIntersect(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function update(dt) {
    if (!world.started || world.gameOver) {
      // Slow motion decay while showing gameover
      if (world.slowmo > 0) {
        const t = Math.min(dt, world.slowmo);
        world.slowmo -= t;
      }
      return;
    }

    world.time += dt;

    // Spawn
    if (world.time - world.lastSpawnAt >= world.spawnEveryMs / 1000) {
      world.lastSpawnAt = world.time;
      spawnDrop();
    }

    // Desired direction from inputs and tilt
    let desiredDir = (inputs.left ? -1 : 0) + (inputs.right ? 1 : 0);
    if (tilt.active) {
      const analog = clamp(tilt.gamma / 30, -1, 1);
      desiredDir += analog;
    }
    desiredDir = clamp(desiredDir, -1, 1);

    // Smooth velocity towards desired
    const desiredVx = desiredDir * cat.maxSpeed;
    const deltaV = desiredVx - cat.velocityX;
    cat.velocityX += clamp(deltaV, -cat.accel * dt, cat.accel * dt);
    // Apply tiny friction if no input
    if (Math.abs(desiredDir) < 0.05 && Math.abs(cat.velocityX) > 2) {
      cat.velocityX *= Math.pow(0.0001, dt); // gentle ease-out
    }

    cat.x += cat.velocityX * dt;

    // Clamp to logical view
    const margin = 16;
    cat.x = Math.max(margin, Math.min(VIEW_W - cat.width - margin, cat.x));

    // Move drops
    for (let i = drops.length - 1; i >= 0; i -= 1) {
      const d = drops[i];
      d.y += d.vy * dt;
      d.rotation += d.rotationSpeed * dt;

      // Check collision
      const catRect = { x: cat.x, y: cat.y, width: cat.width, height: cat.height };
      const dRect = { x: d.x, y: d.y, width: d.width, height: d.height };
      if (rectsIntersect(catRect, dRect)) {
        if (d.type === TYPES.WATER) {
          spawnSplash(d.x + d.width / 2, d.y + d.height / 2, '#66ccff');
          haptic([40, 40, 60]);
          playSound('splash');
          playSound('gameover');
          endGame();
          break;
        } else if (d.type === TYPES.FISH) {
          spawnBurst(d.x + d.width / 2, d.y + d.height / 2, '#a8dadc', 12);
          haptic(20);
          updateScore(1);
          playSound('catch');
          drops.splice(i, 1);
          continue;
        } else if (d.type === TYPES.GOLD) {
          spawnBurst(d.x + d.width / 2, d.y + d.height / 2, '#ffd166', 16, 1.2);
          haptic([10, 60, 10]);
          updateScore(3);
          playSound('catch');
          drops.splice(i, 1);
          continue;
        }
      }

      // Remove off-screen
      if (d.y > VIEW_H + 80) {
        drops.splice(i, 1);
      }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vx *= 0.992;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
    }
  }

  function spawnBurst(x, y, color, count = 12, speedMul = 1) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = (110 + Math.random() * 180) * speedMul;
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.4,
        size: 3 + Math.random() * 3,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() * 6 - 3),
        color,
        gravity: 160,
        shape: 'spark',
      });
    }
  }

  function spawnSplash(x, y, color) {
    for (let i = 0; i < 26; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 160;
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.6 + Math.random() * 0.5,
        size: 4 + Math.random() * 5,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() * 4 - 2),
        color,
        gravity: 220,
        shape: 'circle',
      });
    }
  }

  function drawBackground() {
    const bg = images.background;
    if (bg.complete && bg.naturalWidth) {
      // cover logical view
      const scale = Math.max(VIEW_W / bg.naturalWidth, VIEW_H / bg.naturalHeight);
      const sw = bg.naturalWidth * scale;
      const sh = bg.naturalHeight * scale;
      const sx = (VIEW_W - sw) / 2;
      const sy = (VIEW_H - sh) / 2;
      ctx.drawImage(bg, sx, sy, sw, sh);
    } else {
      ctx.fillStyle = '#0b0d18';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    // subtle vignette
    const grad = ctx.createRadialGradient(
      VIEW_W / 2,
      VIEW_H * 0.7,
      VIEW_H * 0.2,
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_H * 0.9
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  function drawCat() {
    const img = images.cat;
    const w = cat.width;
    const h = cat.height;
    // subtle tilt by velocity
    const angle = clamp(cat.velocityX / cat.maxSpeed, -1, 1) * 0.15;
    ctx.save();
    ctx.translate(cat.x + w / 2, cat.y + h / 2);
    ctx.rotate(angle);
    if (img.complete && img.naturalWidth) {
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }

  function drawDrops() {
    for (const d of drops) {
      ctx.save();
      ctx.translate(d.x + d.width / 2, d.y + d.height / 2);
      ctx.rotate(d.rotation);
      const img = d.type === TYPES.WATER ? images.water : d.type === TYPES.GOLD ? images.golden : images.fish;
      const w = d.width;
      const h = d.height;
      if (img.complete && img.naturalWidth) {
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = d.type === TYPES.WATER ? '#66ccff' : d.type === TYPES.GOLD ? '#ffd166' : '#a8dadc';
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const t = clamp(p.life, 0, 1);
      const alpha = Math.min(1, t * 2);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
      }
      ctx.restore();
    }
  }

  function draw() {
    drawBackground();
    drawDrops();
    drawCat();
    drawParticles();

    // ground shine
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, VIEW_H - 8, VIEW_W, 8);
  }

  let last = 0;
  function loop(ts) {
    if (!last) last = ts;
    let dt = Math.min(0.033, (ts - last) / 1000);
    last = ts;

    if (world.slowmo > 0) dt *= 0.25;

    update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  // Controls
  function setInput(which, pressed) {
    if (which === 'left') inputs.left = pressed;
    if (which === 'right') inputs.right = pressed;
  }

  // Touch buttons
  const startPress = (e, key) => { e.preventDefault(); setInput(key, true); };
  const endPress = (e, key) => { e.preventDefault(); setInput(key, false); };

  leftBtn.addEventListener('touchstart', e => startPress(e, 'left'), { passive: false });
  leftBtn.addEventListener('touchend', e => endPress(e, 'left'), { passive: false });
  leftBtn.addEventListener('mousedown', e => startPress(e, 'left'));
  leftBtn.addEventListener('mouseup', e => endPress(e, 'left'));
  leftBtn.addEventListener('mouseleave', e => endPress(e, 'left'));

  rightBtn.addEventListener('touchstart', e => startPress(e, 'right'), { passive: false });
  rightBtn.addEventListener('touchend', e => endPress(e, 'right'), { passive: false });
  rightBtn.addEventListener('mousedown', e => startPress(e, 'right'));
  rightBtn.addEventListener('mouseup', e => endPress(e, 'right'));
  rightBtn.addEventListener('mouseleave', e => endPress(e, 'right'));

  // Keyboard
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') setInput('left', true);
    if (e.key === 'ArrowRight' || e.key === 'd') setInput('right', true);
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') setInput('left', false);
    if (e.key === 'ArrowRight' || e.key === 'd') setInput('right', false);
  });

  // Start/Restart
  async function start() {
    hide(overlayEl);
    hide(gameoverEl);
    await enableTiltIfAvailable();
    resetGame();
  }

  playBtn.addEventListener('click', start);
  restartBtn.addEventListener('click', start);

  // Share
  shareBtn.addEventListener('click', async () => {
    const text = `I scored ${world.score} in Hungry Cat! 🐱🎣`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Hungry Cat', text });
      } else {
        await navigator.clipboard.writeText(text);
        shareBtn.textContent = 'Copied!';
        setTimeout(() => (shareBtn.textContent = 'Share'), 1200);
      }
    } catch {}
  });

  // Mute
  function updateMuteIcon() { muteBtn.textContent = isMuted ? '🔇' : '🔊'; }
  muteBtn.addEventListener('click', () => { isMuted = !isMuted; updateMuteIcon(); });
  updateMuteIcon();

  // Tilt controls (optional)
  async function enableTiltIfAvailable() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res === 'granted') {
          window.addEventListener('deviceorientation', onTilt);
          tilt.active = true;
        }
      } else if (typeof DeviceOrientationEvent !== 'undefined') {
        window.addEventListener('deviceorientation', onTilt);
        tilt.active = true;
      }
    } catch {}
  }

  function onTilt(e) {
    if (typeof e.gamma === 'number') {
      tilt.gamma = clamp(e.gamma, -45, 45);
    }
  }

  // Resize handling to maintain crisp rendering
  function resizeCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssWidth = Math.min(window.innerWidth, window.innerHeight * (16 / 9));
    const cssHeight = cssWidth * 9 / 16;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    // Scale game coordinates to logical space VIEW_W x VIEW_H
    const scaleX = canvas.width / VIEW_W;
    const scaleY = canvas.height / VIEW_H;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

    // Update cat baseline position
    cat.y = VIEW_H - 96;
  }

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', resizeCanvas);
  resizeCanvas();

  // Show start screen
  show(overlayEl);

  requestAnimationFrame(loop);

  // Utils for UI visibility
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }
})();