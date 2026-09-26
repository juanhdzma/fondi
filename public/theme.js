try {
  if (localStorage.getItem('fondi-theme') === 'light') {
    document.documentElement.dataset.theme = 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#e7edea');
  }
} catch {}
