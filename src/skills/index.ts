import {
  TOOL_CALL_LOCAL_FILE_READ,
  TOOL_CALL_LOCAL_FILE_WRITE,
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
      '【联网搜索】仅在缺证据或需核对时效时触发。必须使用下方括号格式（一行内）：',
      TOOL_CALL_WEB_SEARCH,
      '发出后勿编造检索结果；等待宿主在对话中追加 [TOOL_RESULT: web_search] 后再继续。',
    ].join('\n'),
    systemPromptFragmentEn: [
      '[Web Search] Trigger only when lacking evidence or needing to verify timeliness. You MUST use the bracket format below (single line):',
      TOOL_CALL_WEB_SEARCH,
      'Do not fabricate search results; wait for the host to append [TOOL_RESULT: web_search] in the conversation before proceeding.',
    ].join('\n'),
  },
  {
    id: 'local_files',
    title: '本地文件读写',
    description: '读取或写入用户工作区文件；读与写分别对应不同 tool 名与参数。',
    toolNames: ['read_local_file', 'write_local_file'],
    systemPromptFragment: [
      '【本地文件】读取 read_local_file / 写入 write_local_file；路径为用户已授权工作区内的相对路径，禁止 ..。',
      '读取示例：',
      TOOL_CALL_LOCAL_FILE_READ,
      '写入示例：',
      TOOL_CALL_LOCAL_FILE_WRITE,
      '写入前复述意图与路径；路径不明则先追问。',
    ].join('\n'),
    systemPromptFragmentEn: [
      '[Local Files] Read: read_local_file / Write: write_local_file. Path must be a relative path within the authorized workspace. ".." is forbidden.',
      'Read example:',
      '[TOOL_CALL: read_local_file({"path":"<relative_path>"})]',
      'Write example:',
      '[TOOL_CALL: write_local_file({"path":"<relative_path>","content":"<full file content>"})]',
      'State intent and confirm path before writing. If path is unclear, ask first.',
    ].join('\n'),
  },
];

export function buildToolsSystemPrompt(skills: AgentSkill[], lang: 'zh' | 'en' = 'zh'): string {
  return skills
    .map((s) => (lang === 'en' && s.systemPromptFragmentEn ? s.systemPromptFragmentEn : s.systemPromptFragment).trim())
    .filter(Boolean)
    .join('\n\n');
}
