import { useMemo, useState } from 'react';
import { catalogRuntime } from '../data/index.ts';

type Kind = 'card' | 'hero';

type Props = {
  onRestartSuggested?: () => void;
};

export function CatalogConfigPanel({ onRestartSuggested }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('card');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [showRestartHint, setShowRestartHint] = useState(false);
  const [draft, setDraft] = useState(() => catalogRuntime.getDraft());
  const [dirty, setDirty] = useState(() => catalogRuntime.isDirty());

  function refresh() {
    setDraft(catalogRuntime.getDraft());
    setDirty(catalogRuntime.isDirty());
  }

  const items = useMemo(() => {
    const list =
      kind === 'card'
        ? draft.cards.map((c) => ({ id: c.defId, label: `${c.name} (${c.defId})` }))
        : draft.heroes.map((h) => ({ id: h.defId, label: `${h.name} (${h.defId})` }));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
  }, [draft, kind, query]);

  function selectItem(id: string, source = catalogRuntime.getDraft()) {
    setSelectedId(id);
    setStatus(null);
    const src =
      kind === 'card' ? source.cards.find((c) => c.defId === id) : source.heroes.find((h) => h.defId === id);
    setEditorText(src ? `${JSON.stringify(src, null, 2)}\n` : '');
  }

  function applyEditorToDraft(): boolean {
    if (!selectedId) {
      setStatus('请先选择条目');
      return false;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(editorText);
    } catch (e) {
      setStatus(`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    const result =
      kind === 'card'
        ? catalogRuntime.updateDraftCard(selectedId, parsed)
        : catalogRuntime.updateDraftHero(selectedId, parsed);
    if (!result.ok) {
      setStatus(result.error);
      return false;
    }
    refresh();
    return true;
  }

  function onSave() {
    if (selectedId && editorText.trim()) {
      if (!applyEditorToDraft()) return;
    }
    const result = catalogRuntime.save();
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    setStatus('已 Save：已应用到内存 DB，并写入 localStorage');
    setShowRestartHint(true);
    refresh();
  }

  function onExport() {
    if (dirty) {
      setStatus('有未保存草稿，请先 Save 或丢弃后再导出');
      return;
    }
    const text = catalogRuntime.exportCommittedJson();
    void navigator.clipboard.writeText(text).then(
      () => setStatus('已复制完整 catalog JSON 到剪贴板（可覆盖 src/data/catalog.json）'),
      () => {
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'catalog.json';
        a.click();
        URL.revokeObjectURL(url);
        setStatus('已下载 catalog.json');
      },
    );
  }

  function onReset() {
    catalogRuntime.reset();
    setSelectedId(null);
    setEditorText('');
    setShowRestartHint(true);
    setStatus('已 Reset：清除 localStorage，恢复仓库默认 catalog');
    refresh();
  }

  function onDiscard() {
    catalogRuntime.discardDraft();
    const next = catalogRuntime.getDraft();
    refresh();
    if (selectedId) selectItem(selectedId, next);
    else setEditorText('');
    setStatus('已丢弃草稿');
  }

  return (
    <div className="catalog-config">
      <button
        type="button"
        className="catalog-config__toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          refresh();
        }}
      >
        配置
      </button>

      {open && (
        <div className="catalog-config__panel" role="dialog" aria-label="内容配置">
          <div className="catalog-config__toolbar">
            <div className="catalog-config__tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={kind === 'card'}
                className={kind === 'card' ? 'is-active' : ''}
                onClick={() => {
                  setKind('card');
                  setSelectedId(null);
                  setEditorText('');
                }}
              >
                卡牌
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={kind === 'hero'}
                className={kind === 'hero' ? 'is-active' : ''}
                onClick={() => {
                  setKind('hero');
                  setSelectedId(null);
                  setEditorText('');
                }}
              >
                英雄
              </button>
            </div>
            <input
              className="catalog-config__search"
              type="search"
              placeholder="搜索名称或 defId"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="搜索"
            />
            <span className="catalog-config__meta">
              v{catalogRuntime.getAppVersion()}
              {dirty ? ' · 未保存' : ''}
            </span>
          </div>

          <div className="catalog-config__body">
            <ul className="catalog-config__list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={selectedId === item.id ? 'is-active' : ''}
                    onClick={() => selectItem(item.id)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
            <textarea
              className="catalog-config__editor"
              value={editorText}
              onChange={(e) => setEditorText(e.target.value)}
              spellCheck={false}
              placeholder={selectedId ? '' : '选择左侧条目以编辑 JSON'}
              aria-label="条目 JSON"
            />
          </div>

          <div className="catalog-config__actions">
            <button type="button" onClick={onSave}>
              Save
            </button>
            <button type="button" onClick={onExport} disabled={dirty}>
              导出
            </button>
            <button type="button" onClick={onDiscard} disabled={!dirty}>
              丢弃草稿
            </button>
            <button type="button" onClick={onReset}>
              Reset
            </button>
            <button type="button" onClick={() => applyEditorToDraft()}>
              校验写入草稿
            </button>
          </div>

          {status && <p className="catalog-config__status">{status}</p>}

          {showRestartHint && (
            <div className="catalog-config__restart">
              <span>建议新开一局以使本局也完全使用新定义。</span>
              <button
                type="button"
                onClick={() => {
                  onRestartSuggested?.();
                  setShowRestartHint(false);
                }}
              >
                立即重开
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
