'use client';

import React from 'react';
import Editor from '@monaco-editor/react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface CodeEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  language?: string;
  height?: string;
  readOnly?: boolean;
  className?: string;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language = 'markdown',
  height = '400px',
  readOnly = false,
  className = '',
}) => {

  const editorOptions = {
    readOnly,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    lineNumbers: 'on' as const,
    fontSize: 14,
    tabSize: 2,
    insertSpaces: true,
    automaticLayout: true,
    folding: true,
    bracketMatching: 'always' as const,
    renderWhitespace: 'selection' as const,
  };

  return (
    <div className={`border border-gray-300 rounded-md overflow-hidden ${className}`}>
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={onChange}
        options={editorOptions}
        loading={
          <div className="flex items-center justify-center h-full">
            <LoadingSpinner size="md" />
          </div>
        }
        theme="vs"
      />
    </div>
  );
};

export default CodeEditor;