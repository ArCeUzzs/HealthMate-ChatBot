// Homepage.jsx
import React, { useState, useRef, useEffect } from "react";
import WaveSurfer from "wavesurfer.js";
import {
  Upload,
  Mic,
  MicOff,
  Play,
  Pause,
  Send,
  Image as ImageIcon,
  AlertCircle,
  Loader,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const Homepage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // No localStorage usage anywhere. (We only use state and pass conversation_id via navigation)
  // If navigated with state.startNew we don't keep anything; it's just a hint (no storage)
  useEffect(() => {
    // If user came here via Start New we can reset ephemeral UI state if needed.
    // We intentionally DON'T read or write localStorage.
  }, [location.state]);

  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  const wavesurferRef = useRef(null);
  const waveformContainerRef = useRef(null);

  // doctor waveform refs (kept in case previewing)
  const doctorWaveformRef = useRef(null);
  const doctorWaveformContainerRef = useRef(null);
  const [isDoctorPlaying, setIsDoctorPlaying] = useState(false);

  // Image upload
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
      setImagePreview(URL.createObjectURL(file));
      setError("");
    }
  };

  const removeImage = () => {
    setImage(null);
    setImagePreview("");
  };

  const removeAudio = () => {
    setAudioBlob(null);
    try {
      if (audioUrl && audioUrl.startsWith("blob:"))
        URL.revokeObjectURL(audioUrl);
    } catch {}
    setAudioUrl("");
    setIsPlaying(false);
    wavesurferRef.current?.destroy();
  };

  // Audio visualization during recording
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
      setAudioLevel(avg / 128);
    };
    draw();
  };

  // Recording functions
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
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        if (animationFrameRef.current)
          cancelAnimationFrame(animationFrameRef.current);
        setAudioLevel(0);
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
      setError(
        "Microphone access denied. Please enable microphone permissions."
      );
    }
  };

  const togglePause = () => {
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
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
      setAudioLevel(0);
    }
  };

  // Wavesurfer for user audio
  useEffect(() => {
    if (audioUrl && waveformContainerRef.current) {
      wavesurferRef.current?.destroy();
      wavesurferRef.current = WaveSurfer.create({
        container: waveformContainerRef.current,
        waveColor: "#444",
        progressColor: "#ff3b3f",
        cursorColor: "#fff",
        height: 80,
        barWidth: 3,
        responsive: true,
      });
      wavesurferRef.current.load(audioUrl);
      wavesurferRef.current.on("finish", () => setIsPlaying(false));
    }
    // do not destroy in cleanup because we might navigate to analysis and reuse audio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  // Wavesurfer for doctor voice preview (if present before navigating)
  useEffect(() => {
    if (result?.doctor_voice_url && doctorWaveformContainerRef.current) {
      doctorWaveformRef.current?.destroy();
      doctorWaveformRef.current = WaveSurfer.create({
        container: doctorWaveformContainerRef.current,
        waveColor: "#22c55e",
        progressColor: "#10b981",
        cursorColor: "#fff",
        height: 80,
        barWidth: 3,
        responsive: true,
      });
      doctorWaveformRef.current.load(result.doctor_voice_url);
      doctorWaveformRef.current.on("finish", () => setIsDoctorPlaying(false));
    }
    return () => {
      try {
        doctorWaveformRef.current?.destroy();
      } catch {}
    };
  }, [result?.doctor_voice_url]);

  const togglePlay = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
      setIsPlaying(wavesurferRef.current.isPlaying());
    }
  };

  const handleSubmit = async () => {
    if (!audioBlob) {
      setError("Please record your symptoms before analyzing");
      return;
    }

    setIsAnalyzing(true);
    setError("");

    const formData = new FormData();
    if (image) formData.append("image", image);
    formData.append("audio", audioBlob, "symptoms.wav");

    try {
      // Use proxy express server that forwards to FastAPI
      const response = await fetch("http://localhost:5000/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      setResult(data);

      // navigate to analysis page, pass conversation data and initial audio
      navigate("/analysis", {
        state: {
          result: data,
          audioUrl: audioUrl,
          conversation_id: data.conversation_id,
          messages: data.messages || [
            // fallback: construct minimal initial history
            {
              role: "user",
              content: data.speech_to_text,
              user_audio: audioUrl,
            },
            {
              role: "assistant",
              content: data.doctor_response,
              assistant_audio: data.doctor_voice_url,
            },
          ],
        },
      });
    } catch (err) {
      setError(
        "Analysis failed. Please check if your server is running and try again."
      );
      console.error("Analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetForm = () => {
    removeImage();
    removeAudio();
    setResult(null);
    setError("");
    setRecordingTime(0);
    setIsPaused(false);
    setIsDoctorPlaying(false);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-10">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-5xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-purple-500 to-blue-500 drop-shadow-lg">
              HealthMate - Your AI Medical Companion
            </h1>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Upload an image of your symptoms and describe them with your
              voice. Our AI will analyze and provide recommendations.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/60 border border-red-500 rounded-lg flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              <p className="text-red-200">{error}</p>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-8 mb-8">
            {/* Image Upload */}
            <div className="bg-gray-900/70 backdrop-blur-sm rounded-xl p-6 border border-gray-700 shadow-lg">
              <h2 className="text-xl font-semibold mb-4 flex justify-center items-center gap-2 text-blue-400">
                <ImageIcon className="h-5 w-5" />
                Upload Symptom Image
              </h2>
              <div className="relative border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-blue-500 transition-colors min-h-[200px] flex items-center justify-center">
                {imagePreview ? (
                  <div className="space-y-4 w-full">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-w-full max-h-64 mx-auto rounded-lg shadow-xl"
                    />
                    <button
                      onClick={removeImage}
                      className="text-red-400 hover:text-red-300 text-sm underline"
                    >
                      Remove image
                    </button>
                  </div>
                ) : (
                  <div className="w-full">
                    <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-300 mb-2">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-gray-500 text-sm">
                      PNG, JPG, GIF up to 10MB
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Audio Recording */}
            <div className="bg-gray-900/70 backdrop-blur-sm rounded-xl p-6 border border-gray-700 shadow-lg">
              <h2 className="text-xl font-semibold mb-4 flex items-center justify-center gap-2 text-green-400">
                <Mic className="h-5 w-5" />
                Record Symptom Description
              </h2>

              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center min-h-[200px]">
                  {!isRecording && !audioUrl && (
                    <div className="flex flex-col items-center justify-center h-full w-full">
                      <button
                        onClick={startRecording}
                        className="flex items-center justify-center w-24 h-24 rounded-full bg-green-600 hover:bg-green-700 hover:scale-105 transition-all duration-300 shadow-lg"
                      >
                        <Mic className="h-12 w-12 text-white" />
                      </button>
                      <p className="text-gray-400 mt-4 text-sm">
                        Click the microphone to start recording
                      </p>
                    </div>
                  )}

                  {isRecording && (
                    <div className="flex flex-col items-center justify-center w-full">
                      {/* Audio visualization waves */}
                      <div className="flex items-end justify-center h-20 mb-6 gap-1">
                        {[...Array(15)].map((_, i) => (
                          <div
                            key={i}
                            className="w-2 bg-green-500 rounded-full transition-all duration-150"
                            style={{
                              height: `${
                                10 + audioLevel * 40 * Math.sin(i / 2)
                              }px`,
                              opacity: 0.4 + audioLevel * 0.6,
                            }}
                          />
                        ))}
                      </div>

                      <div className="flex items-center justify-center gap-4">
                        <button
                          onClick={stopRecording}
                          className="flex items-center justify-center w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 transition-all duration-300 shadow-lg"
                        >
                          <MicOff className="h-6 w-6 text-white" />
                        </button>

                        <button
                          onClick={togglePause}
                          className="flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500 hover:bg-yellow-600 text-black transition-all duration-300 shadow-lg"
                        >
                          {isPaused ? "▶" : "⏸"}
                        </button>
                      </div>
                    </div>
                  )}
                  {!isRecording && audioUrl && (
                   <div className="w-full">
  {/* Buttons row */}
  <div className="flex items-center justify-center gap-6 mb-4">
    {/* Play Button */}
    <button
      onClick={togglePlay}
      className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all duration-300 shadow-lg"
    >
      {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
    </button>

    {/* Remove Button */}
    <button
      onClick={removeAudio}
      disabled={isAnalyzing}
      className={`flex items-center justify-center w-16 h-16 rounded-full ${
        isAnalyzing
          ? "bg-gray-500 cursor-not-allowed opacity-50"
          : "bg-gray-700 hover:bg-gray-800"
      } text-white transition-all duration-300 shadow-lg`}
    >
      🗑
    </button>
  </div>

  {/* Waveform Section */}
  <div className="bg-gray-800/50 rounded-lg p-4 shadow-inner w-full">
    <div className="flex items-center justify-between mb-3">
      <span className="text-gray-300 text-sm">Recorded Audio</span>
      <span className="text-gray-400 text-sm">
        {formatTime(recordingTime)}
      </span>
    </div>
    <div ref={waveformContainerRef} className="w-full h-14" />
  </div>
</div>

                  )}

                  {isRecording && (
                    <div className="text-center">
                      <div className="text-red-400 font-mono text-lg mb-2">
                        ● {formatTime(recordingTime)} {isPaused && "(Paused)"}
                      </div>
                      <p className="text-gray-400 text-sm">
                        {isPaused ? "Recording paused" : "Recording..."}
                      </p>
                    </div>
                  )}
                </div>

                {/* Submit */}

                {/* Disclaimer */}
              </div>
            </div>
          </div>
          <div className="text-center mb-8">
            <button
              onClick={handleSubmit}
              disabled={!audioBlob || isAnalyzing}
              className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-red-500 to-purple-600 hover:from-red-600 hover:to-purple-700 disabled:from-gray-700 disabled:to-gray-800 text-white font-semibold rounded-xl transition-all duration-300 disabled:cursor-not-allowed transform hover:scale-105 disabled:scale-100 shadow-lg"
            >
              {isAnalyzing ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" /> Analyzing...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" /> Analyze Symptoms
                </>
              )}
            </button>
          </div>
        </div>
        <div className="text-center text-gray-500 text-sm">
          <p className="mb-1">
            ⚠ This tool is for informational purposes only and should not
            replace professional medical advice.
          </p>
          <p>
            Always consult with a qualified healthcare provider for proper
            diagnosis and treatment.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
