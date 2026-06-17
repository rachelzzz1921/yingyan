'use strict';

/** Vercel / Lambda 等无状态部署：数据目录只读 */
function isReadonlyRuntime() {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.READONLY_RUNTIME);
}

module.exports = { isReadonlyRuntime };
