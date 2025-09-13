// AnalysisPage.jsx
import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import {
  Play,
  Pause,
  CheckCircle,
  Mic,
  MicOff,
  Loader,
  Plus,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import "../App.css"; // <-- Import your CSS here

export default function AnalysisPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    result,
    audioUrl,
    conversation_id: initialConversationId,
    messages: initialMessages,
  } = location.state || {};

  // Keep conversation id in state for the session (not in localStorage)
  const [conversationId, setConversationId] = useState(
    initialConversationId || null
  );

  const [messages, setMessages] = useState(initialMessages || []);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [userAudioBlob, setUserAudioBlob] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [image, setImage] = useState(null);

  // preview playback states
  const [previewUrl, setPreviewUrl] = useState("");
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewPlayed, setPreviewPlayed] = useState(false); // must hear once before sending

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  // Map of pre-fetched audio HTML elements by message idx
const audioElementMap = useRef({});
// Map of blob URLs created for fetched audio so we can revoke later
const blobUrlMap = useRef({});

  // wavesurfer instances per assistant message index
  const waveSurferMap = useRef({});
  const waveContainerRefs = useRef({});
  const waveReadyMap = useRef({});
  const [playingIndex, setPlayingIndex] = useState(null);

  // keep track of created blob urls to revoke on unmount
  const createdBlobUrlsRef = useRef([]);

  const messagesEndRef = useRef(null);

  // audio preview element ref (hidden audio used to play recorded blob)
  const audioPreviewRef = useRef(null);

  // if user navigated here without result, redirect home
  useEffect(() => {
    if (!result) {
      navigate("/", { replace: true });
      return;
    }
    setTimeout(() => scrollToBottom(), 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cleanup on unmount
useEffect(() => {
  return () => {
    // destroy wavesurfer instances
    Object.values(waveSurferMap.current).forEach((ws) => {
      try { ws.destroy(); } catch {}
    });

    // revoke blobs
    Object.values(blobUrlMap.current).forEach((u) => {
      try { URL.revokeObjectURL(u); } catch {}
    });
  };
}, []);

  // when messages change, scroll and init waves where containers exist
useEffect(() => {
  scrollToBottom();
  messages.forEach((m, idx) => {
    const assistantAudio = m.assistant_audio ?? m.doctor_voice_url ?? null;
    if (m.role === "assistant" && assistantAudio) {
      // prefetch blobUrl, then init wavesurfer using the blob URL
      prefetchAssistantAudio(idx, assistantAudio)
        .then((blobUrl) => {
          const container = waveContainerRefs.current[idx];
          if (container && !waveSurferMap.current[idx]) {
            initWaveForMessage(idx, blobUrl ?? assistantAudio, container);
          }
        })
        .catch(() => {});
    }
  });
}, [messages]);
  // Prefetch audio URL -> blob -> create object URL & HTMLAudioElement
// --- PREFETCH: fetch remote audio and create a blob URL (fast local src) ---
const prefetchAssistantAudio = async (idx, url) => {
  if (!url) return null;
  // Already have blob url
  if (blobUrlMap.current[idx]) return blobUrlMap.current[idx];

  try {
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) throw new Error("prefetch failed: " + resp.status);
    const blob = await resp.blob();

    const blobUrl = URL.createObjectURL(blob);
    blobUrlMap.current[idx] = blobUrl;
    return blobUrl;
  } catch (e) {
    console.warn("prefetchAssistantAudio failed for idx", idx, e);
    return null;
  }
};

// --- INIT WAVESURFER: load the blob URL into wavesurfer (no separate audio element) ---
const initWaveForMessage = async (idx, srcUrl, containerEl) => {
  if (!containerEl) return;
  // avoid recreating
  if (waveSurferMap.current[idx]) return;

  // Create WaveSurfer with a stable config
  const ws = WaveSurfer.create({
    container: containerEl,
    waveColor: "#22c55e",
    progressColor: "#10b981",
    cursorColor: "#ffffff",
    height: 56,
    barWidth: 3,
    responsive: true,
    normalize: true,
    // keep backend default (WebAudio) — it will create its own media element from the blob URL
  });

  waveReadyMap.current[idx] = false;

  ws.on("ready", () => {
    waveReadyMap.current[idx] = true;
    // ready but do not autoplay — user toggles playback
  });

  ws.on("finish", () => {
    setPlayingIndex(null);
  });

  ws.on("error", (err) => {
    console.warn("WaveSurfer error idx", idx, err);
  });

  try {
    // srcUrl should be a blob URL (prefetched). If not prefetched yet, use given srcUrl (remote) — still works.
    ws.load(srcUrl);
    waveSurferMap.current[idx] = ws;
  } catch (e) {
    console.warn("WaveSurfer load failed for message", idx, e);
    try { ws.destroy(); } catch {}
    waveSurferMap.current[idx] = null;
  }
};

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError("Image must be less than 10MB");
        return;
      }
      if (!file.type.startsWith("image/")) {
        setError("Please select a valid image file");
        return;
      }
      setImage(file);

      setError("");
    }
  };

  const attachWaveContainer = (idx) => (el) => {
    if (el) {
      waveContainerRefs.current[idx] = el;
      const m = messages[idx];
      const src = m?.assistant_audio ?? m?.doctor_voice_url ?? null;
      if (src && !waveSurferMap.current[idx]) {
        initWaveForMessage(idx, src, el);
      }
    } else {
      if (waveSurferMap.current[idx]) {
        try {
          waveSurferMap.current[idx].destroy();
        } catch {}
        waveSurferMap.current[idx] = null;
      }
      delete waveContainerRefs.current[idx];
      delete waveReadyMap.current[idx];
    }
  };

