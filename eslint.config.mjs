import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
    // ========== 全局忽略 ==========
    {
        ignores: ['node_modules/**', 'dist/**', '*.min.js', '.claude/**'],
    },

    // ========== 基础推荐规则 ==========
    js.configs.recommended,

    // ========== 项目代码（浏览器扩展） ==========
    {
        files: ['**/*.js', '!tests/**/*.js', '!vitest.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // 浏览器环境
                ...globals.browser,
                // jQuery（SillyTavern 暴露的全局）
                $: 'readonly',
                jQuery: 'readonly',
                // SillyTavern 全局
                SillyTavern: 'readonly',
                getContext: 'readonly',
                toastr: 'readonly',
                chat: 'writable',
                // 项目自暴露
                window: 'readonly',
            },
        },
        rules: {
            // 变量
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-undef': 'error',

            // 现代 JS 风格
            'prefer-const': 'warn',
            'no-var': 'warn',

            // 调试
            'no-console': 'off',
            'no-debugger': 'warn',

            // 安全
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',

            // 控制流
            'no-unreachable': 'error',
            'no-constant-condition': ['warn', { checkLoops: false }],

            // 忽略（项目特性）
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },

    // ========== 测试文件 ==========
    {
        files: ['tests/**/*.js', 'vitest.config.js', 'scripts/**/*.mjs', 'eslint.config.mjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-undef': 'error',
            'prefer-const': 'warn',
            'no-console': 'off',
        },
    },

    // ========== Prettier 兼容（必须放在最后，关闭与 Prettier 冲突的规则） ==========
    eslintConfigPrettier,
];
