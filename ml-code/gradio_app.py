# from dotenv import load_dotenv
# load_dotenv()

# from fastapi import FastAPI, UploadFile, File, BackgroundTasks
# from fastapi.responses import FileResponse, JSONResponse
# from fastapi.middleware.cors import CORSMiddleware
# import os
# import uuid

# # ---- Import your pipeline functions ----
# from brain_of_bot import encode_image, analyze_image_with_query
# from voice_of_patient import transcribe_with_groq
# from voice_of_bot import text_to_speech_with_elevenlabs

# from langchain_huggingface import HuggingFaceEmbeddings
# from langchain_community.vectorstores import FAISS
# from groq import Groq

# # Load FAISS vector DB
# DB_FAISS_PATH = "vectorstore/db_faiss"
# embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
# db = FAISS.load_local(DB_FAISS_PATH, embedding_model, allow_dangerous_deserialization=True)
# retriever = db.as_retriever(search_kwargs={"k": 3})

# system_prompt = """You have to act as a professional doctor and give your response as such, I know you are not but this is for learning purpose.   
# With what you see or hear, Try to give your best possible medical opinion. 
# Do you find anything wrong medically? If you make a differential, suggest some remedies for them. 
# Do not add any numbers or special characters in your response.

# Try to give names of a few possible diseases, illnesses, or conditions that it could be, 
# but always clarify that this is not a confirmed diagnosis. 

# If relevant, suggest simple over-the-counter medicines or herbal remedies, but always advise the patient to consult a real doctor before taking any medicine.

# Offer preventive measures, precautions, mild treatments, or lifestyle changes if possible. 
# If there is a risk of emergency, advise immediate medical attention and give first-aid advice if needed.
# If mental health issues are suspected, provide supportive advice and encourage them to seek professional help.

# Respond in such a way that a normal person can understand.
# Keep your response in one long paragraph. 
# Always answer as if you are speaking directly to a patient.

# If an image is provided, do not say 'In the image I see' but instead respond in a way that a doctor would, like 'Based on the symptoms and visual information provided'.
# Do not respond as an AI model or use markdown formatting. 
# Your answer should mimic that of an actual doctor, empathetic and clear.
# Keep your answer concise, direct, and helpful, without preambles and prioritise preventive measures and lifestyle changes.
# Now, respond in the same language as the patient's query, which is detected as: {detected_language}.
# """

# app = FastAPI()

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],  # allow ALL origins
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # Ensure directories exist
# os.makedirs("outputs/voices", exist_ok=True)
# os.makedirs("temp", exist_ok=True)

# # --- Helper Functions ---
# def cleanup_file(path: str):
#     try:
#         if os.path.exists(path):
#             os.remove(path)
#             print(f"Deleted: {path}")
#     except Exception as e:
#         print(f"Error deleting file {path}: {e}")

# def process_inputs(audio_filepath: str, image_filepath: str = None):
#     # Step 1: Transcribe voice (returns text + detected language)
#     stt_text, detected_language = transcribe_with_groq(
#         GROQ_API_KEY=os.environ.get("GROQ_API_KEY"),
#         audio_filepath=audio_filepath,
#         stt_model="whisper-large-v3"
#     )

#     # Step 2: Retrieve RAG context
#     docs = retriever.invoke(stt_text)
#     rag_context = "\n\n".join([d.page_content for d in docs]) if docs else ""

#     # Step 3: Build query with system prompt
#     full_query = system_prompt.format(detected_language=detected_language)
#     full_query += f"\n\nPatient said: {stt_text}\n\nAdditional medical reference:\n{rag_context}"

#     # Step 4: Doctor response
#     if image_filepath:
#         doctor_response = analyze_image_with_query(
#             query=full_query,
#             encoded_image=encode_image(image_filepath),
#             model="meta-llama/llama-4-scout-17b-16e-instruct"
#         )
#     else:
#         client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
#         messages = [{"role": "user", "content": [{"type": "text", "text": full_query}]}]
#         resp = client.chat.completions.create(messages=messages, model="meta-llama/llama-4-maverick-17b-128e-instruct")
#         doctor_response = resp.choices[0].message.content

