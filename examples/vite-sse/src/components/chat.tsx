import { useState } from "react";
import { Answer } from "./answer";
import "./chat.css";
import { useChatStream } from "./use-chat-stream";

export function Chat({ dark = false }: { dark?: boolean }) {
  const { messages, streaming, send, stop, retry } = useChatStream();
  const [input, setInput] = useState("");
  const lastId = messages.at(-1)?.id;

  return (
    <div className="chat">
      <div className="messages">
        {messages.map((message) => (
          <div key={message.id} className={message.role}>
            {message.role === "user" ? (
              <p>{message.content}</p>
            ) : (
              <Answer
                text={message.content}
                streaming={message.status === "streaming"}
                latest={message.id === lastId}
                dark={dark}
              />
            )}
            {message.status === "truncated" && (
              <p>The answer reached the output limit and may be incomplete.</p>
            )}
            {message.status === "error" && (
              <p role="alert">
                The answer failed.{" "}
                <button type="button" onClick={() => retry(message.id)}>
                  Retry
                </button>
              </p>
            )}
          </div>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim() || streaming) return;
          send(input);
          setInput("");
        }}
      >
        <input
          aria-label="Message"
          placeholder="Ask for a pricing calculator, a chart, or a checklist"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        {streaming ? (
          <button type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>
    </div>
  );
}
