import ChatBot from '../ChatBot'

export default function QATab({ data, onOpenSource, aiEnabled }) {
  if (!data) return <div className="explorer-empty">Analyze a project to ask questions.</div>
  if (!aiEnabled) return <div className="card"><h3>Q&A is not enabled yet</h3><p>You can explore the source files and graph now. Questions become available when an administrator configures AI.</p></div>
  return <div className="tab-page"><ChatBot key={data.jobId} jobId={data.jobId}
    projectName={data.projectName} variant="embedded" onOpenSource={onOpenSource} /></div>
}