#     # Step 5: TTS (multilingual)
#     voice_info = text_to_speech_with_elevenlabs(
#         input_text=doctor_response,
#         language_code=detected_language
#     )
#     voice_file = voice_info["file"]

#     return stt_text, doctor_response, voice_file, detected_language

# # ---- API Endpoints ----
# @app.post("/analyze")
# async def analyze(
#     audio: UploadFile = File(...),
#     image: UploadFile = File(None),
#     background_tasks: BackgroundTasks = None
# ):
#     # Save uploaded files temporarily
#     audio_path = os.path.join("temp", f"temp_{uuid.uuid4().hex}.mp3")
#     with open(audio_path, "wb") as f:
#         f.write(await audio.read())

#     image_path = None
#     if image:
#         image_path = os.path.join("temp", f"temp_{uuid.uuid4().hex}.jpg")
#         with open(image_path, "wb") as f:
#             f.write(await image.read())

#     try:
#         stt_text, doctor_response, doctor_voice, detected_language = process_inputs(audio_path, image_path)
#     finally:
#         # schedule cleanup of temp input files
#         if background_tasks:
#             background_tasks.add_task(cleanup_file, audio_path)
#             if image_path:
#                 background_tasks.add_task(cleanup_file, image_path)

#     return {
#         "speech_to_text": stt_text,
#         "doctor_response": doctor_response,
#         "detected_language": detected_language,
#         "doctor_voice_url": f"http://127.0.0.1:8000/download-voice/{os.path.basename(doctor_voice)}"
#     }

# @app.get("/download-voice/{filename}")
# async def download_voice(filename: str, background_tasks: BackgroundTasks):
#     file_path = os.path.join("outputs", "voices", filename)
#     if os.path.exists(file_path):
#         return FileResponse(
#             file_path,
#             media_type="audio/mpeg",
#             filename=filename,
#             background=background_tasks.add_task(cleanup_file, file_path)
#         )
#     return JSONResponse(status_code=404, content={"error": "File not found"})


# to run: uvicorn gradio_app:app --reload

# from dotenv import load_dotenv
# load_dotenv()

# from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Form
# from fastapi.responses import FileResponse, JSONResponse
# from fastapi.middleware.cors import CORSMiddleware
# import os
# import uuid
# from collections import defaultdict

# # ---- Import your pipeline functions ----
# from brain_of_bot import encode_image, analyze_image_with_query
# from voice_of_patient import transcribe_with_groq
# from voice_of_bot import text_to_speech_with_elevenlabs

# from langchain_huggingface import HuggingFaceEmbeddings
# from langchain_community.vectorstores import FAISS
# from groq import Groq

# # ---- Load FAISS vector DB ----
# DB_FAISS_PATH = "vectorstore/db_faiss"
# embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
# db = FAISS.load_local(DB_FAISS_PATH, embedding_model, allow_dangerous_deserialization=True)
# retriever = db.as_retriever(search_kwargs={"k": 3})

# # ---- System Prompt ----
# SYSTEM_PROMPT = """You have to act as a professional doctor and give your response as such, I know you are not but this is for learning purpose.
# With what you see or hear, try to give your best possible medical opinion.
# Do you find anything wrong medically? If you make a differential, suggest some remedies for them.
# Do not add any numbers or special characters in your response.

# Try to give names of a few possible diseases, illnesses, or conditions that it could be,
# but always clarify that this is not a confirmed diagnosis.

# If relevant, suggest simple over-the-counter medicines or herbal remedies, but always advise the patient to consult a real doctor before taking any medicine.

# Offer preventive measures, precautions, mild treatments, or lifestyle changes if possible.
# If there is a risk of emergency, advise immediate medical attention and give first-aid advice if needed.
# If mental health issues are suspected, provide supportive advice and encourage them to seek professional help.

