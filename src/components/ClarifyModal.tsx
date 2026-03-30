import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Button,
    Chip,
    Collapse,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { HelpCircle, Send, SkipForward, Pencil } from 'lucide-react';
import { StateStore } from '../stores/state-store';
import { ClarifyQuestion } from '../types';

interface Props {
    store: StateStore;
    onSubmit: (answers: string[]) => void;
    onSkip: () => void;
}

const CLARIFY_THEME = createTheme({
    palette: {
        mode: 'light',
        primary: { main: '#4A5568' },
        secondary: { main: '#718096' },
        background: { default: '#FFFFFF' },
    },
    typography: {
        fontFamily: "'Segoe UI', 'Inter', Roboto, sans-serif",
        fontSize: 13,
    },
    shape: { borderRadius: 8 },
});

const QuestionCard: React.FC<{
    index: number;
    question: ClarifyQuestion;
    answer: string;
    isActive: boolean;
    onChange: (val: string) => void;
}> = ({ index, question, answer, isActive, onChange }) => {
    const { t } = useTranslation();
    const [showCustom, setShowCustom] = useState(false);

    const isOption0 = !showCustom && answer === question.options[0];
    const isOption1 = !showCustom && answer === question.options[1];

    const handleChipClick = (opt: string) => {
        if (!isActive) return;
        setShowCustom(false);
        onChange(opt);
    };

    const handleCustomClick = () => {
        if (!isActive) return;
        setShowCustom(true);
        if (answer === question.options[0] || answer === question.options[1]) {
            onChange('');
        }
    };

    return (
        <Box
            sx={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                p: 2,
                boxShadow: isActive && answer ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                opacity: isActive ? 1 : 0.7,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.2, mb: 1.5 }}>
                <Box
                    sx={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: (isActive && answer) ? '#4A5568' : '#EDF2F7',
                        color: (isActive && answer) ? '#fff' : '#4A5568',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}
                >
                    {index + 1}
                </Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: '#2D3748', lineHeight: 1.4 }}>
                    {question.question}
                </Typography>
            </Box>

            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: showCustom && isActive ? 1.5 : 0 }}>
                <Chip
                    label={question.options[0]}
                    onClick={() => handleChipClick(question.options[0])}
                    variant={isOption0 ? 'filled' : 'outlined'}
                    size="small"
                    sx={{
                        maxWidth: '100%',
                        fontWeight: 500,
                        borderColor: isOption0 ? '#4A5568' : '#CBD5E0',
                        bgcolor: isOption0 ? '#4A5568' : 'transparent',
                        color: isOption0 ? '#fff' : '#4A5568',
                        cursor: isActive ? 'pointer' : 'default',
                        pointerEvents: isActive ? 'auto' : 'none',
                        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' },
                    }}
                />
                <Chip
                    label={question.options[1]}
                    onClick={() => handleChipClick(question.options[1])}
                    variant={isOption1 ? 'filled' : 'outlined'}
                    size="small"
                    sx={{
                        maxWidth: '100%',
                        fontWeight: 500,
                        borderColor: isOption1 ? '#4A5568' : '#CBD5E0',
                        bgcolor: isOption1 ? '#4A5568' : 'transparent',
                        color: isOption1 ? '#fff' : '#4A5568',
                        cursor: isActive ? 'pointer' : 'default',
                        pointerEvents: isActive ? 'auto' : 'none',
                        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' },
                    }}
                />
                {isActive && <Chip
                    icon={<Pencil size={12} />}
                    label={t('clarify_option_custom')}
                    onClick={handleCustomClick}
                    variant={showCustom ? 'filled' : 'outlined'}
                    size="small"
                    sx={{
                        maxWidth: '100%',
                        fontWeight: 500,
                        borderColor: showCustom ? '#718096' : '#CBD5E0',
                        bgcolor: showCustom ? '#718096' : 'transparent',
                        color: showCustom ? '#fff' : '#4A5568',
                        cursor: 'pointer',
                        '& .MuiChip-icon': { color: 'inherit' },
                        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' },
                    }}
                />}
            </Stack>

            {isActive && <Collapse in={showCustom}>
                <TextField
                    fullWidth
                    size="small"
                    placeholder={t('clarify_custom_placeholder')}
                    value={showCustom ? answer : ''}
                    onChange={(e) => onChange(e.target.value)}
                    variant="outlined"
                    sx={{
                        '& .MuiOutlinedInput-root': {
                            fontSize: 13,
                        },
                    }}
                />
            </Collapse>}
        </Box>
    );
};

