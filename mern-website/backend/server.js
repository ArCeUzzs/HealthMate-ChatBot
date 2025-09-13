// server.js
import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import cors from "cors";
import fs from "fs";
import FormData from "form-data";
import dotenv from "dotenv";
// import path from "path";

dotenv.config();

const app = express();
app.use(cors());
const upload = multer({ dest: "uploads/" });

// Proxy /api/analyze -> FastAPI /analyze
app.post(
  "/api/analyze",
  upload.fields([{ name: "audio" }, { name: "image" }]),
  async (req, res) => {
    try {
      const formData = new FormData();

      // Attach audio
      if (req.files && req.files["audio"]) {
        const audioFile = req.files["audio"][0];
        formData.append("audio", fs.createReadStream(audioFile.path), audioFile.originalname);
      }

      // Attach image
      if (req.files && req.files["image"]) {
        const imageFile = req.files["image"][0];
        formData.append("image", fs.createReadStream(imageFile.path), imageFile.originalname);
      }

      // Forward conversation_id if provided in the original request (multer puts text fields in req.body)
      if (req.body && req.body.conversation_id) {
        formData.append("conversation_id", req.body.conversation_id);
      }

      // Forward any other form fields if needed
      for (const key of Object.keys(req.body || {})) {
        if (key !== "conversation_id") {
          formData.append(key, req.body[key]);
        }
      }

      const response = await fetch("http://127.0.0.1:8000/analyze", {
        method: "POST",
        body: formData,
        headers: formData.getHeaders(),
      });

      // parse JSON (FastAPI returns JSON)
      const data = await response.json();

      // Clean up temp uploads
      try {
        if (req.files) {
          Object.values(req.files).flat().forEach((f) => {
            if (f && f.path && fs.existsSync(f.path)) {
              fs.unlinkSync(f.path);
            }
          });
        }
      } catch (e) {
        console.warn("cleanup error:", e);
      }

      res.status(response.status).json(data);
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Proxy reset endpoint
app.post("/reset/:conversationId", async (req, res) => {
  const { conversationId } = req.params;
  try {
    const response = await fetch(`http://127.0.0.1:8000/reset/${encodeURIComponent(conversationId)}`, {
      method: "POST",
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("Proxy reset error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Express proxy running on http://localhost:${PORT}`);
});