# Respond in such a way that a normal person can understand.
# Keep your response in one long paragraph.
# Always answer as if you are speaking directly to a patient.

# If an image is provided, do not say 'In the image I see' but instead respond in a way that a doctor would, like 'Based on the symptoms and visual information provided'.
# Do not respond as an AI model or use markdown formatting.
# Your answer should mimic that of an actual doctor, empathetic and clear.
# Keep your answer concise, direct, and helpful, without preambles and prioritise preventive measures and lifestyle changes.
# Now, respond in the same language as the patient's query, which is detected as: {detected_language}.
# """

# # ---- FastAPI app ----
# app = FastAPI()
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # Ensure directories exist
# os.makedirs("outputs/voices", exist_ok=True)
# os.makedirs("temp", exist_ok=True)

# # ---- Conversation Memory (per conversation_id) ----
# conversations = defaultdict(list)

# # ---- Helper Functions ----
# def cleanup_file(path: str):
#     try:
#         if os.path.exists(path):
#             os.remove(path)
#             print(f"Deleted: {path}")
#     except Exception as e:
#         print(f"Error deleting file {path}: {e}")

# def process_inputs(audio_filepath: str, image_filepath: str = None, conversation_id: str = "default"):
#     # Step 1: Transcribe voice
#     stt_text, detected_language = transcribe_with_groq(
#         GROQ_API_KEY=os.environ.get("GROQ_API_KEY"),
#         audio_filepath=audio_filepath,
#         stt_model="whisper-large-v3"
#     )

#     # Step 2: Retrieve RAG context
#     docs = retriever.invoke(stt_text)
#     rag_context = "\n\n".join([d.page_content for d in docs]) if docs else ""

#     # Step 3: Conversation memory
#     messages = conversations[conversation_id]

#     # Inject system prompt only at the start
#     if not messages:
#         messages.append({
#             "role": "system",
#             "content": SYSTEM_PROMPT.format(detected_language=detected_language)
#         })

#     # Add patient's input
#     messages.append({"role": "user", "content": f"Patient said: {stt_text}\n\nReference:\n{rag_context}"})

#     # Step 4: Doctor response
#     if image_filepath:
#         # Handle vision model
#         doctor_response = analyze_image_with_query(
#             query=stt_text + "\n\n" + rag_context,
#             encoded_image=encode_image(image_filepath),
#             model="meta-llama/llama-4-maverick-17b-128e-instruct"
#         )
#     else:
#         client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
#         resp = client.chat.completions.create(
#             messages=messages,
#             model="meta-llama/llama-4-maverick-17b-128e-instruct"
#         )
#         doctor_response = resp.choices[0].message.content

#     # Add doctor response to conversation
#     messages.append({"role": "assistant", "content": doctor_response})

#     # Step 5: TTS (multilingual)
#     voice_info = text_to_speech_with_elevenlabs(
#         input_text=doctor_response,
#         language_code=detected_language
#     )
#     voice_file = voice_info["file"]

#     return stt_text, doctor_response, voice_file, detected_language

# # ---- API Endpoints ----
# @app.post("/analyze")
# async def analyze(
#     audio: UploadFile = File(...),
#     image: UploadFile = File(None),
#     conversation_id: str = Form("default"),
#     background_tasks: BackgroundTasks = None
# ):
#     # Save uploaded files temporarily
#     audio_path = os.path.join("temp", f"temp_{uuid.uuid4().hex}.mp3")
#     with open(audio_path, "wb") as f:
#         f.write(await audio.read())

#     image_path = None
#     if image:
#         image_path = os.path.join("temp", f"temp_{uuid.uuid4().hex}.jpg")
#         with open(image_path, "wb") as f:
#             f.write(await image.read())

