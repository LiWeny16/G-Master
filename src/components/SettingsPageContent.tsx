/**
 * 共享配置页 UI — 用于 Popup (App.tsx) 和 Options Page (OptionsApp.tsx)
 * 自行管理 chrome.storage.local 加载/保存，不依赖 MobX StateStore。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Settings2, CheckCircle2, RotateCcw, Save, FolderOpen, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { DeepThinkConfig, DEFAULT_CONFIG, LoopModel, getReviewPhases, getSystemPromptTemplate } from '../types';
import { invokeBackground } from '../services/message-bus';
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
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <IconButton
        size="small"
        onClick={() => onChange(Math.max(min, value - step))}
        sx={{ border: '1px solid #D4C9B8', borderRadius: 1.5 }}
      >
        -
      </IconButton>
      <TextField
        type="number"
        size="small"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.max(min, v));
        }}
        inputProps={{ min, step }}
        sx={{ flex: 1 }}
      />
      <IconButton
        size="small"
        onClick={() => onChange(value + step)}
        sx={{ border: '1px solid #D4C9B8', borderRadius: 1.5 }}
      >
        +
      </IconButton>
    </Box>
  </Box>
);

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
      if (partial.language && i18n.language !== partial.language) {
        i18n.changeLanguage(partial.language);
      }
      persist(next);
      return next;
    });
  }, [persist]);

  const handleReset = () => {
    const currentLang = config.language || 'zh';
    const def = {
      ...DEFAULT_CONFIG,
      language: currentLang,
      reviewPhases: getReviewPhases(currentLang),
      systemPromptTemplate: getSystemPromptTemplate(currentLang, DEFAULT_CONFIG.markers)
    };
    setConfig(def);
    i18n.changeLanguage(def.language);
    persist(def);
  };

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

          {/* 全能 Agent / Tavily / 本地工作区 */}
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

            <FormControlLabel
              control={(
                <Switch
                  checked={config.localFolderEnabled}
                  onChange={(e) => update({ localFolderEnabled: e.target.checked })}
                />
              )}
              label={t('settings_local_folder')}
              sx={{ mt: 0.8 }}
            />
            <NumField
              label={t('settings_max_tool_rounds')}
              value={config.maxToolRoundsPerTurn}
              min={1}
              step={1}
              onChange={(v) => update({ maxToolRoundsPerTurn: v })}
            />
            <div className="sp-field" style={{ marginTop: 10 }}>
              <span className="sp-field-label">{t('settings_workspace')}</span>
              {popupMode ? (
                <Stack className="sp-hint" spacing={1}>
                  <Typography sx={{ fontSize: 12 }}>{t('settings_workspace_popup_hint')}</Typography>
                  <Button
                    type="button"
                    variant="outlined"
                    size="small"
                    onClick={() => chrome.runtime.openOptionsPage()}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    <Settings2 size={12} />
                    {t('settings_workspace_open_page')}
                  </Button>
                </Stack>
              ) : (
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  onClick={async () => {
                    if (!('showDirectoryPicker' in window)) {
                      alert(t('settings_workspace_not_supported'));
                      return;
                    }
                    try {
                      const handle = await (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker?.();
                      if (!handle) return;
                      const res = await invokeBackground({
                        type: 'SET_WORKSPACE_ROOT',
                        directoryHandle: handle,
                      });
                      if (res.ok) {
                        alert(t('settings_workspace_connected', { name: handle.name }));
                      } else {
                        alert(res.error);
                      }
                    } catch (err) {
                      if ((err as Error).name === 'AbortError') return;
                      alert(err instanceof Error ? err.message : String(err));
                    }
                  }}
                >
                  <FolderOpen size={14} />
                  {t('settings_workspace_select')}
                </Button>
              )}
            </div>
          </div>

        </div>

        {/* ── 底部 ── */}
        <div className="sp-footer">
          <Stack alignItems="center" spacing={1.2}>
            <Button variant="outlined" size="small" onClick={handleReset}>
              <RotateCcw size={11} />
              {t('settings_reset_default')}
            </Button>
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
