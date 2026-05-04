import { useSession } from '../hooks/useSession'
import { ChatView } from '../components/ChatView'
import { ChatBar } from '../components/ChatBar'
import { Link } from 'react-router-dom'

export function CreatorPage() {
  const {
    step, state, streamingText, uploadedFiles,
    context, taskId, initSession, sendUserMessage, handleFileUpload,
  } = useSession()

  return (
    <div className="creator-app">
      <ChatView
        chatBar={
          <ChatBar
            onSend={sendUserMessage}
            isStreaming={state.isStreaming}
          />
        }
        step={step}
        messages={state.messages}
        streamingText={streamingText}
        isStreaming={state.isStreaming}
        uploadedFiles={uploadedFiles}
        context={context}
        taskId={taskId}
        onSend={sendUserMessage}
        onUpload={handleFileUpload}
        onNewTask={() => { initSession() }}
      />
    </div>
  )
}
