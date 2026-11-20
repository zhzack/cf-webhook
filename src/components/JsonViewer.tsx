import React, { useState, useMemo } from 'react';
import { Copy, Check, FileCode, WrapText } from 'lucide-react';

interface JsonViewerProps {
  content: string;
  isJson?: boolean;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ content, isJson = true }) => {
  const [copied, setCopied] = useState(false);
  const [isRaw, setIsRaw] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);

  // 格式化处理
  const { formattedText, parseSuccess } = useMemo(() => {
    if (!content) return { formattedText: '', parseSuccess: false };
    try {
      const parsed = JSON.parse(content);
      return {
        formattedText: JSON.stringify(parsed, null, 2),
        parseSuccess: true,
      };
    } catch {
      return {
        formattedText: content,
        parseSuccess: false,
      };
    }
  }, [content]);

  // JSON 语法高亮转换
  const highlightedLines = useMemo(() => {
    const textToRender = isRaw || !parseSuccess ? content : formattedText;
    const lines = textToRender.split('\n');

    if (isRaw || !parseSuccess) {
      return lines.map((l) => escapeHtml(l));
    }

    return lines.map((line) => {
      const escaped = escapeHtml(line);
      return escaped.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        (match) => {
          let cls = 'text-amber-400'; // 数字
          if (/^"/.test(match)) {
            if (/:$/.test(match)) {
              cls = 'text-sky-300 font-medium'; // JSON Key
            } else {
              cls = 'text-emerald-300'; // 字符串值
            }
          } else if (/true|false/.test(match)) {
            cls = 'text-purple-400 font-semibold'; // 布尔值
          } else if (/null/.test(match)) {
            cls = 'text-slate-500 italic font-mono'; // Null
          }
          return `<span class="${cls}">${match}</span>`;
        }
      );
    });
  }, [content, formattedText, isRaw, parseSuccess]);

  const handleCopy = () => {
    const textToCopy = isRaw || !parseSuccess ? content : formattedText;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!content) {
    return (
      <div className="text-slate-500 text-xs italic p-8 text-center bg-slate-900/30 rounded-lg border border-slate-800">
        (该请求没有包含 Body 报文)
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shadow-inner">
      {/* 顶部工具栏 */}
      <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-slate-400 flex items-center gap-1">
            <FileCode className="w-3.5 h-3.5 text-indigo-400" />
            {parseSuccess ? 'JSON' : 'RAW TEXT'}
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-[11px] text-slate-500 font-mono">
            {highlightedLines.length} 行 · {new Blob([content]).size} 字节
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {parseSuccess && (
            <button
              onClick={() => setIsRaw(!isRaw)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
                isRaw
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
              title="切换彩色格式化与原始纯文本"
            >
              {isRaw ? '原始 Raw' : '彩色格式化'}
            </button>
          )}

          <button
            onClick={() => setWordWrap(!wordWrap)}
            className={`p-1 rounded text-slate-400 hover:text-slate-200 transition ${
              wordWrap ? 'bg-indigo-600/30 text-indigo-300' : 'hover:bg-slate-800'
            }`}
            title={wordWrap ? '已开启自动换行' : '开启自动换行'}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? '已复制' : '复制内容'}</span>
          </button>
        </div>
      </div>

      {/* 代码带行号渲染区 */}
      <div className="flex-1 overflow-auto p-3 bg-slate-950 font-mono text-xs leading-relaxed">
        <div className={`table w-full ${wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre'}`}>
          {highlightedLines.map((lineHtml, idx) => (
            <div key={idx} className="table-row hover:bg-slate-900/40 group">
              <span className="table-cell select-none pr-3 text-right text-slate-600 text-[11px] font-mono w-10 align-top group-hover:text-slate-400 transition-colors">
                {idx + 1}
              </span>
              <span
                className="table-cell text-slate-200 select-text"
                dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