const ClarifyBlock: React.FC<{
    questions: ClarifyQuestion[];
    isActive: boolean;
    store?: StateStore;
    onSubmit: (answers: string[]) => void;
    onSkip: () => void;
}> = observer(({ questions, isActive, onSubmit, onSkip }) => {
    const { t } = useTranslation();
    const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));

    const answered = answers.filter(Boolean).length;
    const canSubmit = answered > 0;

    const handleAnswerChange = (i: number, val: string) => {
        setAnswers((prev) => {
            const next = [...prev];
            next[i] = val;
            return next;
        });
    };

    return (
        <ThemeProvider theme={CLARIFY_THEME}>
            <Box
                sx={{
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    margin: '12px 0',
                    background: '#F7FAFC',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    overflow: 'hidden',
                    overflowX: 'hidden',
                }}
            >
                <Box
                    sx={{
                        background: isActive ? '#EDF2F7' : '#F7FAFC',
                        px: 2, py: 1.5,
                        display: 'flex', alignItems: 'center', gap: 1.5,
                        borderBottom: '1px solid #E2E8F0'
                    }}
                >
                    <Box
                        sx={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: '#CBD5E0',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <HelpCircle size={16} color="#4A5568" />
                    </Box>
                    <Box>
                        <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#2D3748' }}>
                            {t('clarify_title')}
                        </Typography>
                        {isActive && <Typography sx={{ fontSize: 11, color: '#718096', mt: 0.2 }}>
                            {t('clarify_subtitle')}
                        </Typography>}
                    </Box>
                </Box>

                <Box sx={{ p: 2 }}>
                    <Stack spacing={2}>
                        {questions.map((q, i) => (
                            <QuestionCard
                                key={i}
                                index={i}
                                question={q}
                                answer={answers[i] ?? ''}
                                isActive={isActive}
                                onChange={(val) => handleAnswerChange(i, val)}
                            />
                        ))}
                    </Stack>
                </Box>

                {isActive && (
                    <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid #E2E8F0', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1 }}>
                        <Button
                            variant="text"
                            onClick={onSkip}
                            startIcon={<SkipForward size={14} />}
                            sx={{ color: '#718096', textTransform: 'none', fontWeight: 600 }}
                        >
                            {t('clarify_skip')}
                        </Button>
                        <Button
                            variant="contained"
                            disabled={!canSubmit}
                            onClick={() => onSubmit(answers)}
                            endIcon={<Send size={14} />}
                            disableElevation
                            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '6px' }}
                        >
                            {t('clarify_submit')}
                        </Button>
                    </Box>
                )}
            </Box>
        </ThemeProvider>
    );
});

