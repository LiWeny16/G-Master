/**
 * 与 `core/tool-call-parser.ts` 一致的括号格式，供 Skills 片段引用。
 * 示例：`[TOOL_CALL: web_search({"query":"关键词"})]`
 */

export const TOOL_CALL_WEB_SEARCH =
  '[TOOL_CALL: web_search({"query":"<检索问题或关键词，必填>","maxResults":10})]' as const;

export const TOOL_CALL_LOCAL_FILE_READ =
  '[TOOL_CALL: read_local_file({"path":"<工作区相对路径，必填>"})]' as const;

export const TOOL_CALL_LOCAL_FILE_WRITE =
  '[TOOL_CALL: write_local_file({"path":"<相对路径>","content":"<完整文件内容>"})]' as const;
