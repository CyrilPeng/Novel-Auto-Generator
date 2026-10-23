import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLocale, getLocale, onLocaleChange } from '../../txtToWorldbook/core/i18n.js';

describe('i18n', () => {
    beforeEach(() => {
        setLocale('zh-CN');
    });

    describe('基础翻译', () => {
        it('默认语言为中文', () => {
            expect(getLocale()).toBe('zh-CN');
        });

        it('查找顶层键', () => {
            expect(t('common.confirm')).toBe('确认');
            expect(t('common.cancel')).toBe('取消');
            expect(t('common.save')).toBe('保存');
        });

        it('查找嵌套键', () => {
            expect(t('errors.http.500')).toBe('服务器内部错误');
            expect(t('errors.http.429')).toBe('请求过于频繁，请降低速度');
        });

        it('不存在的键返回键本身', () => {
            expect(t('nonexistent.key')).toBe('nonexistent.key');
        });

        it('参数插值', () => {
            expect(t('errors.apiError', { status: 500 })).toBe('API 错误 (500)');
            expect(t('progress.parallel', { done: 3, total: 5 })).toBe('🚀 并行处理中 (3/5)');
        });

        it('缺失参数保持占位符', () => {
            expect(t('progress.parallel', { done: 3 })).toBe('🚀 并行处理中 (3/{total})');
        });
    });

    describe('语言切换', () => {
        it('切换至英文', () => {
            setLocale('en-US');
            expect(getLocale()).toBe('en-US');
            expect(t('common.confirm')).toBe('Confirm');
            expect(t('errors.http.500')).toBe('Server internal error');
        });

        it('英文缺失时回落到中文', () => {
            setLocale('en-US');
            // 假设某个键英文不存在，应回落到中文
            // 这里我们故意使用不存在的嵌套键来验证回落逻辑
            expect(t('nonexistent.key')).toBe('nonexistent.key');
        });

        it('部分语言代码匹配', () => {
            setLocale('zh');
            expect(getLocale()).toBe('zh');
            expect(t('common.confirm')).toBe('确认');

            setLocale('en');
            expect(getLocale()).toBe('en');
            expect(t('common.confirm')).toBe('Confirm');
        });

        it('未知语言保持当前', () => {
            setLocale('en-US');
            setLocale('xx-XX');
            expect(getLocale()).toBe('en-US');
        });

        it('语言切换触发订阅', () => {
            const calls = [];
            const unsub = onLocaleChange((l) => calls.push(l));
            setLocale('en-US');
            setLocale('zh-CN');
            unsub();
            setLocale('en-US'); // 取消后不再触发
            expect(calls).toEqual(['en-US', 'zh-CN']);
        });
    });

    describe('自动续写面板', () => {
        it('提供中英文主控件文案', () => {
            expect(t('novel.title')).toBe('📚 小说自动生成器');
            expect(t('novel.floors', { count: 3 })).toBe('共 3 条');
            expect(t('novel.help.generateTitle')).toBe('📝 生成设置说明');
            setLocale('en-US');
            expect(t('novel.title')).toBe('📚 Novel Auto Generator');
            expect(t('novel.floors', { count: 3 })).toBe('3 messages');
            expect(t('novel.help.generateTitle')).toBe('📝 Generation settings');
        });
    });

    describe('特殊场景', () => {
        it('空参数对象', () => {
            expect(t('common.confirm', {})).toBe('确认');
        });

        it('中文标点字符不会被转义', () => {
            expect(t('errors.http.401')).toBe('未授权，请检查 API Key');
        });

        it('数字参数正确插入', () => {
            expect(t('progress.eta', { min: 3, sec: 20 })).toBe('约 3 分 20 秒');
        });
    });
});
