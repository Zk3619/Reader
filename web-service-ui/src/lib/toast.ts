export function showToast(message: string, type: 'info' | 'success' | 'error' = 'info', ms = 2800): void {
  const el = document.createElement('div');
  el.className = `reader-web-toast reader-web-toast--${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('reader-web-toast--visible'));
  setTimeout(() => {
    el.classList.remove('reader-web-toast--visible');
    setTimeout(() => el.remove(), 300);
  }, ms);
}
