/* ============================================================
   main.js — 滚动动画 + 数字计数 + 主题切换 + 打字动画
   ============================================================ */
(function () {

  /* —— 滚动 reveal —— */
  const revealIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); revealIO.unobserve(en.target); }
    });
  }, { threshold: 0, rootMargin: '0px 0px 80px 0px' });
  document.querySelectorAll('.reveal').forEach(el => revealIO.observe(el));

  /* —— 数字计数 —— */
  // 不再做从0开始的计数，改为：初始HTML已是正确值，进入视口时做弹跳动效
  const countIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        const el = en.target;
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        // 确保显示正确终值
        el.textContent = (Number.isInteger(target) ? target : target.toFixed(1)) + suffix;
        // 加一个轻弹动效
        el.animate([
          { transform: 'scale(0.85)', opacity: 0.5 },
          { transform: 'scale(1.08)', opacity: 1 },
          { transform: 'scale(1)',    opacity: 1 }
        ], { duration: 500, easing: 'ease-out', fill: 'forwards' });
        countIO.unobserve(el);
      }
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('[data-count]').forEach(el => {
    // 立即设置正确初始值（防止截图/JS未加载时显示旧值）
    const t = parseFloat(el.dataset.count);
    const s = el.dataset.suffix || '';
    el.textContent = (Number.isInteger(t) ? t : t.toFixed(1)) + s;
    countIO.observe(el);
  });

  /* —— Mock 评分条 —— */
  const scoreIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.querySelectorAll('.mock-score-fill').forEach(bar => {
          bar.style.width = '0';
          setTimeout(() => { bar.style.width = (bar.dataset.w || 0) + '%'; }, 200);
        });
        scoreIO.unobserve(en.target);
      }
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.mock-win').forEach(el => {
    el.querySelectorAll('.mock-score-fill').forEach(b => { b.style.width = '0'; });
    scoreIO.observe(el);
  });

  /* —— 主题切换 —— */
  const themeBtn = document.getElementById('themeBtn');
  const KEY = 'yc-theme';
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
  // 默认深色：优先读 localStorage，否则始终 dark（产品定位深色优先）
  let dark = localStorage.getItem(KEY) ? localStorage.getItem(KEY) === 'dark' : true;

  function applyTheme(d) {
    dark = d;
    document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light');
    if (themeBtn) themeBtn.textContent = d ? '🌙' : '☀️';
    localStorage.setItem(KEY, d ? 'dark' : 'light');
  }
  themeBtn && themeBtn.addEventListener('click', () => applyTheme(!dark));
  applyTheme(dark);

  /* —— Hero 打字动画 —— */
  const phrases = ['一条流水线', '风格完美复刻', '去 AI 味写作', '真人感满分'];
  const typed = document.getElementById('heroTyped');
  if (!typed) return;
  // 从第一个短语的完整状态开始（初始 HTML 已显示），先停留再删除
  let pi = 0, ci = phrases[0].length, deleting = false;

  function type() {
    const phrase = phrases[pi];
    if (!deleting) {
      typed.textContent = phrase.slice(0, ++ci);
      if (ci === phrase.length) { deleting = true; setTimeout(type, 2000); return; }
    } else {
      typed.textContent = phrase.slice(0, --ci);
      if (ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; setTimeout(type, 300); return; }
    }
    setTimeout(type, deleting ? 55 : 85);
  }
  // 先展示初始词 2.5s，然后开始循环
  setTimeout(type, 2500);

})();
