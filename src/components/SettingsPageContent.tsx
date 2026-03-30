/**
 * 共享配置页 UI — 用于 Popup (App.tsx) 和 Options Page (OptionsApp.tsx)
 * 自行管理 chrome.storage.local 加载/保存，不依赖 MobX StateStore。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Settings2, CheckCircle2, RotateCcw, Save, FolderOpen, KeyRound, Globe, Pin, Plus, Trash2, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { DeepThinkConfig, DEFAULT_CONFIG, LoopModel, getReviewPhases, getSystemPromptTemplate } from '../types';

/* ── 各网站 SVG 图标 ── */
const GeminiIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48px" height="48px"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" /><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" /><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" /><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" /></svg>
);

const ChatGPTIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor">
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364l2.0201-1.1685a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
  </svg>
);

const DoubaoIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26C17.81 13.47 19 11.38 19 9c0-3.87-3.13-7-7-7zm1 13.72V16h-2v-.28C8.52 14.82 7 12.04 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 3.04-1.52 5.82-4 6.72zM9 18v1c0 1.66 1.34 3 3 3s3-1.34 3-3v-1H9z" />
  </svg>
);

const ZhipuIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3l2.5 5.5L20 12l-5.5 2.5L12 20l-2.5-5.5L4 12l5.5-2.5L12 5z" />
  </svg>
);

const DeepSeekIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor">
    <path d="M6.5 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5S8 12.83 8 12s-.67-1.5-1.5-1.5zm5 0c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm5 0c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zM12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z"/>
  </svg>
);
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ThemeProvider,
  Tooltip,
  Typography,
  createTheme,
} from '@mui/material';
import './SettingsPage.css';

const SETTINGS_THEME = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#8B7355' },
    secondary: { main: '#2e7d32' },
  },
  typography: {
    fontFamily: "'Segoe UI', 'Inter', Roboto, sans-serif",
    fontSize: 12,
  },
  shape: {
    borderRadius: 8,
  },
});

function clampConfig(c: DeepThinkConfig): DeepThinkConfig {
  const maxLoops = Math.max(1, c.maxLoops);
  const minLoops = Math.max(1, Math.min(c.minLoops, maxLoops));
  const loopDelay = Math.max(0, c.loopDelay);
  const maxToolRoundsPerTurn = Math.max(1, Math.min(50, c.maxToolRoundsPerTurn ?? 8));
  return { ...c, maxLoops, minLoops, loopDelay, maxToolRoundsPerTurn };
}

/* ── 数字字段 ── */
const NumField: React.FC<{
  label: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (v: number) => void;
}> = ({ label, value, min = 0, step = 1, onChange }) => (
  <Box className="sp-field">
    <Typography className="sp-field-label">{label}</Typography>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <IconButton
        size="small"
        onClick={() => onChange(Math.max(min, value - step))}
        sx={{ border: '1px solid #D4C9B8', borderRadius: '50%', width: 28, height: 28, flexShrink: 0 }}
      >
        <Typography sx={{ fontSize: 16, lineHeight: 1 }}>-</Typography>
      </IconButton>
      <TextField
        variant="standard"
        type="number"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.max(min, v));
        }}
        InputProps={{
          disableUnderline: true,
          inputProps: { min, step, style: { textAlign: 'center' } }
        }}
        sx={{
          flex: 1,
          '& .MuiInputBase-root': {
            borderRadius: '14px',
            backgroundColor: '#EBE5DB',
            height: 28,
            padding: 0,
          },
          '& input': { height: '28px', padding: 0, boxSizing: 'border-box' },
          '& input[type=number]': { MozAppearance: 'textfield' },
          '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
            WebkitAppearance: 'none', margin: 0,
          },
        }}
      />
      <IconButton
        size="small"
        onClick={() => onChange(value + step)}
        sx={{ border: '1px solid #D4C9B8', borderRadius: '50%', width: 28, height: 28, flexShrink: 0 }}
      >
        <Typography sx={{ fontSize: 16, lineHeight: 1 }}>+</Typography>
      </IconButton>
    </Box>
  </Box>
);

