import ReactMarkdown, { type Components } from "react-markdown";
import type { Message } from "ai";

export type MessagePart = NonNullable<Message["parts"]>[number];

interface ChatMessageProps {
  parts: MessagePart[];
  role: string;
  userName: string;
}

const components: Components = {
  // Override default elements with custom styling
  p: ({ children }) => <p className="mb-4 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 list-disc pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal pl-4">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  code: ({ className, children, ...props }) => (
    <code className={`${className ?? ""}`} {...props}>
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-lg bg-gray-700 p-4">
      {children}
    </pre>
  ),
  a: ({ children, ...props }) => (
    <a
      className="text-blue-400 underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
};

const Markdown = ({ children }: { children: string }) => {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
};

// ToolCallMessage: renders tool-invocation parts
function ToolCallMessage({ part }: { part: Extract<MessagePart, { type: "tool-invocation" }> }) {
  const { toolInvocation } = part;
  const { state, toolName, args } = toolInvocation;

  return (
    <div className="mb-4 rounded-lg bg-gray-700 p-4 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-blue-300">Tool:</span>
        <span className="font-mono text-gray-200">{toolName}</span>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-blue-300">State:</span>
        <span className="font-mono text-gray-200">{state}</span>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-blue-300">Args:</span>
        <span className="font-mono text-gray-200">{JSON.stringify(args, null, 2)}</span>
      </div>
      {toolInvocation.state === "result" && toolInvocation.result && (
        <div className="mb-2">
          <div className="font-mono text-green-300">Result:</div>
          <pre className="font-mono text-gray-200">{JSON.stringify(toolInvocation.result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export const ChatMessage = ({ parts, role, userName }: ChatMessageProps) => {
  const isAI = role === "assistant";

  return (
    <div className="mb-6">
      <div
        className={`rounded-lg p-4 ${
          isAI ? "bg-gray-800 text-gray-300" : "bg-gray-900 text-gray-300"
        }`}
      >
        <p className="mb-2 text-sm font-semibold text-gray-400">
          {isAI ? "AI" : userName}
        </p>
        <div className="prose prose-invert max-w-none">
          {parts.map((part, idx) => {
            if (part.type === "tool-invocation") {
              return <ToolCallMessage key={idx} part={part} />;
            }
            if (part.type === "text") {
              return <Markdown key={idx}>{part.text}</Markdown>;
            }
            return null;          
          })}
        </div>
      </div>
    </div>
  );
};
