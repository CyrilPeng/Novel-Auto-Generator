export function createFileUtils(deps = {}) {
    const { onHashFallback } = deps;

    async function calculateFileHash(content) {
        if (window.crypto && window.crypto.subtle) {
            try {
                const encoder = new TextEncoder();
                const data = encoder.encode(content);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            } catch (e) {
                if (typeof onHashFallback === 'function') onHashFallback(e);
            }
        }

        let hash = 0;
        const len = content.length;
        if (len === 0) return 'hash-empty';
        const sample = len < 100000
            ? content
            : content.slice(0, 1000)
                + content.slice(Math.floor(len / 2), Math.floor(len / 2) + 1000)
                + content.slice(-1000);
        for (let i = 0; i < sample.length; i++) {
            hash = ((hash << 5) - hash) + sample.charCodeAt(i);
            hash = hash & hash;
        }
        return `simple-${Math.abs(hash).toString(16)}-${len}`;
    }

    async function detectBestEncoding(file) {
        const encodings = ['UTF-8', 'GBK', 'GB2312', 'GB18030', 'Big5'];
        const replacementChar = String.fromCharCode(0xFFFD);
        for (const encoding of encodings) {
            try {
                const content = await readFileWithEncoding(file, encoding);
                if (!content.includes(replacementChar)) {
                    return { encoding, content };
                }
            } catch (e) {
                continue;
            }
        }
        const content = await readFileWithEncoding(file, 'UTF-8');
        return { encoding: 'UTF-8', content };
    }

    function readFileWithEncoding(file, encoding) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, encoding);
        });
    }

    return {
        calculateFileHash,
        detectBestEncoding,
    };
}
