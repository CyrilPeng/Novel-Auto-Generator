export function createExportNameService(deps = {}) {
    const { AppState, getNovelNameInput = () => document.getElementById('ttw-novel-name-input') } = deps;

    function getExportBaseName(fallback) {
        if (AppState.file.novelName && AppState.file.novelName.trim()) {
            return AppState.file.novelName.trim();
        }

        if (AppState.file.current) {
            return AppState.file.current.name.replace(/\.[^/.]+$/, '');
        }

        const inputEl = getNovelNameInput();
        if (inputEl && inputEl.value.trim()) {
            return inputEl.value.trim();
        }

        return fallback || '未命名';
    }

    return {
        getExportBaseName,
    };
}
