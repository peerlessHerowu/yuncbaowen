/* ============================================================
   Features Tab 切换
   ============================================================ */
(function () {
  const tabs   = document.querySelectorAll('.ft-tab');
  const panels = document.querySelectorAll('.ft-panel');
  if (!tabs.length) return;

  function activateTab(tab) {
    const key = tab.dataset.tab;
    tabs.forEach(t => t.classList.toggle('active', t === tab));
    panels.forEach(p => {
      const on = p.dataset.panel === key;
      p.classList.toggle('active', on);
      if (on) {
        // 第一个 item 默认激活
        p.querySelectorAll('.ft-item').forEach((item, i) => item.classList.toggle('active', i === 0));
        // 重新触发评分条动画
        p.querySelectorAll('.mock-score-fill').forEach(bar => {
          bar.style.width = '0';
          setTimeout(() => { bar.style.width = (bar.dataset.w || '0') + '%'; }, 120);
        });
      }
    });
  }

  tabs.forEach(tab => tab.addEventListener('click', () => activateTab(tab)));

  // ft-item 点击
  document.querySelectorAll('.ft-item').forEach(item => {
    item.addEventListener('click', () => {
      item.closest('.ft-panel').querySelectorAll('.ft-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });

  activateTab(tabs[0]);
})();
