import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mic, MicOff, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useApiClient, ApiError } from "@/lib/api-client.ts";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition.ts";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Badge } from "@/components/ui/badge.tsx";

interface Turn {
  role: "user" | "assistant";
  text: string;
  resultPath?: string;
}

const PROVIDER_STORAGE_KEY = "voice-assistant-provider";

export default function VoiceAssistant() {
  const api = useApiClient();
  const navigate = useNavigate();
  const { data: providers } = useQuery<Array<{ id: string; label: string }>>({
    queryKey: ["voice-providers"],
    queryFn: () => api.get("/voice/providers"),
  });

  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [turns, setTurns] = useState<Turn[]>([]);
  const [textInput, setTextInput] = useState("");
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [providerId, setProviderId] = useState(
    () => localStorage.getItem(PROVIDER_STORAGE_KEY) ?? "",
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!providerId && providers && providers.length > 0) {
      setProviderId(providers[0].id);
    }
  }, [providers, providerId]);

  useEffect(() => {
    if (providerId) localStorage.setItem(PROVIDER_STORAGE_KEY, providerId);
  }, [providerId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const { speak, stop: stopSpeaking } = useSpeechSynthesis();

  const sendCommand = async (transcript: string) => {
    if (!transcript.trim() || !providerId) return;
    setTurns((prev) => [...prev, { role: "user", text: transcript }]);
    setStatus("thinking");
    try {
      const result = await api.post("/voice/command", { sessionId, transcript, providerId });
      setTurns((prev) => [
        ...prev,
        { role: "assistant", text: result.reply, resultPath: result.resultPath },
      ]);
      setStatus("speaking");
      speak(result.reply);
      setTimeout(() => setStatus("idle"), 300);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Something went wrong";
      setTurns((prev) => [...prev, { role: "assistant", text: message }]);
      setStatus("idle");
    }
  };

  const { isSupported: micSupported, isListening, start, stop } = useSpeechRecognition({
    onResult: (transcript) => sendCommand(transcript),
    onError: (message) => {
      setTurns((prev) => [...prev, { role: "assistant", text: message }]);
      setStatus("idle");
    },
  });

  const handleMicClick = () => {
    if (isListening) {
      stop();
      setStatus("idle");
    } else {
      stopSpeaking();
      setStatus("listening");
      start();
    }
  };

  const handleTextSubmit = () => {
    const text = textInput.trim();
    if (!text) return;
    setTextInput("");
    sendCommand(text);
  };

  const handleNewConversation = async () => {
    stopSpeaking();
    try {
      await api.post("/voice/reset", { sessionId });
    } catch {
      // Best-effort — a stale session on the server just times out on its own.
    }
    setSessionId(crypto.randomUUID());
    setTurns([]);
    setStatus("idle");
  };

  const handleClose = () => {
    stop();
    stopSpeaking();
    setOpen(false);
  };

  if (!open) {
    return (
      <Button
        size="icon"
        className="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-6" />
      </Button>
    );
  }

  const noProvidersConfigured = providers !== undefined && providers.length === 0;

  return (
    <Card className="fixed bottom-6 right-6 z-50 flex h-[32rem] w-96 flex-col shadow-xl">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" />
          Voice assistant
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-7" onClick={handleNewConversation}>
            <RotateCcw className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={handleClose}>
            <X className="size-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
        {noProvidersConfigured ? (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
            No AI provider is configured yet. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or
            GEMINI_API_KEY on the server, then restart it.
          </div>
        ) : (
          <>
            {providers && providers.length > 1 && (
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue placeholder="Choose an AI provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-md border p-2">
              {turns.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">
                  Tap the mic and say something like "create a product called Widget X, price
                  twenty dollars" — I'll ask for anything else I need.
                </p>
              ) : (
                <div className="space-y-2">
                  {turns.map((turn, i) => (
                    <div
                      key={i}
                      className={
                        turn.role === "user"
                          ? "ml-6 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                          : "mr-6 rounded-lg bg-muted px-3 py-2 text-sm"
                      }
                    >
                      <p>{turn.text}</p>
                      {turn.resultPath && (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs"
                          onClick={() => turn.resultPath && navigate(turn.resultPath)}
                        >
                          View →
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {status !== "idle" && (
              <Badge variant="secondary" className="w-fit gap-1.5">
                {status === "thinking" && <Loader2 className="size-3 animate-spin" />}
                {status === "listening" ? "Listening..." : status === "thinking" ? "Thinking..." : "Speaking..."}
              </Badge>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant={isListening ? "destructive" : "default"}
                className="size-9 shrink-0 rounded-full"
                onClick={handleMicClick}
                disabled={status === "thinking" || !providerId}
                title={micSupported ? "Talk" : "Voice input not supported in this browser"}
              >
                {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
              <Input
                placeholder={micSupported ? "Or type a command..." : "Type a command..."}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
                disabled={status === "thinking"}
              />
              <Button
                size="icon"
                variant="secondary"
                className="size-9 shrink-0"
                onClick={handleTextSubmit}
                disabled={status === "thinking" || !textInput.trim()}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
