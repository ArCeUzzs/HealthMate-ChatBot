from dotenv import load_dotenv
load_dotenv()

#Step1a: Setup Text to Speech–TTS–model with gTTS
import os
from gtts import gTTS

def text_to_speech_with_gtts_old(input_text, output_filepath):
    language="en"

    audioobj= gTTS(
        text=input_text,
        lang=language,
        slow=False
    )
    audioobj.save(output_filepath)


#input_text="Hi this is Ai with Sudeep!"
#text_to_speech_with_gtts_old(input_text=input_text, output_filepath="gtts_testing.mp3")

#Step1b: Setup Text to Speech–TTS–model with ElevenLabs
import os
from elevenlabs import ElevenLabs

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")

def text_to_speech_with_elevenlabs(input_text, output_filepath):
    client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

    # Generate speech
    audio = client.text_to_speech.convert(
        voice_id="JBFqnCBsd6RMkjVDRZzb",  # Use the voice ID (e.g., "Aria", "Rachel", etc.)
        model_id="eleven_turbo_v2",
        output_format="mp3_22050_32",
        text=input_text,
    )

    # Save the audio bytes to file
    with open(output_filepath, "wb") as f:
        for chunk in audio:  # audio is a generator
            f.write(chunk)

# Example usage
#text_to_speech_with_elevenlabs(input_text, "elevenlabs_testing.mp3")




#Step2: Use Model for Text output to Voice

import uuid
import time
import os
from datetime import datetime
from gtts import gTTS, gTTSError

def text_to_speech_with_gtts(
    input_text,
    output_filepath=None,
    lang="en",
    retries=3,
    delay=2,
    folder="outputs/voices"
):
    """
    Convert text to speech using gTTS with retries and metadata.

    Args:
        input_text (str): Text to convert to speech.
        output_filepath (str, optional): Path to save the MP3 file.
        lang (str, optional): Language for speech. Default is "en".
        retries (int, optional): Number of retry attempts.
        delay (int, optional): Delay between retries in seconds.
        folder (str, optional): Directory to save output files.

    Returns:
        dict: {
            "file": str (file path),
            "size": int (file size in bytes),
            "created_at": str (ISO timestamp)
        }
    """
    os.makedirs(folder, exist_ok=True)

    if output_filepath is None:
        output_filepath = os.path.join(folder, f"final_{uuid.uuid4().hex}.mp3")

    for attempt in range(retries):
        try:
            tts = gTTS(text=input_text, lang=lang, slow=False)
            tts.save(output_filepath)

            if os.path.exists(output_filepath) and os.path.getsize(output_filepath) > 0:
                return {
                    "file": output_filepath,
                    "size": os.path.getsize(output_filepath),
                    "created_at": datetime.now().isoformat()
                }

            print(f"[gTTS Warning] Empty file on attempt {attempt+1}")
            time.sleep(delay)

        except gTTSError as e:
            print(f"[gTTS Error] {e} — retry {attempt+1}/{retries}")
            time.sleep(delay)

    raise Exception("gTTS failed after multiple retries or produced empty files")


# return path so Gradio can serve it

# Example usage
#input_text = "Hi this is Ai with Hassan, autoplay testing without ffmpeg!"
#text_to_speech_with_gtts(input_text=input_text, output_filepath="gtts_testing_autoplay.mp3")