'use strict';

/** Vercel / Lambda 等无状态部署：数据目录只读 */
function isReadonlyRuntime() {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.READONLY_RUNTIME);
}

function isLocalSidecarUrl(url) {
  return !url || /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(String(url));
}

function sidecarDeployment(url) {
  const u = url || process.env.PPSTRUCTURE_URL || 'http://127.0.0.1:8787';
  if (isLocalSidecarUrl(u)) return 'local';
  return 'cloud';
}

module.exports = { isReadonlyRuntime, isLocalSidecarUrl, sidecarDeployment };
