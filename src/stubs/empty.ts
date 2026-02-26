/**
 * 浏览器环境占位模块，用于替代 Node 内置模块（如 fs、crypto），
 * 避免 Vite 报 "externalized for browser compatibility" 警告。
 * sql.js 等库在浏览器下不会实际使用这些模块。
 */
export default {};
