import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import cors from "cors";
import fs from "fs";
import FormData from "form-data";

const app = express();
app.use(cors());
const upload = multer({ dest: "uploads/" });

// Proxy route to FastAPI
app.post(
  "/api/analyze",
  upload.fields([{ name: "audio" }, { name: "image" }]),
  async (req, res) => {
    try {
      const formData = new FormData();

      if (req.files["audio"]) {
        const audioFile = req.files["audio"][0];
        formData.append(
          "audio",
          fs.createReadStream(audioFile.path),
          audioFile.originalname
        );
      }

      if (req.files["image"]) {
        const imageFile = req.files["image"][0];
        formData.append(
          "image",
          fs.createReadStream(imageFile.path),
          imageFile.originalname
        );
      }

      // ✅ Forward to FastAPI (port 8000)
      const response = await fetch("http://127.0.0.1:8000/analyze", {
        method: "POST",
        body: formData,
        headers: formData.getHeaders(),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`FastAPI error: ${response.status} ${text}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

app.listen(5000, () => {
  console.log("Express server running on http://localhost:5000");
});