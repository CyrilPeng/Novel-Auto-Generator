/**
 * 文件操作工具
 * 提供文件读取、下载、编码检测等功能
 */

/**
 * 清理文件名，防止路径遍历和注入攻击
 * @param {string} filename - 原始文件名
 * @returns {string} 清理后的文件名
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed';
  }

  return filename
    // 替换路径分隔符为下划线
    .replace(/[\\/]/g, '_')
    // 替换 Windows 非法字符
    .replace(/[<>:"|?*]/g, '_')
    // 移除控制字符 (0-31)
    .replace(/[\x00-\x1f]/g, '')
    // 防止 .. 遍历 (替换开头的点为下划线)
    .replace(/^\.+/, '_')
    // 防止 Windows 保留名 (CON, PRN, AUX, NUL, COM1-9, LPT1-9) 大小写不敏感
    .replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i, '_$1$2')
    // 移除前后空白
    .trim()
    // 限制最大长度为 200 字符
    .substring(0, 200)
    // 如果结果为空，返回默认名
    || 'unnamed';
}

/**
 * 读取文件为文本
 * @param {File} file - 文件对象
 * @param {string} encoding - 编码方式
 * @returns {Promise<string>} 文件内容
 */
export function readFileAsText(file, encoding = 'UTF-8') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file, encoding);
  });
}

/**
 * 读取文件为 ArrayBuffer
 * @param {File} file - 文件对象
 * @returns {Promise<ArrayBuffer>} ArrayBuffer 数据
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 读取文件为 DataURL
 * @param {File} file - 文件对象
 * @returns {Promise<string>} DataURL
 */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

/**
 * 检测文件编码
 * 尝试多种编码，返回无乱码的编码
 * @param {File} file - 文件对象
 * @returns {Promise<Object>} {encoding, content}
 */
export async function detectFileEncoding(file) {
  const encodings = ['UTF-8', 'GBK', 'GB2312', 'GB18030', 'Big5'];

  for (const encoding of encodings) {
    try {
      const content = await readFileAsText(file, encoding);
      // 检查是否包含替换字符（乱码标志）
      if (!content.includes('') && !content.includes('\uFFFD')) {
        return { encoding, content, detected: true };
      }
    } catch (e) {
      continue;
    }
  }

  // 所有编码都失败，默认返回 UTF-8
  const content = await readFileAsText(file, 'UTF-8');
  return { encoding: 'UTF-8', content, detected: false };
}

/**
 * 下载文件
 * @param {string} content - 文件内容
 * @param {string} filename - 文件名
 * @param {string} mimeType - MIME 类型
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  // 清理文件名，防止路径遍历攻击
  const safeFilename = sanitizeFilename(filename);
  
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 下载 JSON 文件
 * @param {Object} data - JSON 数据
 * @param {string} filename - 文件名
 */
export function downloadJSON(data, filename) {
  const content = JSON.stringify(data, null, 2);
  downloadFile(content, filename, 'application/json');
}

/**
 * 获取文件扩展名
 * @param {string} filename - 文件名
 * @returns {string} 扩展名（不含点）
 */
export function getFileExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * 获取文件名（不含扩展名）
 * @param {string} filename - 文件名
 * @returns {string} 文件名
 */
export function getFileNameWithoutExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.slice(0, -1).join('.') : filename;
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

/**
 * 验证文件
 * @param {File} file - 文件对象
 * @param {Object} options - 验证选项
 * @returns {Object} 验证结果
 */
export function validateFile(file, options = {}) {
  const {
    maxSize, // 最大大小（字节）
    allowedExtensions, // 允许的扩展名数组
    allowedMimeTypes // 允许的 MIME 类型数组
  } = options;

  const result = {
    valid: true,
    errors: []
  };

  // 检查文件大小
  if (maxSize && file.size > maxSize) {
    result.valid = false;
    result.errors.push(`文件大小超出限制 (${formatFileSize(maxSize)})`);
  }

  // 检查扩展名
  if (allowedExtensions && allowedExtensions.length > 0) {
    const ext = getFileExtension(file.name);
    if (!allowedExtensions.includes(ext)) {
      result.valid = false;
      result.errors.push(`不支持的文件格式 (.${ext})`);
    }
  }

  // 检查 MIME 类型
  if (allowedMimeTypes && allowedMimeTypes.length > 0) {
    if (!allowedMimeTypes.includes(file.type)) {
      result.valid = false;
      result.errors.push(`不支持的文件类型 (${file.type})`);
    }
  }

  return result;
}

/**
 * 选择文件
 * @param {Object} options - 选择选项
 * @returns {Promise<File|null>} 选中的文件
 */
export function selectFile(options = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';

    if (options.accept) input.accept = options.accept;
    if (options.multiple) input.multiple = options.multiple;

    input.onchange = (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        resolve(options.multiple ? Array.from(files) : files[0]);
      } else {
        resolve(null);
      }
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}
