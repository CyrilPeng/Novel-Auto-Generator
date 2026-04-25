export function createStopButtonView() {
    function updateStopButtonVisibility(show) {
        const stopBtn = document.getElementById('ttw-stop-btn');
        if (!stopBtn) return;
        stopBtn.style.display = show ? 'inline-block' : 'none';
        stopBtn.disabled = !show;
    }

    return {
        updateStopButtonVisibility,
    };
}
