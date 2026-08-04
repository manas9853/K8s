import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Chip,
  CircularProgress,
  Divider,
  Tooltip,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined';
import HistoryIcon from '@mui/icons-material/History';
import TipsAndUpdatesOutlinedIcon from '@mui/icons-material/TipsAndUpdatesOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import { API_BASE_URL } from '../../../config/api';
import { colors } from '../../../theme/colors';

// ─── Inline markdown renderer ─────────────────────────────────────────────────
// No external deps. Handles **bold**, newlines, bullet/numbered lists.
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/\*\*(.+?)\*\*/g);
    const rendered = parts.map((part, j) =>
      j % 2 === 1
        ? <strong key={j} style={{ color: colors.textPrimary, fontWeight: 700 }}>{part}</strong>
        : part
    );
    return (
      <React.Fragment key={i}>
        {rendered}
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

// ─── Design tokens (matches Incidents.tsx) ───────────────────────────────────

const DK = {
  bg:      colors.background,
  surface: colors.surface,
  surface2:colors.surfaceHover,
  border:  colors.border,
  text:    colors.textPrimary,
  muted:   colors.textSecondary,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface RelatedResource {
  name: string;
  namespace?: string;
  kind?: string;
}

interface Conversation {
  id: string;
  userQuery: string;
  aiResponse: string;
  confidence: number;
  relatedResources: RelatedResource[];
  suggestions: string[];
  timestamp: string;
}

interface HistoryItem {
  query: string;
  timestamp: string;
}

// ─── Suggested starter queries ────────────────────────────────────────────────

const STARTER_QUERIES = [
  { label: '💸 Why is my cluster expensive?',    query: 'Why is my cluster expensive?' },
  { label: '🔥 Which pods waste the most CPU?',   query: 'Which workloads waste the most CPU?' },
  { label: '🔒 Show security vulnerabilities',    query: 'Show security vulnerabilities' },
  { label: '💾 Find orphaned storage',            query: 'Find orphaned PVCs and wasted storage' },
  { label: '🔁 Pods crashing or restarting',      query: 'Which pods are crashing or restarting?' },
  { label: '🏥 Cluster health overview',          query: 'Give me a cluster health overview' },
  { label: '📉 Idle namespaces',                  query: 'List idle namespaces' },
  { label: '💡 What should I fix first?',         query: 'What should I optimize first?' },
];

// ─── Confidence badge ─────────────────────────────────────────────────────────

const ConfidenceBadge: React.FC<{ value: number }> = ({ value }) => {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? colors.success : pct >= 65 ? colors.warning : colors.danger;
  return (
    <Chip
      label={`${pct}% confidence`}
      size="small"
      sx={{
        bgcolor: `${color}1a`,
        color,
        border: `1px solid ${color}44`,
        fontWeight: 600,
        fontSize: '0.68rem',
      }}
    />
  );
};

// ─── User bubble ──────────────────────────────────────────────────────────────

const UserBubble: React.FC<{ query: string; timestamp: string }> = ({ query, timestamp }) => (
  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 1 }}>
    <Box sx={{ maxWidth: '70%' }}>
      <Box
        sx={{
          bgcolor: colors.info,
          borderRadius: '12px 12px 2px 12px',
          px: 2,
          py: 1.25,
          color: '#ffffff',
          fontSize: '0.9rem',
          lineHeight: 1.6,
          wordBreak: 'break-word',
        }}
      >
        {query}
      </Box>
      <Typography sx={{ color: DK.muted, fontSize: '0.68rem', mt: 0.5, textAlign: 'right' }}>
        {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Typography>
    </Box>
    <Box sx={{ mt: 0.5, flexShrink: 0 }}>
      <PersonOutlineIcon sx={{ fontSize: 20, color: DK.muted }} />
    </Box>
  </Box>
);

// ─── AI bubble ────────────────────────────────────────────────────────────────

const AIBubble: React.FC<{
  conv: Conversation;
  onSuggestion: (q: string) => void;
  onFeedback: (convId: string, query: string, response: string, rating: 'up' | 'down') => void;
  feedbackDone: Record<string, 'up' | 'down'>;
}> = ({ conv, onSuggestion, onFeedback, feedbackDone }) => (
  <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2.5, gap: 1 }}>
    <Box sx={{ mt: 0.5, flexShrink: 0 }}>
      <SmartToyOutlinedIcon sx={{ fontSize: 20, color: colors.info }} />
    </Box>
    <Box sx={{ maxWidth: '80%' }}>
      {/* Main response */}
      <Box
        sx={{
          bgcolor: DK.surface2,
          border: `1px solid ${DK.border}`,
          borderRadius: '2px 12px 12px 12px',
          px: 2,
          py: 1.5,
          color: DK.text,
          fontSize: '0.88rem',
          lineHeight: 1.75,
          wordBreak: 'break-word',
        }}
      >
        {renderMarkdown(conv.aiResponse)}
      </Box>

      {/* Meta row: confidence + timestamp */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
        <ConfidenceBadge value={conv.confidence} />
        <Typography sx={{ color: DK.muted, fontSize: '0.68rem' }}>
          {new Date(conv.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Typography>
      </Box>

      {/* Related resources chips */}
      {conv.relatedResources.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
          {conv.relatedResources.map((r, i) => (
            <Chip
              key={i}
              label={r.kind ? `${r.kind}/${r.name}` : r.name}
              size="small"
              variant="outlined"
              sx={{
                borderColor: DK.border,
                color: DK.muted,
                fontSize: '0.68rem',
                height: 22,
              }}
            />
          ))}
        </Box>
      )}

      {/* Follow-up suggestion chips */}
      {conv.suggestions.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
          {conv.suggestions.map((s, i) => (
            <Chip
              key={i}
              label={s}
              size="small"
              clickable
              onClick={() => onSuggestion(s)}
              sx={{
                bgcolor: `${colors.info}22`,
                color: colors.info,
                border: `1px solid ${colors.info}55`,
                fontSize: '0.72rem',
                '&:hover': { bgcolor: `${colors.info}44` },
              }}
            />
          ))}
        </Box>
      )}

      {/* Feedback buttons */}
      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, alignItems: 'center' }}>
        <Tooltip title="Helpful">
          <IconButton
            size="small"
            disabled={!!feedbackDone[conv.id]}
            onClick={() => onFeedback(conv.id, conv.userQuery, conv.aiResponse, 'up')}
            sx={{ color: feedbackDone[conv.id] === 'up' ? colors.success : DK.muted,
                  '&:hover': { color: colors.success } }}
          >
            <ThumbUpOutlinedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Not helpful">
          <IconButton
            size="small"
            disabled={!!feedbackDone[conv.id]}
            onClick={() => onFeedback(conv.id, conv.userQuery, conv.aiResponse, 'down')}
            sx={{ color: feedbackDone[conv.id] === 'down' ? colors.danger : DK.muted,
                  '&:hover': { color: colors.danger } }}
          >
            <ThumbDownOutlinedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        {feedbackDone[conv.id] && (
          <Typography sx={{ color: DK.muted, fontSize: '0.65rem', ml: 0.25 }}>
            {feedbackDone[conv.id] === 'up' ? 'Thanks!' : 'Noted'}
          </Typography>
        )}
      </Box>
    </Box>
  </Box>
);