const ClarifyModal: React.FC<Props> = observer(({ store, onSubmit, onSkip }) => {
    const [mounts, setMounts] = useState<{ id: string; node: HTMLElement; questions: ClarifyQuestion[]; visible: boolean }[]>([]);
    const mountHostSelector = '.markdown, .response-content, .model-response-text, .markdown-content';

    const isHostHidden = (node: HTMLElement): boolean => {
        if (node.classList.contains('dt-hidden')) return true;
        if (node.hasAttribute('hidden')) return true;
        if (node.getAttribute('aria-hidden') === 'true') return true;
        const style = window.getComputedStyle(node);
        return style.display === 'none' || style.visibility === 'hidden';
    };

    const resolveInlineMountHost = (root: HTMLElement): HTMLElement => {
        const candidates = Array.from(root.querySelectorAll(mountHostSelector)) as HTMLElement[];
        const visibleCandidate = candidates.find((node) => !isHostHidden(node));
        const host = visibleCandidate ?? candidates[0] ?? root;
        if (host.classList.contains('dt-hidden')) {
            host.classList.remove('dt-hidden');
        }
        return host;
    };

    const isNodeVisible = (node: HTMLElement): boolean => {
        if (!node.isConnected) return false;
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (node.closest('.dt-hidden, [hidden], [aria-hidden="true"]')) return false;
        if (node.getClientRects().length === 0) return false;

        const rect = node.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const vh = window.innerHeight || document.documentElement.clientHeight;

        // 仅当节点与当前视口相交时才视为“可见”，否则启用右下角全局兜底。
        const intersectsViewport = rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
        return intersectsViewport;
    };

    const ensureGlobalFallbackMount = (): HTMLElement => {
        let el = document.getElementById('dt-clarify-global-fallback') as HTMLElement | null;
        if (el) return el;
        el = document.createElement('div');
        el.id = 'dt-clarify-global-fallback';
        el.className = 'dt-react-clarify-mount';
        el.style.position = 'fixed';
        el.style.top = 'auto';
        el.style.left = 'auto';
        el.style.right = '76px';
        el.style.bottom = '88px';
        el.style.width = 'min(420px, calc(100vw - 32px))';
        el.style.maxWidth = 'calc(100vw - 16px)';
        el.style.maxHeight = 'min(70vh, calc(100vh - 112px))';
        el.style.boxSizing = 'border-box';
        el.style.overflowX = 'hidden';
        el.style.overflowY = 'auto';
        el.style.overscrollBehavior = 'contain';
        el.style.zIndex = '2147483646';
        document.body.appendChild(el);
        return el;
    };

    useEffect(() => {
        // DeepSeek 的回答容器存在 overflow 裁剪，内联挂载无法显示，
        // 直接强制走 body fixed 兜底层。
        const isDeepSeek = window.location.hostname.includes('deepseek.com');

        const timer = setInterval(() => {
            // DeepSeek 专用快速路径：直接更新 global fallback，跳过内联挂载逻辑
            if (isDeepSeek) {
                if (store.userWorkflowPhase === 'clarify' && store.clarifyQuestions.length > 0) {
                    const globalFallback = ensureGlobalFallbackMount();
                    globalFallback.dataset.clarifyJson = JSON.stringify(store.clarifyQuestions);
                    setMounts([{ id: globalFallback.id, node: globalFallback, questions: store.clarifyQuestions, visible: true }]);
                } else {
                    const globalFallback = document.getElementById('dt-clarify-global-fallback') as HTMLElement | null;
                    if (globalFallback) globalFallback.remove();
                    setMounts([]);
                }
                return;
            }

            let nodes = Array.from(document.querySelectorAll('.dt-react-clarify-mount')) as HTMLElement[];

            nodes.forEach((node) => {
                const hiddenHost = node.closest('.markdown.dt-hidden, .response-content.dt-hidden, .model-response-text.dt-hidden, .markdown-content.dt-hidden') as HTMLElement | null;
                if (hiddenHost) {
                    hiddenHost.classList.remove('dt-hidden');
                }
            });

            // 当未检测到内联挂载点时，兜底挂到最后一条回答中，避免固定浮层打断阅读流。
            if (nodes.length === 0 && store.userWorkflowPhase === 'clarify' && store.clarifyQuestions.length > 0) {
                const responses = document.querySelectorAll('message-content');
                const lastResponse = responses.length > 0 ? (responses[responses.length - 1] as HTMLElement) : null;
                if (lastResponse) {
                    const mountHost = resolveInlineMountHost(lastResponse);
                    let fallbackMount = mountHost.querySelector('#dt-clarify-inline-fallback') as HTMLElement | null;
                    if (!fallbackMount) {
                        fallbackMount = document.createElement('div');
                        fallbackMount.id = 'dt-clarify-inline-fallback';
                        fallbackMount.className = 'dt-react-clarify-mount';
                        mountHost.appendChild(fallbackMount);
                    }
                    fallbackMount.dataset.clarifyJson = JSON.stringify(store.clarifyQuestions);
                    nodes = [fallbackMount, ...nodes];
                }
            }

            const visibleInlineExists = nodes.some((n) => n.id !== 'dt-clarify-global-fallback' && isNodeVisible(n));

            if (store.userWorkflowPhase === 'clarify' && store.clarifyQuestions.length > 0 && !visibleInlineExists) {
                const globalFallback = ensureGlobalFallbackMount();
                globalFallback.dataset.clarifyJson = JSON.stringify(store.clarifyQuestions);
                if (!nodes.includes(globalFallback)) {
                    nodes = [...nodes, globalFallback];
                }
            } else {
                const globalFallback = document.getElementById('dt-clarify-global-fallback') as HTMLElement | null;
                if (globalFallback) globalFallback.remove();
            }

            const newMounts: { id: string; node: HTMLElement; questions: ClarifyQuestion[]; visible: boolean }[] = [];
            nodes.forEach((node, idx) => {
                const el = node as HTMLElement;
                const jsonStr = el.dataset.clarifyJson;
                if (!jsonStr) return;
                try {
                    const parsed = JSON.parse(jsonStr);
                    const id = el.id || `clarify-mount-${idx}-${Date.now()}`;
                    if (!el.id) el.id = id;
                    const questions = Array.isArray(parsed) ? parsed : store.clarifyQuestions;
                    if (!Array.isArray(questions) || questions.length === 0) return;
                    newMounts.push({ id, node: el, questions, visible: isNodeVisible(el) });
                } catch {
                    // ignore
                }
            });
            setMounts(prev => {
                if (prev.length !== newMounts.length) return newMounts;
                let changed = false;
                for (let i = 0; i < prev.length; i++) {
                    if (prev[i].id !== newMounts[i].id || prev[i].visible !== newMounts[i].visible) { changed = true; break; }
                }
                return changed ? newMounts : prev;
            });
        }, 500);

        return () => {
            clearInterval(timer);
            const globalFallback = document.getElementById('dt-clarify-global-fallback') as HTMLElement | null;
            if (globalFallback) globalFallback.remove();
        };
    }, []);

    const lastVisibleIndex = mounts.map((m) => m.visible).lastIndexOf(true);
    const activeIndex = lastVisibleIndex >= 0 ? lastVisibleIndex : mounts.length - 1;

    return (
        <>
            {mounts.map((m, i) => {
                const isActive = i === activeIndex && store.userWorkflowPhase === 'clarify';
                return createPortal(
                    <ClarifyBlock
                        key={m.id}
                        questions={m.questions}
                        isActive={isActive}
                        store={store}
                        onSubmit={onSubmit}
                        onSkip={onSkip}
                    />,
                    m.node
                );
            })}
        </>
    );
});

export default ClarifyModal;
