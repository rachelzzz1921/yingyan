-- 允许 PostgREST 调用 kb_match（anon 只读检索；写入仍靠 service_role）
GRANT EXECUTE ON FUNCTION kb_match(vector, text, int, float) TO anon, authenticated, service_role;