// ─── Main component ────────────────────────────────────────────────────────────

const NaturalLanguageQueries: React.FC = () => {
  const { activeClusterId, activeClusterName } = useActiveCluster();

  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [history, setHistory]           = useState<HistoryItem[]>([]);
  const [error, setError]               = useState<string | null>(null);
  const [feedbackDone, setFeedbackDone] = useState<Record<string, 'up' | 'down'>>({});

  const threadRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when a new message arrives
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [conversations, loading]);

  const submitQuery = useCallback(async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setInput('');

    // Append placeholder (will be replaced on response)
    const tempId = `q-${Date.now()}`;

    // Add to history sidebar
    setHistory(prev => [{ query: trimmed, timestamp: new Date().toISOString() }, ...prev.slice(0, 19)]);

    try {
      const res = await fetch(`${API_BASE_URL}/v1/autonomous-ai/copilot/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          cluster: activeClusterId === 'all' ? null : activeClusterId,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body?.detail ?? `Error ${res.status}`);
        setLoading(false);
        return;
      }

      const conv: Conversation = {
        id: body.query_id ?? tempId,
        userQuery: trimmed,
        aiResponse: body.response ?? '(no response)',
        confidence: body.confidence ?? 0.80,
        relatedResources: body.related_resources ?? [],
        suggestions: body.suggestions ?? [],
        timestamp: body.timestamp ?? new Date().toISOString(),
      };

      setConversations(prev => [...prev, conv]);
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
    } finally {
      setLoading(false);
    }
  }, [activeClusterId, loading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitQuery(input);
    }
  };

  const handleStarterClick = (query: string) => {
    submitQuery(query);
  };

  const handleFeedback = useCallback(async (
    convId: string, query: string, response: string, rating: 'up' | 'down'
  ) => {
    // Optimistic UI update — mark immediately
    setFeedbackDone(p => ({ ...p, [convId]: rating }));
    try {
      await fetch(`${API_BASE_URL}/v1/autonomous-ai/copilot/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_id: convId,
          query,
          response,
          rating,
          cluster: activeClusterId === 'all' ? null : activeClusterId,
        }),
      });
      // Fire and forget — we already marked optimistically; backend failure is silent
    } catch {
      // Silently ignore — the UI already shows "Thanks!" / "Noted"
    }
  }, [activeClusterId]);

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', gap: 0 }}>

      {/* ── Left: Chat area ──────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <Box sx={{ px: 3, pt: 3, pb: 1.5, borderBottom: `1px solid ${DK.border}`, bgcolor: DK.surface }}>
          <Typography sx={{ color: DK.text, fontSize: '1.1rem', fontWeight: 600 }}>
            Natural Language Queries
          </Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.8rem', mt: 0.25 }}>
            Ask anything about your Kubernetes infrastructure — real answers from{' '}
            <span style={{ color: colors.info }}>{activeClusterName}</span>
          </Typography>
        </Box>

        {/* Thread */}
        <Box
          ref={threadRef}
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: 3,
            py: 2.5,
            '&::-webkit-scrollbar': { width: 6 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': { bgcolor: DK.border, borderRadius: 3 },
          }}
        >
          {/* Empty state: starter chips */}
          {conversations.length === 0 && !loading && (
            <Box sx={{ textAlign: 'center', mt: 6 }}>
              <SmartToyOutlinedIcon sx={{ fontSize: 48, color: DK.border, mb: 2 }} />
              <Typography sx={{ color: DK.muted, fontSize: '0.95rem', mb: 3 }}>
                Ask a question in plain English — no Kubernetes jargon required
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', maxWidth: 560, mx: 'auto' }}>
                {STARTER_QUERIES.map((sq) => (
                  <Chip
                    key={sq.query}
                    label={sq.label}
                    clickable
                    onClick={() => handleStarterClick(sq.query)}
                    sx={{
                      bgcolor: DK.surface,
                      color: DK.text,
                      border: `1px solid ${DK.border}`,
                      fontSize: '0.8rem',
                      '&:hover': { bgcolor: DK.surface2, borderColor: colors.info },
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Conversation thread */}
          {conversations.map((conv) => (
            <React.Fragment key={conv.id}>
              <UserBubble query={conv.userQuery} timestamp={conv.timestamp} />
              <AIBubble conv={conv} onSuggestion={submitQuery}
                onFeedback={handleFeedback} feedbackDone={feedbackDone} />
            </React.Fragment>
          ))}

          {/* Typing indicator */}
          {loading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <SmartToyOutlinedIcon sx={{ fontSize: 20, color: colors.info }} />
              <Box
                sx={{
                  bgcolor: DK.surface2,
                  border: `1px solid ${DK.border}`,
                  borderRadius: '2px 12px 12px 12px',
                  px: 2,
                  py: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <CircularProgress size={14} sx={{ color: colors.info }} />
                <Typography sx={{ color: DK.muted, fontSize: '0.82rem' }}>Thinking…</Typography>
              </Box>
            </Box>
          )}

          {/* Error */}
          {error && (
            <Box sx={{ bgcolor: `${colors.danger}1a`, border: `1px solid ${colors.danger}44`, borderRadius: 2, px: 2, py: 1.25, mb: 2 }}>
              <Typography sx={{ color: colors.danger, fontSize: '0.83rem' }}>{error}</Typography>
            </Box>
          )}
        </Box>

        {/* Input bar */}
        <Box
          sx={{
            px: 3,
            py: 2,
            borderTop: `1px solid ${DK.border}`,
            bgcolor: DK.surface,
            display: 'flex',
            gap: 1.5,
            alignItems: 'flex-end',
          }}
        >
          <TextField
            fullWidth
            multiline
            maxRows={4}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your cluster… (Enter to send, Shift+Enter for newline)"
            disabled={loading}
            variant="outlined"
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: DK.bg,
                color: DK.text,
                fontSize: '0.88rem',
                borderRadius: 2,
                '& fieldset': { borderColor: DK.border },
                '&:hover fieldset': { borderColor: colors.info },
                '&.Mui-focused fieldset': { borderColor: colors.info },
              },
              '& .MuiInputBase-input::placeholder': { color: DK.muted, opacity: 1 },
            }}
          />
          <Tooltip title="Send (Enter)">
            <span>
              <IconButton
                onClick={() => submitQuery(input)}
                disabled={loading || !input.trim()}
                sx={{
                  bgcolor: colors.info,
                  color: '#fff',
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  '&:hover': { bgcolor: colors.info, opacity: 0.85 },
                  '&.Mui-disabled': { bgcolor: DK.surface2, color: DK.muted },
                }}
              >
                {loading
                  ? <CircularProgress size={18} sx={{ color: '#fff' }} />
                  : <SendIcon sx={{ fontSize: 18 }} />
                }
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Right: Sidebar ──────────────────────────────────────────────── */}
      <Box
        sx={{
          width: 280,
          flexShrink: 0,
          borderLeft: `1px solid ${DK.border}`,
          bgcolor: DK.surface,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* History */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pt: 2, pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <HistoryIcon sx={{ fontSize: 16, color: DK.muted }} />
            <Typography sx={{ color: DK.text, fontSize: '0.8rem', fontWeight: 600 }}>
              Recent Queries
            </Typography>
          </Box>

          {history.length === 0 ? (
            <Typography sx={{ color: DK.muted, fontSize: '0.78rem' }}>No history yet</Typography>
          ) : (
            <List dense disablePadding>
              {history.map((item, i) => (
                <React.Fragment key={i}>
                  <ListItemButton
                    onClick={() => submitQuery(item.query)}
                    sx={{
                      px: 1,
                      py: 0.75,
                      borderRadius: 1,
                      '&:hover': { bgcolor: DK.surface2 },
                    }}
                  >
                    <ListItemText
                      primary={item.query}
                      secondary={new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      primaryTypographyProps={{
                        noWrap: true,
                        sx: { color: DK.text, fontSize: '0.78rem' },
                      }}
                      secondaryTypographyProps={{
                        sx: { color: DK.muted, fontSize: '0.68rem' },
                      }}
                    />
                  </ListItemButton>
                  {i < history.length - 1 && <Divider sx={{ borderColor: DK.border }} />}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>

        {/* Tips */}
        <Box sx={{ borderTop: `1px solid ${DK.border}`, px: 2, py: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
            <TipsAndUpdatesOutlinedIcon sx={{ fontSize: 16, color: colors.warning }} />
            <Typography sx={{ color: DK.text, fontSize: '0.8rem', fontWeight: 600 }}>
              Tips
            </Typography>
          </Box>
          {[
            ['Be specific', 'Include namespace or pod names for scoped answers'],
            ['Ask about cost', '"Why is kube-system expensive?"'],
            ['Ask about health', '"Which pods are crashing?"'],
            ['Set thresholds', '"Pods using more than 80% memory"'],
          ].map(([title, tip]) => (
            <Box key={title} sx={{ mb: 1 }}>
              <Typography sx={{ color: DK.text, fontSize: '0.75rem', fontWeight: 600 }}>{title}</Typography>
              <Typography sx={{ color: DK.muted, fontSize: '0.72rem', lineHeight: 1.5 }}>{tip}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

    </Box>
  );
};

export default NaturalLanguageQueries;

// Made with Bob