#     try:
#         stt_text, doctor_response, doctor_voice, detected_language = process_inputs(audio_path, image_path, conversation_id)
#     finally:
#         if background_tasks:
#             background_tasks.add_task(cleanup_file, audio_path)
#             if image_path:
#                 background_tasks.add_task(cleanup_file, image_path)

#     return {
#         "speech_to_text": stt_text,
#         "doctor_response": doctor_response,
#         "detected_language": detected_language,
#         "conversation_id": conversation_id,
#         "doctor_voice_url": f"http://127.0.0.1:8000/download-voice/{os.path.basename(doctor_voice)}"
#     }

# @app.get("/download-voice/{filename}")
# async def download_voice(filename: str, background_tasks: BackgroundTasks):
#     file_path = os.path.join("outputs", "voices", filename)
#     if os.path.exists(file_path):
#         return FileResponse(
#             file_path,
#             media_type="audio/mpeg",
#             filename=filename,
#             background=background_tasks.add_task(cleanup_file, file_path)
#         )
#     return JSONResponse(status_code=404, content={"error": "File not found"})

# @app.post("/reset/{conversation_id}")
# async def reset_conversation(conversation_id: str):
#     if conversation_id in conversations:
#         del conversations[conversation_id]
#     return {"status": f"Conversation {conversation_id} cleared"}


# fastapi_app.py
# fastapi_app.py
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import uuid
import time
from collections import defaultdict

# ---- Import your pipeline functions (assumed present) ----
from brain_of_bot import encode_image, analyze_image_with_query_full_conversation, groq_chat_completion
from voice_of_patient import transcribe_with_groq
from voice_of_bot import text_to_speech_with_elevenlabs

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from groq import Groq

# ---- Load FAISS vector DB (keep as-is) ----
DB_FAISS_PATH = "vectorstore/db_faiss"
embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
db = FAISS.load_local(DB_FAISS_PATH, embedding_model, allow_dangerous_deserialization=True)
retriever = db.as_retriever(search_kwargs={"k": 3})

# ---- System Prompt (single canonical content field) ----
SYSTEM_PROMPT_TEMPLATE = """You have to act as a professional doctor and give your response as such, I know you are not but this is for learning purpose.
With what you see or hear, try to give your best possible medical opinion.
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
Now, respond in the same language as the patient's query, which is detected as: {detected_language}.
"""

# ---- FastAPI app ----
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure directories exist
os.makedirs("outputs/voices", exist_ok=True)
os.makedirs("temp", exist_ok=True)

# ---- Conversation Memory ----
# Each conversation is a list of messages of shape:
# {"role": "system"|"user"|"assistant", "content": "string", optional "assistant_audio": "<url>"}
conversations = defaultdict(list)

