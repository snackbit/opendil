"use client";
import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Answer } from "./answer";
import "./chat.css";

export function Chat({ dark = false }: { dark?: boolean }) {
  const [truncated, setTruncated] = useState<string[]>([]);
  const { messages, sendMessage, status, stop, regenerate, error } = useChat({
    onFinish: ({ message, finishReason }) => {
      if (finishReason === "length")
        setTruncated((ids) => [...ids, message.id]);
    },
  });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const lastId = messages.at(-1)?.id;

  return (
    <div className="chat">
      <div className="messages">
        {messages.map((message) => (
          <div key={message.id} className={message.role}>
            {message.parts.map((part, index) => {
              if (part.type !== "text") return null;
              if (message.role === "user")
                return <p key={index}>{part.text}</p>;
              return (
                <Answer
                  key={index}
                  text={part.text}
                  // part.state stays "streaming" after stop() or an error.
                  streaming={
                    part.state === "streaming" &&
                    status === "streaming" &&
                    message.id === lastId
                  }
                  latest={message.id === lastId}
                  dark={dark}
                />
              );
            })}
            {truncated.includes(message.id) && (
              <p>The answer reached the output limit and may be incomplete.</p>
            )}
          </div>
        ))}
        {error && (
          <p role="alert">
            The answer failed.{" "}
            <button type="button" onClick={() => regenerate()}>
              Retry
            </button>
          </p>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim() || busy) return;
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input
          aria-label="Message"
          placeholder="Ask for a pricing calculator, a chart, or a checklist"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        {busy ? (
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>
    </div>
  );
}
