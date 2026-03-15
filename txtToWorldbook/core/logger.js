export function createLogger(initialLevel = 'INFO') {
    const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    let currentLevel = levels[initialLevel] ?? levels.INFO;

    const log = (level, tag, ...args) => {
        if (levels[level] >= currentLevel) {
            const timestamp = new Date().toISOString().slice(11, 23);
            const levelStr = level.padEnd(5);
            console.log(`[${timestamp}][${levelStr}][${tag}]`, ...args);
        }
    };

    return {
        levels,
        get currentLevel() {
            return currentLevel;
        },
        log,
        debug(tag, ...args) { log('DEBUG', tag, ...args); },
        info(tag, ...args) { log('INFO', tag, ...args); },
        warn(tag, ...args) { log('WARN', tag, ...args); },
        error(tag, ...args) { log('ERROR', tag, ...args); },
        setLevel(level) {
            if (levels[level] !== undefined) {
                currentLevel = levels[level];
            }
        }
    };
}

export const Logger = createLogger('INFO');
