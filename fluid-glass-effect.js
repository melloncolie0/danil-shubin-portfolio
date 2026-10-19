// React Bits FluidGlass is loaded only when its sandbox scene approaches the viewport.
const host = document.querySelector('#glass-lens');
if (host) {
  let loading = false;
  const observer = new IntersectionObserver(async entries => {
    if (loading || !entries.some(entry => entry.isIntersecting)) return;
    loading = true; observer.disconnect();
    try {
      const [module] = await Promise.all([
        import('./vendor/fluid-glass.js?v=2'),
        document.fonts.load('400 160px Benzin').catch(() => {})
      ]);
      module.mountFluidGlass(host);
    } catch {
      host.dataset.failed = 'true';
      const status = host.querySelector('.lens-status');
      status.textContent = 'Этот эффект не удалось открыть.'; status.hidden = false;
      host.querySelector('.sandbox-touch').disabled = true;
    }
  }, { rootMargin: '180px 0px' });
  observer.observe(host);
}
