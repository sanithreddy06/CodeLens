export function downloadAnalysis(data) {
  const markdown = [
    `# ${data.projectName} — CodeLens analysis`,
    `Revision: ${data.revision || 'unavailable'}`,
    data.aiUnavailable ? '> Source exploration only: AI explanations have not been generated.' : data.demoMode ? '> Demo output: explanations are canned responses.' : '> AI-generated explanations should be verified against source.',
    data.analysisWarning ? `> Partial analysis: ${data.analysisWarning}` : '',
    data.coverage ? `Included ${data.coverage.analyzedFiles} of ${data.coverage.totalFiles} files. AI generation uses selected excerpts.` : '',
    '## Overview', data.summary || '',
    '## Included files', ...(data.filesIndex || []).map(file => `- ${file.path}`),
    '## Tutorials', ...(data.chapters || []).map(chapter => chapter.content),
  ].filter(Boolean).join('\n\n') + '\n'
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${String(data.projectName || 'project').replace(/[^a-z0-9_-]/gi, '-').slice(0, 80)}-analysis.md`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
