# brain_of_bot.py

import os
import base64
from groq import Groq

# Step 1: Setup API key and default model
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
MODEL_NAME = "meta-llama/llama-4-maverick-17b-128e-instruct"


# Step 2: Encode image to base64
def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


# Step 3: Wrapper for calling Groq chat completion
def groq_chat_completion(chat_messages, model=MODEL_NAME):
    """
    Call Groq chat completions with the given messages.
    chat_messages = [ {"role": "system|user|assistant", "content": str or multimodal list}, ... ]
    """
    client = Groq(api_key=GROQ_API_KEY)
    resp = client.chat.completions.create(
        messages=chat_messages,
        model=model
    )
    return resp.choices[0].message.content


# Step 4: Multimodal (image+text) query with conversation context
def analyze_image_with_query_full_conversation(user_text, encoded_image, conversation_messages):
    """
    Use this when you have system prompt + previous turns in conversation_messages.

    Params:
      user_text (str): what the patient said (+ optional RAG context)
      encoded_image (str): base64 string from encode_image
      conversation_messages (list): existing conversation list, e.g.
        [{"role":"system","content":"..."},
         {"role":"user","content":"..."},
         {"role":"assistant","content":"..."}]
    """
    chat_messages = []
    for m in conversation_messages:
        role = m.get("role")
        content = m.get("content")
        if role and content is not None:
            chat_messages.append({"role": role, "content": content})

    # Append the latest user message with BOTH text and image
    multimodal_user_content = [
        {"type": "text", "text": user_text},
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{encoded_image}"}
        }
    ]
    chat_messages.append({"role": "user", "content": multimodal_user_content})

    # Call Groq
    return groq_chat_completion(chat_messages, model=MODEL_NAME)