/* ============================================================
   Navbar：吸顶 + 汉堡菜单 + 平滑滚动 + 活动高亮
   ============================================================ */
(function () {
  const nav    = document.getElementById('navbar');
  const burger = document.getElementById('nav-burger');
  const drawer = document.getElementById('nav-drawer');
  if (!nav) return;

  /* 吸顶 */
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });
  nav.classList.toggle('scrolled', window.scrollY > 30);

  /* 汉堡 */
  let open = false;
  function toggle(force) {
    open = force !== undefined ? force : !open;
    burger && burger.classList.toggle('open', open);
    drawer && drawer.classList.toggle('open', open);
    burger && burger.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }

  burger && burger.addEventListener('click', () => toggle());
  drawer && drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => toggle(false)));
  document.addEventListener('click', e => {
    if (open && drawer && !drawer.contains(e.target) && !burger.contains(e.target)) toggle(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(false); });

  /* 平滑滚动（补偿导航高度） */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const el = document.querySelector(a.getAttribute('href'));
      if (!el) return;
      e.preventDefault();
      const top = el.getBoundingClientRect().top + window.scrollY - nav.offsetHeight - 12;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  /* 活动段落高亮 */
  const links = document.querySelectorAll('.nav-links a[href^="#"]');
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        links.forEach(l => {
          l.style.color = l.getAttribute('href') === '#' + en.target.id ? 'var(--t0)' : '';
        });
      }
    });
  }, { rootMargin: '-40% 0px -50% 0px' });

  document.querySelectorAll('section[id]').forEach(s => io.observe(s));
})();
