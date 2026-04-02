import {
  TOOL_CALL_LIST_DIRECTORY,
  TOOL_CALL_READ_FILE,
  TOOL_CALL_READ_FILE_FULL,
  TOOL_CALL_READ_FILES,
  TOOL_CALL_SEARCH_FILES,
  TOOL_CALL_GREP_FILES,
  TOOL_CALL_ATTACH_FILE,
  TOOL_CALL_WEB_SEARCH,
} from './tool-format';

export interface AgentSkill {
  id: string;
  title: string;
  description: string;
  toolNames: string[];
  systemPromptFragment: string;
  systemPromptFragmentEn?: string;
}

export const allSkills: AgentSkill[] = [
  {
    id: 'web_search',
    title: '联网搜索',
    description: '在需要事实核验、最新资讯或引用来源时使用；通过结构化 TOOL_CALL 发起检索。',
    toolNames: ['web_search'],
    systemPromptFragment: [
      '[联网搜索] 仅在真正需要证据或核对时效时触发。必须使用下方括号格式（一行内）：',
      TOOL_CALL_WEB_SEARCH,
      '⚠️ 上面这行是你真正需要搜索时才输出的执行指令。绝不要把它当作示例展示给用户。输出 = 宿主立即执行。',
      '发出后勿编造检索结果；等待宿主在对话中追加 [TOOL_RESULT: web_search] 后再继续。',
    ].join('\n'),
    systemPromptFragmentEn: [
      '[Web Search] Trigger ONLY when you genuinely need evidence or need to verify timeliness. Use the bracket format below (single line):',
      TOOL_CALL_WEB_SEARCH,
      '⚠️ The line above is a live execution command you output ONLY when you actually need to search. NEVER output it as an example. Output = Host executes immediately.',
      'Do not fabricate search results; wait for the host to append [TOOL_RESULT: web_search] in the conversation before proceeding.',
    ].join('\n'),
  },
  {
    id: 'local_workspace',
    title: '本地工作区',
    description: '浏览、搜索和读取用户本地工作区的文件内容；批量读取减少对话轮次。',
    toolNames: ['list_directory', 'read_file', 'read_files', 'search_files', 'grep_files', 'attach_file_to_chat'],
    systemPromptFragment: [
      '[本地工作区文件读取] 你可以访问用户授权的本地工作区文件夹。可用工具：',
      '',
      '1. 列出目录（类似 ls / tree）：',
      TOOL_CALL_LIST_DIRECTORY,
      '   参数说明：path=目录相对路径（默认"."根目录），recursive=是否递归（默认false），maxDepth=最大深度（默认2）',
      '',
      '2. 读取单个文件（类似 cat）：',
      TOOL_CALL_READ_FILE_FULL,
      '',
      '3. 批量读取多个文件（⚡推荐！一次性读取所有需要的文件，减少对话轮次）：',
      TOOL_CALL_READ_FILES,
      '',
      '4. 按名称搜索文件（支持智能模式 + glob 模式）：',
      TOOL_CALL_SEARCH_FILES,
      '   • 不含 * ? 等 glob 元字符时进入智能模式：按空格拆分关键词（AND），自动忽略大小写和连字符/下划线',
      '   • 含 * ? 等元字符时进入 glob 模式，支持跨目录（如 src/**/*.ts）',
      '   • 带空格的文件名直接输入即可，无需转义',
      '',
      '5. 在文件内容中搜索文本/正则（类似 grep -r）：',
      TOOL_CALL_GREP_FILES,
      '   includePattern 按文件名过滤（如 *.ts），contextLines 控制上下文行数，isRegex=true 启用正则',
      '',
      '6. 读取文件指定行范围（大文件利器）：',
      TOOL_CALL_READ_FILE,
      '   省略 startLine/endLine 则读取全文：',
      TOOL_CALL_READ_FILE_FULL,
      '',
      '7. 将任意文件附加到 AI 聊天输入框（图片/PDF/文档/视频等均支持）：',
      TOOL_CALL_ATTACH_FILE,
      '   可选参数 targetSelector 用于覆盖输入框选择器',
      '   ℹ read_file 不能读取二进制文件，应改用此工具让 AI 直接看到文件内容',
      '',
      '⚠️ 上面的每个 [TOOL_CALL: ...] 行都是实时执行指令。你输出它 = 宿主立刻执行。绝不要把它们当作示例或说明展示。',
      '',
      '[重要策略]：',
      '- 先用 list_directory 了解项目结构',
      '- 然后用 read_files 一次性批量读取所有需要的文件（推荐！）',
      '- 可以在同一条消息中输出多个 TOOL_CALL，宿主会依次执行并一次性返回全部结果',
      '- 路径必须为工作区内的相对路径，禁止使用 ..',
      '- 发出后勿编造文件内容；等待宿主在对话中追加 [TOOL_RESULT: ...] 后再继续',
      '- 如果只是想描述你的文件访问能力，请用自然语言，不要重复上方语法',
    ].join('\n'),
    systemPromptFragmentEn: [
      '[Local Workspace File Access] You can access files in the user\'s authorized local workspace. Available tools:',
      '',
      '1. List directory contents (like ls / tree):',
      TOOL_CALL_LIST_DIRECTORY,
      '   Args: path=relative dir path (default "."), recursive=bool (default false), maxDepth=int (default 2)',
      '',
      '2. Read a single file (like cat):',
      TOOL_CALL_READ_FILE_FULL,
      '',
      '3. Batch read multiple files (⚡RECOMMENDED! Read all needed files at once to minimize turns):',
      TOOL_CALL_READ_FILES,
      '',
      '4. Search files by name (smart mode + glob mode):',
      TOOL_CALL_SEARCH_FILES,
      '   • Without glob chars (* ?): smart mode — splits query by spaces (AND), case-insensitive, ignores separators like - _ .',
      '   • With glob chars: glob mode — supports wildcards and cross-directory patterns (e.g. src/**/*.ts)',
      '   • Filenames with spaces work fine — just type them directly',
      '',
      '5. Search file contents by text or regex (like grep -r):',
      TOOL_CALL_GREP_FILES,
      '   includePattern filters by filename (e.g. *.ts), contextLines shows surrounding lines, isRegex=true enables regex',
      '',
      '6. Read specific line range of a file (great for large files):',
      TOOL_CALL_READ_FILE,
      '   Omit startLine/endLine to read the entire file:',
      TOOL_CALL_READ_FILE_FULL,
      '',
      '7. Attach any file to the AI chat input (images, PDF, documents, video, etc.):',
      TOOL_CALL_ATTACH_FILE,
      '   Optional targetSelector overrides the default input field detection',
      '   ℹ read_file cannot read binary files; use this tool to let the AI see file content directly',
      '',
      '⚠️ Every [TOOL_CALL: ...] line above is a live execution command. Output = Host executes immediately. NEVER output these as examples or illustrations.',
      '',
      '[Key Strategy]:',
      '- First, use list_directory to understand the project structure',
      '- Then use read_files to batch-read ALL needed files at once (recommended!)',
      '- You may output multiple TOOL_CALLs in a single message; the host will execute them all and return all results at once',
      '- Paths must be relative within the workspace; ".." is forbidden',
      '- Do not fabricate file contents; wait for [TOOL_RESULT: ...] before proceeding',
      '- If you only want to describe your file access capabilities, use natural language — do NOT reproduce the syntax above',
    ].join('\n'),
  },
];

export function buildToolsSystemPrompt(skills: AgentSkill[], lang: 'zh' | 'en' = 'zh'): string {
  return skills
    .map((s) => (lang === 'en' && s.systemPromptFragmentEn ? s.systemPromptFragmentEn : s.systemPromptFragment).trim())
    .filter(Boolean)
    .join('\n\n');
}