# ---- Helpers ----
def cleanup_file(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
            # small sleep to help with file locks on some systems
            time.sleep(0.01)
            print(f"Deleted: {path}")
    except Exception as e:
        print(f"Error deleting file {path}: {e}")

def messages_for_model(conversation_messages):
    """
    Convert stored messages into the canonical shape expected by the chat API:
    [{"role":"system","content":"..."}, {"role":"user","content":"..."}, {"role":"assistant","content":"..."}]
    """
    out = []
    for m in conversation_messages:
        role = m.get("role")
        content = m.get("content")
        if role and (content is not None):
            out.append({"role": role, "content": content})
    return out

# ---- Core Processing ----
def process_inputs(audio_filepath: str, image_filepath: str = None, conversation_id: str = "default"):
    # 1) STT
    stt_text, detected_language = transcribe_with_groq(
        stt_model="whisper-large-v3",
        audio_filepath=audio_filepath,
        GROQ_API_KEY=os.environ.get("GROQ_API_KEY")
    )

    # 2) RAG retrieval
    docs = retriever.invoke(stt_text)
    rag_context = "\n\n".join([d.page_content for d in docs]) if docs else ""

    # 3) Ensure conversation exists and has system message
    msgs = conversations[conversation_id]
    if not msgs:
        system_content = SYSTEM_PROMPT_TEMPLATE.format(detected_language=detected_language)
        msgs.append({"role": "system", "content": system_content})

    # 4) Build user message content
    user_content = f"Patient said: {stt_text}"

    # Append reference to system instead of patient turn
    if rag_context and msgs and msgs[0]["role"] == "system":
        msgs[0]["content"] += f"\n\n(Reference for you, not to be shown to patient): {rag_context}"

    # 5) Generate assistant reply
    if image_filepath:
        encoded = encode_image(image_filepath)
        assistant_text = analyze_image_with_query_full_conversation(
            user_text=user_content,
            encoded_image=encoded,
            conversation_messages=msgs
        )
        # For image flow, append user and assistant after getting response
        msgs.append({"role": "user", "content": user_content})
        msgs.append({"role": "assistant", "content": assistant_text})
    else:
        # Append user first
        msgs.append({"role": "user", "content": user_content})
        chat_messages = [{"role": m["role"], "content": m["content"]} for m in msgs]
        assistant_text = groq_chat_completion(chat_messages)
        # already appended user above
        msgs.append({"role": "assistant", "content": assistant_text})

    # 7) TTS for assistant reply
    assistant_audio_file = None
    assistant_audio_url = None
    try:
        voice_info = text_to_speech_with_elevenlabs(
            input_text=assistant_text,
            language_code=detected_language
        )
        assistant_audio_file = voice_info["file"]
        assistant_audio_url = f"http://127.0.0.1:8000/download-voice/{os.path.basename(assistant_audio_file)}"
        msgs[-1]["assistant_audio"] = assistant_audio_url
    except Exception as e:
        print("TTS error:", e)

    return stt_text, assistant_text, assistant_audio_file, detected_language, msgs
# ---- Endpoints ----
@app.post("/analyze")
async def analyze(
    audio: UploadFile = File(...),
    image: UploadFile = File(None),
    conversation_id: str = Form(None),  # accept conversation_id from client if present
    background_tasks: BackgroundTasks = None
):
    # If no conversation_id passed → generate new one (server authoritative)
    if not conversation_id:
        conversation_id = str(uuid.uuid4())

    # Save uploads temporarily
    audio_path = os.path.join("temp", f"temp_audio_{uuid.uuid4().hex}.mp3")
    with open(audio_path, "wb") as f:
        f.write(await audio.read())

    image_path = None
    if image:
        image_path = os.path.join("temp", f"temp_image_{uuid.uuid4().hex}.jpg")
        with open(image_path, "wb") as f:
            f.write(await image.read())

    try:
        stt_text, doctor_response, doctor_voice, detected_language, messages = process_inputs(
            audio_path, image_path, conversation_id
        )
    finally:
        if background_tasks:
            background_tasks.add_task(cleanup_file, audio_path)
            if image_path:
                background_tasks.add_task(cleanup_file, image_path)

    return {
        "speech_to_text": stt_text,
        "doctor_response": doctor_response,
        "detected_language": detected_language,
        "conversation_id": conversation_id,  # return the conversation id (new or existing)
        "doctor_voice_url": f"http://127.0.0.1:8000/download-voice/{os.path.basename(doctor_voice)}" if doctor_voice else None,
        "messages": messages
    }

@app.get("/download-voice/{filename}")
async def download_voice(filename: str, background_tasks: BackgroundTasks):
    file_path = os.path.join("outputs", "voices", filename)
    if os.path.exists(file_path):
        # schedule cleanup after serving (optional)
        background_tasks.add_task(cleanup_file, file_path)
        return FileResponse(file_path, media_type="audio/mpeg", filename=filename)
    return JSONResponse(status_code=404, content={"error": "File not found"})

@app.post("/reset/{conversation_id}")
async def reset_conversation(conversation_id: str):
    # Delete server-side memory for that conversation id
    if conversation_id in conversations:
        del conversations[conversation_id]
    return {"status": f"Conversation {conversation_id} cleared"}