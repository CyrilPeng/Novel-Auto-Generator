import { t } from '../../txtToWorldbook/core/i18n.js';

const helpTopics = new Set(['generate', 'export', 'extract', 'advanced']);

export function getHelpContent(topic) {
    if (!helpTopics.has(topic)) return { title: '帮助', content: '<p>暂无帮助内容</p>' };
    const titleKey = `novel.help.${topic}Title`;
    const contentKey = `novel.help.${topic}Content`;
    const title = t(titleKey);
    const content = t(contentKey);
    if (title === titleKey || content === contentKey) return { title: '帮助', content: '<p>暂无帮助内容</p>' };
    return { title, content };
}
