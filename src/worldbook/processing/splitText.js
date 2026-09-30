import { ensureChunkIdentities } from '../../../txtToWorldbook/core/chunkIdentity.js';
export function splitText(content, { chunkSize = 15000, pattern, onWarning = () => {} } = {}) {
    if (!Number.isFinite(chunkSize) || chunkSize < 1) throw new Error('分块长度必须大于零');
    const queue = [];
    const minChunkSize = Math.max(chunkSize * 0.3, 5000);

    const chapterRegex = new RegExp(pattern || '(?!)', 'g');
    const matches = [];
    const maxTime = 5000;
    const startTime = Date.now();
    let match;
    while ((match = chapterRegex.exec(content)) !== null) {
        matches.push(match);
        if (Date.now() - startTime > maxTime) {
            onWarning('章节正则匹配超时(5秒)，已中断');
            break;
        }
        if (match[0].length === 0) chapterRegex.lastIndex++;
    }

    if (matches.length > 0) {
        const chapters = [];

        for (let i = 0; i < matches.length; i++) {
            const startIndex = matches[i].index;
            const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length;
            let chapterContent = content.slice(startIndex, endIndex);

            if (i === 0 && startIndex > 0) {
                const preContent = content.slice(0, startIndex);
                chapterContent = preContent + chapterContent;
            }

            chapters.push({ title: matches[i][0], content: chapterContent });
        }

        const mergedChapters = [];
        let pendingChapter = null;

        for (const chapter of chapters) {
            if (pendingChapter) {
                if (pendingChapter.content.length + chapter.content.length <= chunkSize) {
                    pendingChapter.content += chapter.content;
                    pendingChapter.title += '+' + chapter.title;
                } else if (pendingChapter.content.length >= minChunkSize) {
                    mergedChapters.push(pendingChapter);
                    pendingChapter = chapter;
                } else {
                    pendingChapter.content += chapter.content;
                    pendingChapter.title += '+' + chapter.title;
                }
            } else {
                pendingChapter = { ...chapter };
            }
        }

        if (pendingChapter) {
            mergedChapters.push(pendingChapter);
        }

        let currentChunk = '';
        let chunkIndex = 1;

        for (let i = 0; i < mergedChapters.length; i++) {
            const chapter = mergedChapters[i];

            if (chapter.content.length > chunkSize) {
                if (currentChunk.length > 0) {
                    queue.push(createMemoryChunk(currentChunk, chunkIndex));
                    currentChunk = '';
                    chunkIndex++;
                }

                let remaining = chapter.content;
                while (remaining.length > 0) {
                    let endPos = Math.min(chunkSize, remaining.length);
                    if (endPos < remaining.length) {
                        const paragraphBreak = remaining.lastIndexOf('\n\n', endPos);
                        if (paragraphBreak > endPos * 0.5) {
                            endPos = paragraphBreak + 2;
                        } else {
                            const sentenceBreak = remaining.lastIndexOf('。', endPos);
                            if (sentenceBreak > endPos * 0.5) {
                                endPos = sentenceBreak + 1;
                            }
                        }
                    }

                    queue.push(createMemoryChunk(remaining.slice(0, endPos), chunkIndex));
                    remaining = remaining.slice(endPos);
                    chunkIndex++;
                }
                continue;
            }

            if (currentChunk.length + chapter.content.length > chunkSize && currentChunk.length > 0) {
                queue.push(createMemoryChunk(currentChunk, chunkIndex));
                currentChunk = '';
                chunkIndex++;
            }

            currentChunk += chapter.content;
        }

        if (currentChunk.length > 0) {
            if (currentChunk.length < minChunkSize && queue.length > 0) {
                const lastMemory = queue[queue.length - 1];
                if (lastMemory.content.length + currentChunk.length <= chunkSize * 1.2) {
                    lastMemory.content += currentChunk;
                } else {
                    queue.push(createMemoryChunk(currentChunk, chunkIndex));
                }
            } else {
                queue.push(createMemoryChunk(currentChunk, chunkIndex));
            }
        }
    } else {
        let i = 0;
        let chunkIndex = 1;

        while (i < content.length) {
            let endIndex = Math.min(i + chunkSize, content.length);
            if (endIndex < content.length) {
                const paragraphBreak = content.lastIndexOf('\n\n', endIndex);
                if (paragraphBreak > i + chunkSize * 0.5) {
                    endIndex = paragraphBreak + 2;
                } else {
                    const sentenceBreak = content.lastIndexOf('。', endIndex);
                    if (sentenceBreak > i + chunkSize * 0.5) {
                        endIndex = sentenceBreak + 1;
                    }
                }
            }

            queue.push(createMemoryChunk(content.slice(i, endIndex), chunkIndex));
            i = endIndex;
            chunkIndex++;
        }
    }

    for (let i = queue.length - 1; i > 0; i--) {
        if (queue[i].content.length < minChunkSize) {
            const prevMemory = queue[i - 1];
            if (prevMemory.content.length + queue[i].content.length <= chunkSize * 1.2) {
                prevMemory.content += queue[i].content;
                queue.splice(i, 1);
            }
        }
    }

    ensureChunkIdentities(queue);
    queue.forEach((memory, index) => {
        memory.title = `记忆${index + 1}`;
    });
    return queue;
}

function createMemoryChunk(content, chunkIndex) {
    return {
        title: `记忆${chunkIndex}`,
        content,
        processed: false,
        failed: false,
        processing: false,
    };
}