// --- TOGGLE PLAY/PAUSE: control wavesurfer only (instant because src is a blob URL) ---
const togglePlayForIndex = async (idx) => {
  const ws = waveSurferMap.current[idx];

  // If no wavesurfer for this idx, attempt to ensure it's created
  if (!ws) {
    const m = messages[idx];
    const remoteSrc = m?.assistant_audio ?? m?.doctor_voice_url ?? null;
    if (!remoteSrc) return;
    // prefetch and init then return (user can click again)
    const blobUrl = await prefetchAssistantAudio(idx, remoteSrc);
    const container = waveContainerRefs.current[idx];
    if (container) {
      await initWaveForMessage(idx, blobUrl ?? remoteSrc, container);
    }
    return;
  }

  // If ws exists but not yet ready, avoid trying to play until ready
  if (!waveReadyMap.current[idx]) {
    // Optionally: queue a one-time 'ready' action
    ws.once && ws.once("ready", () => {
      try {
        if (ws.isPlaying()) ws.pause();
        else ws.play();
        setPlayingIndex(idx);
      } catch (e) {}
    });
    return;
  }

  // Pause any other playing waves
  Object.entries(waveSurferMap.current).forEach(([k, inst]) => {
    if (k !== String(idx) && inst && inst.isPlaying && inst.isPlaying()) {
      try { inst.pause(); } catch {}
    }
  });

  // Toggle
  if (ws.isPlaying()) {
    ws.pause();
    setPlayingIndex(null);
  } else {
    try {
      ws.play();
      setPlayingIndex(idx);
    } catch (e) {
      console.warn("ws.play failed", e);
    }
  }
};

  // audio input visualizer
  const visualizeAudio = () => {
    if (!analyserRef.current) return;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const avg = sum / bufferLength;
      setAudioLevel(Math.min(1, avg / 128));
    };
    draw();
  };

  // recording logic (same pattern as homepage)
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioContextRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      const chunks = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/wav" });
        setUserAudioBlob(blob);

        // create preview URL and reset previewPlayed
        try {
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          createdBlobUrlsRef.current.push(url);
          setPreviewPlayed(false);
          setIsPreviewPlaying(false);
        } catch (e) {
          console.warn("Could not create preview URL", e);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      visualizeAudio();
      timerRef.current = setInterval(
        () => setRecordingTime((p) => p + 1),
        1000
      );
    } catch (err) {
      console.error("microphone error:", err);
      setError(
        "Microphone access denied. Please enable microphone permissions."
      );
    }
  };

  const pauseRecording = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      visualizeAudio();
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
      setAudioLevel(0);
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setIsRecording(false);
    setIsPaused(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current)
      cancelAnimationFrame(animationFrameRef.current);
    setAudioLevel(0);
  };

  const scrollToBottom = () => {
    try {
      window.scrollTo({
        top: document.body.scrollHeight,  
        behavior: "smooth",
        block: "end",
      });
    } catch {}
  };

  // Play/pause preview of recorded audio
  const togglePreviewPlay = () => {
    const audio = audioPreviewRef.current;
    if (!audio) return;
    if (!isPreviewPlaying) {
      // start playing; track end event to set previewPlayed
      audio.play().catch((e) => console.warn("preview play failed", e));
      setIsPreviewPlaying(true);
      audio.onended = () => {
        setIsPreviewPlaying(false);
        setPreviewPlayed(true);
      };
    } else {
      audio.pause();
      setIsPreviewPlaying(false);
    }
  };

  const removeAudio = () => {
    // Stop preview audio if playing
    if (audioPreviewRef.current && !audioPreviewRef.current.paused) {
      audioPreviewRef.current.pause();
    }

    // Revoke preview URL
    if (previewUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
        createdBlobUrlsRef.current = createdBlobUrlsRef.current.filter(
          (u) => u !== previewUrl
        );
      } catch (err) {
        console.warn("Failed to revoke preview URL:", err);
      }
    }

    // Reset all preview-related state
    setUserAudioBlob(null);
    setRecordingTime(0);
    setPreviewPlayed(false);
    setIsPreviewPlaying(false);
    setPreviewUrl("");
    setError(""); // Optional: clear any leftover errors
  };

  // Send user audio follow-up to proxy which forwards to fastapi
  const sendUserAudio = async () => {
    if (!userAudioBlob) {
      setError("Record something before sending.");
      return;
    }

    // if (!previewPlayed) {
    //   setError(
    //     "Please listen to your recorded reply at least once before sending."
    //   );
    //   return;
    // }

    setIsSending(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("audio", userAudioBlob, "reply.wav");
      if (conversationId) {
        formData.append("conversation_id", conversationId);
      }

      const resp = await fetch(`http://localhost:5000/api/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        throw new Error(`Server responded with status ${resp.status}`);
      }

      const data = await resp.json();

      if (data.conversation_id) {
        setConversationId(data.conversation_id);
      }

      if (Array.isArray(data.messages)) {
        setMessages(data.messages);
      } else {
        // fallback: local append
        const userBlobUrl = previewUrl || URL.createObjectURL(userAudioBlob);
        if (!createdBlobUrlsRef.current.includes(userBlobUrl)) {
          createdBlobUrlsRef.current.push(userBlobUrl);
        }

        setMessages((cur) => [
          ...cur,
          {
            role: "user",
            content: data.speech_to_text ?? data.user_text ?? "",
            user_audio: userBlobUrl,
          },
          {
            role: "assistant",
            content: data.doctor_response ?? "",
            assistant_audio: data.doctor_voice_url ?? null,
          },
        ]);
      }

      // Clean up preview & blob
      removeAudio();
      setImage(null);
    } catch (err) {
      console.error("sendUserAudio error:", err);
      setError(
        "Failed to send audio. Please check your connection and try again."
      );
    } finally {
      setIsSending(false);
    }
  };

  // Start new conversation: confirm, call backend reset, navigate home (client-side state not persisted)
  const startNewConversation = async () => {
    const confirmReset = window.confirm(
      "Are you sure you want to start a new conversation? This will clear the current chat history."
    );
    if (!confirmReset) return;

    try {
      if (conversationId) {
        // use proxy to forward reset to FastAPI
        await fetch(`http://localhost:5000/reset/${conversationId}`, {
          method: "POST",
        });
      }
    } catch (e) {
      console.warn("reset failed", e);
    } finally {
      // navigate home — do not store conversationId anywhere; homepage shows blank UI
      navigate("/", { replace: true, state: { startNew: true } });
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  // render messages with audio + waveform container
  const renderMessage = (msg, idx) => {
    console.log(msg);
    const role = msg.role;
    const content = msg.content ?? msg.text ?? "";
    const userAudio = msg.user_audio ?? msg.local_user_audio ?? null;
    const assistantAudio = msg.assistant_audio;
    console.log(assistantAudio);

    if (role === "user") {
      return (
        <div key={idx} className="mb-4 text-left">
          <div className="text-sm text-gray-400 mb-1">You</div>
          <div className="bg-gray-800/60 p-3 rounded-lg text-gray-100 max-w-3xl">
            <div className="whitespace-pre-wrap">{content}</div>
            {userAudio && (
              <audio controls src={userAudio} className="w-full mt-3" />
            )}
          </div>
        </div>
      );
    } else if (role === "assistant") {
      return (
        <div key={idx} className="mb-6 text-left">
          <div className="text-sm text-gray-400 mb-1">Doctor</div>
          <div className="bg-gray-900 p-4 rounded-lg text-gray-100 max-w-3xl">
            <div className="whitespace-pre-wrap mb-4">{content}</div>

            {assistantAudio && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-gray-300">Doctor's Response</div>
                  <button
                    onClick={() => togglePlayForIndex(idx)}
                    className="inline-flex items-center gap-2 px-3 py-1 bg-green-600 hover:bg-green-700 rounded-full text-white text-sm"
                  >
                    {playingIndex === idx ? (
                      <>
                        <Pause className="h-4 w-4" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" /> Play
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-gray-800/60 rounded-md p-2">
                  {/* WaveSurfer waveform container */}
                  <div ref={attachWaveContainer(idx)} className="w-full h-14" />

                  {/* Fallback if WaveSurfer fails */}
                  
                </div>
              </>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-black text-white py-10 px-4 ">
      <div className="max-w-4xl mx-auto bg-gray-900/70 rounded-xl p-6 sm:p-8 border border-green-500 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-400" />
            <h1 className="text-xl font-semibold">Analysis Report</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="px-3 py-1 bg-red-800 hover:bg-red-700 rounded-full text-sm cursor-pointer"
            >
              X
            </button>
          
          </div>
        </div>

        {/* Chat history */}
        <div className="space-y-3 max-h-[55vh] overflow-y-auto mb-4 px-1 custom-scrollbar">
          {messages && messages.length ? (
            messages.map((m, i) => renderMessage(m, i))
          ) : (
            <div className="text-gray-400">No conversation yet.</div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && <div className="mb-3 text-red-400">{error}</div>}

        {/* Recorder */}
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-sm text-gray-300">
                  Continue your conversation
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-300">
              {formatTime(recordingTime)}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Image Upload Button */}
            {!image && (
              <label className="relative flex items-center justify-center w-12 h-12 rounded-lg cursor-pointer hover:border-green-500 transition border border-gray-600">
                {/* Plus icon */}
                <Plus className="w-6 h-6 text-gray-400" />

                {/* Hidden file input */}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </label>
            )}

            {/* If image is added, show a small preview instead of + icon */}
            {image && (
              <div className="relative w-12 h-12">
                <img
                  src={URL.createObjectURL(image)}
                  alt="Preview"
                  className="w-12 h-12 rounded-lg object-cover"
                />
                {/* Remove button */}
                <button
                  onClick={() => setImage(null)}
                  className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-2 text-xs"
                >
                  ✕
                </button>
              </div>
            )}

            {!isRecording && (
              <button
                onClick={startRecording}
                className="w-12 h-12 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center"
              >
                <Mic className="h-5 w-5 text-white" />
              </button>
            )}

            {isRecording && (
              <>
                <button
                  onClick={stopRecording}
                  className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center"
                >
                  <MicOff className="h-5 w-5 text-white" />
                </button>
                <button
                  onClick={pauseRecording}
                  className="w-12 h-12 rounded-full bg-yellow-500 flex items-center justify-center"
                >
                  {isPaused ? "▶" : "⏸"}
                </button>
              </>
            )}

            <div className="flex-1">
              <div className="h-8 flex items-center gap-1">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 4,
                      height: `${
                        6 + audioLevel * 30 * Math.abs(Math.sin(i / 3))
                      }px`,
                    }}
                    className="bg-green-500 rounded"
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              {/* Preview controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePreviewPlay}
                  disabled={!previewUrl || isSending}
                  className={`px-3 py-2 rounded-full h-12 w-12 flex justify-center items-center ${
                    !previewUrl
                      ? "bg-gray-500 cursor-not-allowed opacity-50"
                      : "bg-gray-700 hover:bg-gray-800"
                  } text-white`}
                >
                  {isPreviewPlaying ? (
                    <Pause className="h-6 w-6" />
                  ) : (
                    <Play className="h-6 w-6" />
                  )}
                </button>

                <button>
                  <button
                    onClick={removeAudio}
                    disabled={isSending}
                    className={`flex items-center justify-center w-12 h-12 rounded-full ${
                      isSending
                        ? "bg-gray-500 cursor-not-allowed opacity-50"
                        : "bg-gray-700 hover:bg-gray-800"
                    } text-white transition-all duration-300 shadow-lg`}
                  >
                    🗑
                  </button>
                </button>

                <button
                  onClick={sendUserAudio}
                  className={`px-4 py-2 rounded-lg ${
                    isSending
                      ? "bg-gray-600 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {isSending ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin inline mr-2" />{" "}
                      Sending...
                    </>
                  ) : (
                    "Send"
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* hidden audio element for preview playback */}
          {previewUrl && (
            <audio
              ref={audioPreviewRef}
              src={previewUrl}
              style={{ display: "none" }}
              onEnded={() => {
                setIsPreviewPlaying(false);
                setPreviewPlayed(true);
              }}
            />
          )}
         
        </div>
         <div className="mt-4 flex justify-center">
           <button
              onClick={startNewConversation}
              className="px-6 py-3 bg-blue-700 hover:bg-blue-600 rounded-full text-sm"
            >
              Start New Conversation
            </button>
         </div>
      </div>
    </div>
  );
}
