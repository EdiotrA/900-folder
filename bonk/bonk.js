(function () {
  const frame = document.getElementById('bonkFrame');
  const loading = document.getElementById('loadingOverlay');
  const guideModal = document.getElementById('guideModal');
  const wrapper = document.getElementById('iframeWrapper');

  function showLoading() {
    loading.classList.remove('hidden');
  }

  function hideLoading() {
    loading.classList.add('hidden');
  }

  function reloadBonk() {
    showLoading();
    const src = frame.src;
    frame.src = 'about:blank';
    requestAnimationFrame(() => {
      frame.src = src;
    });
  }

  function openGuide() {
    guideModal.classList.remove('hidden');
  }

  function closeGuide() {
    guideModal.classList.add('hidden');
  }

  function toggleFullscreen() {
    const target = wrapper.requestFullscreen ? wrapper : document.documentElement;
    if (!document.fullscreenElement) {
      target.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  showLoading();
  frame.addEventListener('load', hideLoading);

  document.getElementById('reloadBtn')?.addEventListener('click', reloadBonk);
  document.getElementById('bonkTopBtn')?.addEventListener('click', reloadBonk);
  document.getElementById('fullscreenBtn')?.addEventListener('click', toggleFullscreen);
  document.getElementById('controlsBtn')?.addEventListener('click', openGuide);
  document.getElementById('closeGuideBtn')?.addEventListener('click', closeGuide);
  document.getElementById('backToGameBtn')?.addEventListener('click', closeGuide);
  guideModal?.addEventListener('click', (e) => {
    if (e.target === guideModal) closeGuide();
  });
})();
