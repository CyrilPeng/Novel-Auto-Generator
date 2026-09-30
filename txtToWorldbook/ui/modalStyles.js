export function ensureModalStyles() {
    if (document.getElementById('ttw-styles')) return;
    const link = document.createElement('link');
    link.id = 'ttw-styles';
    link.rel = 'stylesheet';
    link.href = new URL('../styles/modal.css', import.meta.url).href;
    document.head.appendChild(link);
}
