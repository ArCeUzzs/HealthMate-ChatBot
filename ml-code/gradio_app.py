from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import uuid

# ---- Import your pipeline functions ----
from brain_of_bot import encode_image, analyze_image_with_query
from voice_of_patient import transcribe_with_groq
from voice_of_bot import text_to_speech_with_gtts

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from groq import Groq

# Load FAISS vector DB
DB_FAISS_PATH = "vectorstore/db_faiss"
embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
db = FAISS.load_local(DB_FAISS_PATH, embedding_model, allow_dangerous_deserialization=True)
retriever = db.as_retriever(search_kwargs={"k": 3})

system_prompt = """You have to act as a professional doctor and give your response as such, I know you are not but this is for learning purpose.   
With what you see or hear, Try to give your best possible medical opinion. 
Do you find anything wrong medically? If you make a differential, suggest some remedies for them. 
Do not add any numbers or special characters in your response.

Try to give names of a few possible diseases, illnesses, or conditions that it could be, 
but always clarify that this is not a confirmed diagnosis. 

If relevant, suggest simple over-the-counter medicines or herbal remedies, but always advise the patient to consult a real doctor before taking any medicine.

Offer preventive measures, precautions, mild treatments, or lifestyle changes if possible. 
If there is a risk of emergency, advise immediate medical attention and give first-aid advice if needed.
If mental health issues are suspected, provide supportive advice and encourage them to seek professional help.

Respond in such a way that a normal person can understand.
Keep your response in one long paragraph. 
Always answer as if you are speaking directly to a patient.

If an image is provided, do not say 'In the image I see' but instead respond in a way that a doctor would, like 'Based on the symptoms and visual information provided'.
Do not respond as an AI model or use markdown formatting. 
Your answer should mimic that of an actual doctor, empathetic and clear.
Keep your answer concise, direct, and helpful, without preambles and prioritise preventive measures and lifestyle changes.
"""

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow ALL origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure directories exist
os.makedirs("outputs/voices", exist_ok=True)
os.makedirs("temp", exist_ok=True)

# --- Helper Functions ---
def cleanup_file(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
            print(f"Deleted: {path}")
    except Exception as e:
        print(f"Error deleting file {path}: {e}")

def process_inputs(audio_filepath: str, image_filepath: str = None):
    # Step 1: Transcribe voice
    speech_to_text_output = transcribe_with_groq(
        GROQ_API_KEY=os.environ.get("GROQ_API_KEY"),
        audio_filepath=audio_filepath,
        stt_model="whisper-large-v3"
    )

    # Step 2: Retrieve RAG context
    docs = retriever.invoke(speech_to_text_output)
    rag_context = "\n\n".join([d.page_content for d in docs]) if docs else ""

    # Step 3: Build query
    full_query = f"{system_prompt}\n\nPatient said: {speech_to_text_output}\n\nAdditional medical reference:\n{rag_context}"

    # Step 4: Doctor response
    if image_filepath:
        doctor_response = analyze_image_with_query(
            query=full_query,
            encoded_image=encode_image(image_filepath),
            model="meta-llama/llama-4-scout-17b-16e-instruct"
        )
    else:
        client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        messages = [{"role": "user", "content": [{"type": "text", "text": full_query}]}]
        resp = client.chat.completions.create(messages=messages, model="meta-llama/llama-4-scout-17b-16e-instruct")
        doctor_response = resp.choices[0].message.content

    # Step 5: TTS
    voice_info = text_to_speech_with_gtts(input_text=doctor_response)
    voice_file = voice_info["file"]

    return speech_to_text_output, doctor_response, voice_file

# ---- API Endpoints ----
@app.post("/analyze")
async def analyze(
    audio: UploadFile = File(...),
    image: UploadFile = File(None),
    background_tasks: BackgroundTasks = None
):
    # Save uploaded files temporarily
    audio_path = os.path.join("temp", f"temp_{uuid.uuid4().hex}.mp3")
    with open(audio_path, "wb") as f:
        f.write(await audio.read())

    image_path = None
    if image:
        image_path = os.path.join("temp", f"temp_{uuid.uuid4().hex}.jpg")
        with open(image_path, "wb") as f:
            f.write(await image.read())

    try:
        stt_text, doctor_response, doctor_voice = process_inputs(audio_path, image_path)
    finally:
        # schedule cleanup of temp input files
        if background_tasks:
            background_tasks.add_task(cleanup_file, audio_path)
            if image_path:
                background_tasks.add_task(cleanup_file, image_path)

    return {
        "speech_to_text": stt_text,
        "doctor_response": doctor_response,
        "doctor_voice_url": f"http://127.0.0.1:8000/download-voice/{os.path.basename(doctor_voice)}"
    }

@app.get("/download-voice/{filename}")
async def download_voice(filename: str, background_tasks: BackgroundTasks):
    file_path = os.path.join("outputs", "voices", filename)
    if os.path.exists(file_path):
        return FileResponse(
            file_path,
            media_type="audio/mpeg",
            filename=filename,
            background=background_tasks.add_task(cleanup_file, file_path)
        )
    return JSONResponse(status_code=404, content={"error": "File not found"})


# to run: uvicorn gradio_app:app --reload