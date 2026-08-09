/* ============================================================
   Canvas 粒子网络效果
   ============================================================ */
(function () {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, list = [];
  const mouse = { x: -9999, y: -9999 };
  const MAX_D = 120;
  const count = () => Math.min(90, Math.floor((W * H) / 12000));

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }

  class P {
    constructor(init) {
      this.x  = Math.random() * (W || 800);
      this.y  = init ? Math.random() * (H || 600) : -10;
      this.vx = (Math.random() - .5) * .45;
      this.vy = (Math.random() - .5) * .45;
      this.r  = Math.random() * 1.6 + .5;
      this.a  = Math.random() * .45 + .15;
    }
    tick() {
      const dx = this.x - mouse.x, dy = this.y - mouse.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < 80) {
        const f = (80 - d) / 80 * .55;
        this.vx += dx / d * f;
        this.vy += dy / d * f;
      }
      this.vx *= .979; this.vy *= .979;
      this.x  += this.vx; this.y  += this.vy;
      if (this.x < -10) this.x = W + 10;
      if (this.x > W + 10) this.x = -10;
      if (this.y < -10) this.y = H + 10;
      if (this.y > H + 10) this.y = -10;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(167,139,250,${this.a})`;
      ctx.fill();
    }
  }

  function init() { list = Array.from({ length: count() }, (_, i) => new P(true)); }

  function lines() {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const dx = list[i].x - list[j].x, dy = list[i].y - list[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < MAX_D) {
          ctx.beginPath();
          ctx.moveTo(list[i].x, list[i].y);
          ctx.lineTo(list[j].x, list[j].y);
          ctx.strokeStyle = `rgba(124,58,237,${(1 - d / MAX_D) * .16})`;
          ctx.lineWidth = .8;
          ctx.stroke();
        }
      }
  }

  let raf;
  function loop() {
    ctx.clearRect(0, 0, W, H);
    list.forEach(p => { p.tick(); p.draw(); });
    lines();
    raf = requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', () => {
    document.hidden ? cancelAnimationFrame(raf) : loop();
  });

  const hero = document.getElementById('hero');
  if (hero) {
    hero.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    });
    hero.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });
  }

  resize(); init(); loop();

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { resize(); init(); }, 220);
  }, { passive: true });
})();
