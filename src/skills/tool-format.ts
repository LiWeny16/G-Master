/**
 * 与 `core/tool-call-parser.ts` 一致的括号格式，供 Skills 片段引用。
 * 示例：`[TOOL_CALL: web_search({"query":"关键词"})]`
 */

export const TOOL_CALL_WEB_SEARCH =
  '[TOOL_CALL: web_search({"query":"<检索问题或关键词，必填>","maxResults":10})]' as const;

export const TOOL_CALL_LIST_DIRECTORY =
  '[TOOL_CALL: list_directory({"path":".","recursive":false,"maxDepth":2})]' as const;

export const TOOL_CALL_READ_FILE =
  '[TOOL_CALL: read_file({"path":"<工作区相对路径，必填>","startLine":1,"endLine":50})]' as const;

/** startLine/endLine 可选，省略则读取全文 */
export const TOOL_CALL_READ_FILE_FULL =
  '[TOOL_CALL: read_file({"path":"<工作区相对路径，必填>"})]' as const;

export const TOOL_CALL_GREP_FILES =
  '[TOOL_CALL: grep_files({"query":"<搜索文本或正则，必填>","directory":".","includePattern":"*.ts","isRegex":false,"caseSensitive":false,"contextLines":2,"maxResults":100})]' as const;

export const TOOL_CALL_ATTACH_FILE =
  '[TOOL_CALL: attach_file_to_chat({"path":"<工作区相对路径，必填>"})]' as const;

/** 延伸示例：自定义 CSS 选择器 */
export const TOOL_CALL_ATTACH_FILE_WITH_SELECTOR =
  '[TOOL_CALL: attach_file_to_chat({"path":"<路径>","targetSelector":"<CSS选择器，可选>"})]' as const;

export const TOOL_CALL_READ_FILES =
  '[TOOL_CALL: read_files({"paths":["<路径1>","<路径2>","<路径3>"]})]' as const;

export const TOOL_CALL_SEARCH_FILES =
  '[TOOL_CALL: search_files({"pattern":"*.ts","directory":".","maxResults":50})]' as const;

/** @deprecated 保留旧名兼容，等同于 TOOL_CALL_READ_FILE */
export const TOOL_CALL_LOCAL_FILE_READ = TOOL_CALL_READ_FILE;

export const TOOL_CALL_LOCAL_FILE_WRITE =
  '[TOOL_CALL: write_local_file({"path":"<相对路径>","content":"<完整文件内容>"})]' as const;

export const TOOL_CALL_EDIT_FILE =
  '[TOOL_CALL: edit_file({"path":"<工作区相对路径，必填>","old_str":"<要替换的原始文本，必须精确匹配>","new_str":"<替换后的新文本>"})]' as const;

export const TOOL_CALL_CREATE_FILE =
  '[TOOL_CALL: create_file({"path":"<工作区相对路径>","content":"<完整文件内容>"})]' as const;

export const TOOL_CALL_RENAME_FILE =
  '[TOOL_CALL: rename_file({"path":"<文件相对路径>","newName":"<新文件名（不含路径）>"})]' as const;

export const TOOL_CALL_MOVE_FILE =
  '[TOOL_CALL: move_file({"srcPath":"<源文件相对路径>","destPath":"<目标相对路径（含新文件名）>"})]' as const;

export const TOOL_CALL_CREATE_DIRECTORY =
  '[TOOL_CALL: create_directory({"path":"<目录相对路径>"})]' as const;

export const TOOL_CALL_DELETE_FILE =
  '[TOOL_CALL: delete_file({"path":"<文件相对路径>"})]' as const;

export const TOOL_CALL_BATCH_RENAME =
  '[TOOL_CALL: batch_rename({"renames":[{"from":"<原路径>","to":"<新路径>"},{"from":"<原路径2>","to":"<新路径2>"}]})]' as const;
