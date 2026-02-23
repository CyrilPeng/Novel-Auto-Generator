/**
 * API 密钥加密工具
 * 使用 Web Crypto API 加密/解密 API 密钥
 */

export class CryptoUtils {
    constructor() {
        this.algorithm = { name: 'AES-GCM', length: 256 };
        this.key = null;
    }

    /**
     * 从密码派生加密密钥
     * @param {string} password - 密码
     * @param {Uint8Array} salt - 盐
     * @returns {Promise<CryptoKey>} 加密密钥
     */
    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            this.algorithm,
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * 生成随机盐
     * @returns {Uint8Array} 盐
     */
    generateSalt() {
        return crypto.getRandomValues(new Uint8Array(16));
    }

    /**
     * 生成随机 IV
     * @returns {Uint8Array} IV
     */
    generateIV() {
        return crypto.getRandomValues(new Uint8Array(12));
    }

    /**
     * 加密数据
     * @param {string} data - 要加密的数据
     * @param {CryptoKey} key - 加密密钥
     * @returns {Promise<Object>} 加密结果
     */
    async encrypt(data, key) {
        const iv = this.generateIV();
        const encoder = new TextEncoder();

        const encrypted = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            encoder.encode(data)
        );

        return {
            encrypted: Array.from(new Uint8Array(encrypted)),
            iv: Array.from(iv)
        };
    }

    /**
     * 解密数据
     * @param {Object} encryptedData - 加密数据
     * @param {CryptoKey} key - 加密密钥
     * @returns {Promise<string>} 解密后的数据
     */
    async decrypt(encryptedData, key) {
        const iv = new Uint8Array(encryptedData.iv);
        const encrypted = new Uint8Array(encryptedData.encrypted);

        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            encrypted
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }
}

/**
 * API 密钥管理器
 * 安全地存储和管理 API 密钥
 */
export class ApiKeyManager {
    constructor() {
        this.cryptoUtils = new CryptoUtils();
        this.storageKey = 'api_keys_encrypted';
        this.saltKey = 'api_keys_salt';
        this.passwordHashKey = 'password_hash';
    }

    /**
     * 设置主密码
     * 主密码用于派生加密密钥，不会直接存储
     * @param {string} password - 主密码
     */
    async setMasterPassword(password) {
        const salt = this.cryptoUtils.generateSalt();
        const key = await this.cryptoUtils.deriveKey(password, salt);

        // 存储盐
        localStorage.setItem(this.saltKey, JSON.stringify(Array.from(salt)));

        // 存储密码哈希（用于验证）
        const passwordHash = await this.hashPassword(password, salt);
        localStorage.setItem(this.passwordHashKey, passwordHash);

        // 缓存密钥（内存中，不存储）
        this.key = key;
    }

    /**
     * 验证主密码
     * @param {string} password - 密码
     * @returns {Promise<boolean>} 是否验证通过
     */
    async verifyPassword(password) {
        const saltStr = localStorage.getItem(this.saltKey);
        if (!saltStr) return false;

        const salt = new Uint8Array(JSON.parse(saltStr));
        const storedHash = localStorage.getItem(this.passwordHashKey);
        const passwordHash = await this.hashPassword(password, salt);

        return passwordHash === storedHash;
    }

    /**
     * 哈希密码
     * @param {string} password - 密码
     * @param {Uint8Array} salt - 盐
     * @returns {Promise<string>} 密码哈希
     */
    async hashPassword(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits']
        );

        const bits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            256
        );

        return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 保存 API 密钥
     * @param {string} provider - API 提供商
     * @param {string} apiKey - API 密钥
     */
    async saveApiKey(provider, apiKey) {
        if (!this.key) {
            throw new Error('请先设置主密码');
        }

        // 获取现有密钥
        const keys = await this.getAllApiKeys();

        // 加密新密钥
        const encrypted = await this.cryptoUtils.encrypt(apiKey, this.key);

        // 更新密钥
        keys[provider] = encrypted;

        // 存储
        localStorage.setItem(this.storageKey, JSON.stringify(keys));
    }

    /**
     * 获取 API 密钥
     * @param {string} provider - API 提供商
     * @returns {Promise<string|null>} API 密钥
     */
    async getApiKey(provider) {
        if (!this.key) {
            throw new Error('请先设置主密码');
        }

        const keysStr = localStorage.getItem(this.storageKey);
        if (!keysStr) return null;

        const keys = JSON.parse(keysStr);
        const encrypted = keys[provider];

        if (!encrypted) return null;

        try {
            return await this.cryptoUtils.decrypt(encrypted, this.key);
        } catch (e) {
            console.error('[API 密钥] 解密失败:', e.message);
            return null;
        }
    }

    /**
     * 获取所有 API 密钥
     * @returns {Promise<Object>} 所有 API 密钥
     */
    async getAllApiKeys() {
        if (!this.key) {
            throw new Error('请先设置主密码');
        }

        const keysStr = localStorage.getItem(this.storageKey);
        if (!keysStr) return {};

        const keys = JSON.parse(keysStr);
        const decryptedKeys = {};

        for (const [provider, encrypted] of Object.entries(keys)) {
            try {
                decryptedKeys[provider] = await this.cryptoUtils.decrypt(encrypted, this.key);
            } catch (e) {
                console.error(`[API 密钥] 解密 ${provider} 失败:`, e.message);
            }
        }

        return decryptedKeys;
    }

    /**
     * 删除 API 密钥
     * @param {string} provider - API 提供商
     */
    async deleteApiKey(provider) {
        const keys = await this.getAllApiKeys();
        delete keys[provider];
        localStorage.setItem(this.storageKey, JSON.stringify(keys));
    }

    /**
     * 清除所有数据
     */
    clearAll() {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.saltKey);
        localStorage.removeItem(this.passwordHashKey);
        this.key = null;
    }

    /**
     * 检查是否已设置主密码
     * @returns {boolean} 是否已设置
     */
    hasMasterPassword() {
        return !!localStorage.getItem(this.saltKey);
    }

    /**
     * 导出加密的密钥数据
     * @returns {Promise<Object>} 加密的密钥数据
     */
    async exportKeys() {
        const keysStr = localStorage.getItem(this.storageKey);
        const saltStr = localStorage.getItem(this.saltKey);

        return {
            keys: keysStr ? JSON.parse(keysStr) : {},
            salt: saltStr ? JSON.parse(saltStr) : null
        };
    }

    /**
     * 导入加密的密钥数据
     * @param {Object} data - 密钥数据
     */
    async importKeys(data) {
        if (data.keys) {
            localStorage.setItem(this.storageKey, JSON.stringify(data.keys));
        }
        if (data.salt) {
            localStorage.setItem(this.saltKey, JSON.stringify(data.salt));
        }
    }
}

// 创建全局实例
export const apiKeyManager = new ApiKeyManager();
