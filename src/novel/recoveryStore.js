// @ts-check
/** Synchronous journal: storage must acknowledge uncertainty before the host dispatches. */
/** @param {() => Storage} getStorage @param {string} key */
export function createNovelRecoveryStore(getStorage, key = 'novel-auto-generator:recovery:v1') {
    return {
        read() {
            const raw = getStorage().getItem(key);
            if (raw == null) return null;
            const value = JSON.parse(raw);
            if (typeof value.identity !== 'string' || !Number.isInteger(value.chapter) || value.chapter < 0)
                throw new Error('Invalid continuation recovery record');
            if (
                value.pending &&
                (value.pending.identity !== value.identity ||
                    !Number.isInteger(value.pending.floor) ||
                    value.pending.floor < 0)
            )
                throw new Error('Invalid pending continuation');
            return value;
        },
        /** @param {{identity: string, chapter: number, pending: {identity: string, floor: number} | null}} record */
        write({ identity, chapter, pending }) {
            // Do not retain prompts or chat text in the journal.
            getStorage().setItem(
                key,
                JSON.stringify({
                    identity,
                    chapter,
                    pending: pending ? { identity: pending.identity, floor: pending.floor } : null,
                }),
            );
        },
        clear() {
            getStorage().removeItem(key);
        },
    };
}