/* ── 设置页记忆卡片列表 ── */
const SettingsMemoryList: React.FC<{
  config: import('../types').DeepThinkConfig;
  update: (p: Partial<import('../types').DeepThinkConfig>) => void;
}> = ({ config, update }) => {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const memories = config.pinnedMemories ?? [];

  const handleAdd = () => {
    const newId = Date.now().toString();
    update({ pinnedMemories: [...memories, { id: newId, enabled: true, title: t('panel_memory_new'), content: '' }] });
    setExpandedId(newId);
  };

  const updateMem = (id: string, patch: Partial<{ title: string; content: string; enabled: boolean }>) => {
    update({ pinnedMemories: memories.map(m => m.id === id ? { ...m, ...patch } : { ...m }) });
  };

  const removeMem = (id: string) => {
    update({ pinnedMemories: memories.filter(m => m.id !== id).map(m => ({ ...m })) });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {memories.map((mem) => {
        const isExpanded = expandedId === mem.id;
        return (
          <Box
            key={mem.id}
            sx={{
              border: `1px solid ${mem.enabled ? 'rgba(139,115,85,0.2)' : '#e0e0e0'}`,
              borderRadius: '12px',
              bgcolor: mem.enabled ? 'rgba(139,115,85,0.03)' : '#fcfcfc',
              overflow: 'hidden',
              transition: 'all 0.2s',
              opacity: mem.enabled ? 1 : 0.7,
            }}
          >
            <Box
              sx={{ display: 'flex', alignItems: 'center', p: 1.2, cursor: 'pointer', gap: 1.5 }}
              onClick={() => setExpandedId(isExpanded ? null : mem.id)}
            >
              <Switch
                size="small"
                checked={mem.enabled}
                onChange={(e) => updateMem(mem.id, { enabled: e.target.checked })}
                onClick={(e) => e.stopPropagation()}
                sx={{ ml: 0.5 }}
              />
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: mem.enabled ? '#8B7355' : '#666', whiteSpace: 'nowrap' }}>
                  {mem.title || t('panel_memory_unnamed')}
                </Typography>
                {!isExpanded && mem.content && (
                  <Typography sx={{ fontSize: 12, color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    - {mem.content}
                  </Typography>
                )}
              </Box>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); removeMem(mem.id); }}
                sx={{ color: '#ff6b6b', opacity: 0.6, '&:hover': { opacity: 1, bgcolor: 'rgba(255,107,107,0.1)' } }}
              >
                <Trash2 size={14} />
              </IconButton>
              <Box sx={{ color: '#ccc', display: 'flex', alignItems: 'center' }}>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </Box>
            </Box>
            {isExpanded && (
              <Box sx={{ p: 1.5, pt: 0, borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                <TextField
                  fullWidth variant="standard"
                  placeholder={t('panel_memory_title_placeholder')}
                  value={mem.title}
                  onChange={(e) => updateMem(mem.id, { title: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  sx={{ mb: 1, mt: 1, '& .MuiInputBase-input': { fontSize: 13, fontWeight: 600, color: '#333' } }}
                  InputProps={{ disableUnderline: true }}
                />
                <TextField
                  multiline minRows={2} maxRows={8}
                  placeholder={t('panel_memory_content_placeholder')}
                  value={mem.content}
                  onChange={(e) => updateMem(mem.id, { content: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  fullWidth variant="outlined" size="small"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      fontSize: 12,
                      backgroundColor: mem.enabled ? '#fff' : '#f5f5f5',
                      borderRadius: '8px',
                      '& fieldset': { borderColor: 'rgba(0,0,0,0.08)' },
                      '&:hover fieldset': { borderColor: 'rgba(139,115,85,0.3)' },
                      '&.Mui-focused fieldset': { borderColor: '#8B7355' }
                    }
                  }}
                />
              </Box>
            )}
          </Box>
        );
      })}
      <Button
        variant="text" size="small" onClick={handleAdd}
        sx={{
          color: '#8B7355', bgcolor: 'rgba(139,115,85,0.05)', borderRadius: '8px', py: 1,
          '&:hover': { bgcolor: 'rgba(139,115,85,0.1)' }, display: 'flex', gap: 1
        }}
      >
        <Plus size={16} /> {t('panel_memory_add')}
      </Button>
    </Box>
  );
};

interface Props {
  /** popup 模式时设为 true，缩减高度 */
  popupMode?: boolean;
}

const STORAGE_KEY = 'dt-extension-config';
const MODE_STORAGE_KEY = 'dt-extension-agent-mode';

const SettingsPageContent: React.FC<Props> = ({ popupMode = false }) => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<DeepThinkConfig>({ ...DEFAULT_CONFIG });
  const [saved, setSaved] = useState(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 加载 */
  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY).then((result) => {
      const stored = result[STORAGE_KEY] as DeepThinkConfig | undefined;
      const loaded = clampConfig({ ...DEFAULT_CONFIG, ...stored });
      setConfig(loaded);
      if (loaded.language) {
        i18n.changeLanguage(loaded.language);
      }
    }).catch(() => {/* 开发环境无 chrome，忽略 */ });
  }, []);

  /* 防抖保存 */
  const persist = useCallback((cfg: DeepThinkConfig) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      chrome.storage.local.set({ [STORAGE_KEY]: cfg }).then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }).catch(() => { });
    }, 400);
  }, []);

  const update = useCallback((partial: Partial<DeepThinkConfig>) => {
    setConfig((prev) => {
      const next = clampConfig({ ...prev, ...partial });
      if (partial.language && partial.language !== prev.language) {
        i18n.changeLanguage(partial.language);
        const oldLang = prev.language || 'zh';
        const newLang = partial.language;
        // 仅当用户未自定义时才跟随语言切换，保护用户已修改的内容
        const oldDefaultPhases = getReviewPhases(oldLang);
        if (JSON.stringify(prev.reviewPhases) === JSON.stringify(oldDefaultPhases)) {
          next.reviewPhases = getReviewPhases(newLang);
        }
        const oldDefaultTemplate = getSystemPromptTemplate(oldLang, prev.markers);
        if (prev.systemPromptTemplate === oldDefaultTemplate) {
          next.systemPromptTemplate = getSystemPromptTemplate(newLang, prev.markers);
        }
      }
      persist(next);
      return next;
    });
  }, [persist]);

 

  const handleResetAndClear = () => {
    const currentLang = config.language || 'zh';
    const def = {
      ...DEFAULT_CONFIG,
      language: currentLang,
      reviewPhases: getReviewPhases(currentLang),
      systemPromptTemplate: getSystemPromptTemplate(currentLang, DEFAULT_CONFIG.markers)
    };
    chrome.storage.local.remove([STORAGE_KEY, MODE_STORAGE_KEY]).then(() => {
      setConfig(def);
      i18n.changeLanguage(def.language);
      persist(def);
    }).catch(() => {
      setConfig(def);
      i18n.changeLanguage(def.language);
      persist(def);
    });
  };

  return (
    <ThemeProvider theme={SETTINGS_THEME}>
      <div className={`sp-root${popupMode ? ' sp-popup' : ''}`}>

        {/* ── 头部 ── */}
        <div className="sp-header">
          <div className="sp-header-title">
            <Bot size={16} />
            {t('settings_title')}
          </div>
          <span className="sp-header-badge">{t('settings_badge')}</span>
        </div>

        {/* ── 保存反馈 ── */}
        {saved && (
          <div className="sp-saved-bar">
            <Save size={12} />
            {t('settings_saved')}
          </div>
        )}

        {/* ── 内容区 ── */}
        <div className="sp-body">

          {/* 启用网站 */}
          <div className="sp-section">
            <div className="sp-section-label">
              <Globe size={11} />
              {t('settings_site_section')}
            </div>
            <div className="sp-site-grid">
              {(
                [
                  { key: 'gemini', label: t('settings_site_gemini'), Icon: GeminiIcon },
                  { key: 'doubao', label: t('settings_site_doubao'), Icon: DoubaoIcon },
                  { key: 'chatgpt', label: t('settings_site_chatgpt'), Icon: ChatGPTIcon },
                  { key: 'zhipu', label: t('settings_site_zhipu'), Icon: ZhipuIcon },
                  { key: 'deepseek', label: t('settings_site_deepseek'), Icon: DeepSeekIcon },
                ] as const
              ).map(({ key, label, Icon }) => {
                const enabled = config.siteEnabled?.[key] ?? true;
                return (
                  <button
                    key={key}
                    type="button"
                    title={label}
                    className={`sp-site-btn${enabled ? ' sp-site-btn--on' : ''}`}
                    onClick={() =>
                      update({ siteEnabled: { ...config.siteEnabled, [key]: !enabled } })
                    }
                  >
                    <span className="sp-site-btn-icon">
                      <Icon />
                    </span>
                    <span className="sp-site-btn-label">{label}</span>
                    <span className={`sp-site-btn-check${enabled ? ' sp-site-btn-check--on' : ''}`}>✓</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sp-divider" />

          {/* 核心记忆 */}
          <div className="sp-section">
            <div className="sp-section-label">
              <Pin size={11} />
              {t('panel_memory_title')}
            </div>
            <Typography sx={{ fontSize: 11, color: 'rgba(45,45,45,0.55)', mb: 1.5, lineHeight: 1.5 }}>
              {t('panel_memory_desc')}
            </Typography>
            <SettingsMemoryList config={config} update={update} />
          </div>

          <div className="sp-divider" />

          {/* 循环设置 */}
          <div className="sp-section">
            <div className="sp-section-label">
              <Settings2 size={11} />
              {t('settings_loop')}
            </div>

            <TextField
              select
              label={t('settings_language')}
              value={config.language || 'zh'}
              onChange={(e) => update({ language: e.target.value as 'zh' | 'en' })}
              fullWidth
              size="small"
              sx={{ mb: 1.5 }}
            >
              <MenuItem value="zh">简体中文</MenuItem>
              <MenuItem value="en">English</MenuItem>
            </TextField>

            <NumField
              label={t('settings_max_loops')}
              value={config.maxLoops}
              min={1}
              onChange={(v) => update({ maxLoops: v })}
            />
            <NumField
              label={t('settings_min_loops')}
              value={config.minLoops}
              min={1}
              onChange={(v) => update({ minLoops: v })}
            />
            <NumField
              label={t('settings_loop_delay')}
              value={config.loopDelay}
              min={0}
              step={100}
              onChange={(v) => update({ loopDelay: v })}
            />
          </div>

          <div className="sp-divider" />

          {/* 审查视角 */}
          <div className="sp-section">
            <div className="sp-section-label">
              <CheckCircle2 size={11} />
              {t('settings_review_phases')}
            </div>
            <TextField
              label={t('settings_review_placeholder')}
              multiline
              minRows={popupMode ? 5 : 8}
              value={Array.isArray(config.reviewPhases) ? config.reviewPhases.join('\n') : ''}
              onChange={(e) => {
                const phases = e.target.value.split('\n').filter((s) => s.trim());
                if (phases.length > 0) update({ reviewPhases: phases });
              }}
              fullWidth
              size="small"
            />
          </div>

          <div className="sp-divider" />

          {/* 系统提示词 */}
          <div className="sp-section">
            <div className="sp-section-label">{t('settings_system_prompt')}</div>
            <TextField
              multiline
              minRows={popupMode ? 6 : 10}
              value={config.systemPromptTemplate}
              onChange={(e) => update({ systemPromptTemplate: e.target.value })}
              fullWidth
              size="small"
            />
          </div>

          <div className="sp-divider" />

          {/* 全能 Agent / Tavily */}
          <div className="sp-section">
            <div className="sp-section-label">
              <KeyRound size={11} />
              {t('settings_agent_config')}
            </div>
            <TextField
              select
              label={t('settings_loop_model')}
              value={config.loopModel}
              onChange={(e) => update({ loopModel: e.target.value as LoopModel })}
              fullWidth
              size="small"
              sx={{ mb: 1.5 }}
            >
              <MenuItem value="fast">{t('settings_model_fast')}</MenuItem>
              <MenuItem value="think">{t('settings_model_think')}</MenuItem>
              <MenuItem value="pro">{t('settings_model_pro')}</MenuItem>
            </TextField>

            <TextField
              label={t('settings_tavily_key')}
              type="password"
              autoComplete="off"
              placeholder={popupMode ? t('settings_tavily_hint_popup') : t('settings_tavily_hint_page')}
              value={config.tavilyApiKey}
              onChange={(e) => update({ tavilyApiKey: e.target.value })}
              fullWidth
              size="small"
            />
            <Typography className="sp-hint" sx={{ mt: 0.8 }}>
              {t('settings_tavily_desc')}
            </Typography>
            {!config.tavilyApiKey && config.tavilyEnabled && (
              <Alert severity="warning" sx={{ mt: 0.8, '& .MuiAlert-message': { fontSize: 11 } }}>
                {t('settings_tavily_warn')}
              </Alert>
            )}

            <NumField
              label={t('settings_max_tool_rounds')}
              value={config.maxToolRoundsPerTurn}
              min={1}
              step={1}
              onChange={(v) => update({ maxToolRoundsPerTurn: v })}
            />
          </div>

          <div className="sp-divider" />

          {/* 本地工作区授权（开发中，暂时 disable） */}
          <div className="sp-section sp-section--disabled">
            <div className="sp-section-label">
              <FolderOpen size={11} />
              {t('settings_workspace')}
              <span className="sp-wip-badge">
                <Lock size={9} />
                {t('settings_wip')}
              </span>
            </div>
            <Tooltip title={t('settings_wip_tooltip')} placement="top" arrow>
              <span style={{ display: 'block' }}>
                <FormControlLabel
                  disabled
                  control={(
                    <Switch
                      disabled
                      checked={config.localFolderEnabled}
                    />
                  )}
                  label={t('settings_local_folder')}
                  sx={{ mt: 0.5, opacity: 0.5 }}
                />
              </span>
            </Tooltip>
            <Tooltip title={t('settings_wip_tooltip')} placement="top" arrow>
              <span style={{ display: 'inline-block', marginTop: 8 }}>
                <Button
                  disabled
                  type="button"
                  variant="outlined"
                  size="small"
                  sx={{ opacity: 0.45 }}
                >
                  <FolderOpen size={14} />
                  {t('settings_workspace_select')}
                </Button>
              </span>
            </Tooltip>
          </div>

        </div>

        {/* ── 底部 ── */}
        <div className="sp-footer">
          <Stack alignItems="center" spacing={1.2}>
            <Button variant="outlined" color="error" size="small" onClick={handleResetAndClear}>
              <RotateCcw size={11} />
              {t('settings_reset_all')}
            </Button>
          </Stack>
        </div>

      </div>
    </ThemeProvider>
  );
};

export default SettingsPageContent;

