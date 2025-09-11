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
import uuid
from datetime import datetime
from elevenlabs import ElevenLabs, VoiceSettings

# Initialize the ElevenLabs client
client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

# Add a language parameter
def text_to_speech_with_elevenlabs(input_text, language_code, output_filepath=None, voice_id="6JsmTroalVewG1gA6Jmw", retries=3, delay=2, folder="outputs/voices"):
    """
    Convert text to speech using ElevenLabs with retries and metadata.

    Args:
        input_text (str): Text to convert to speech.
        language_code (str): The language code for the output speech (e.g., 'en', 'fr').
        output_filepath (str, optional): Path to save the MP3 file.
        voice_id (str, optional): ID of the voice to use. Default is "JBFqnCBsd6RMkjVDRZzb".
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
            # Convert text to speech
            audio = client.text_to_speech.convert(
                # Use the detected language code here
                model_id="eleven_multilingual_v2", # Use a multilingual model
                # You can also set a specific voice based on the language
                # For example: voice_id=get_multilingual_voice(language_code),
                text=input_text,
                voice_id="6JsmTroalVewG1gA6Jmw", # Or another suitable voice ID
                voice_settings=VoiceSettings(
                    stability=0.0,
                    similarity_boost=1.0,
                    style=0.0,
                    use_speaker_boost=True
                )
            )

            # Save the audio to file
            with open(output_filepath, "wb") as f:
                for chunk in audio:
                    f.write(chunk)

            # Check if the file is non-empty
            if os.path.exists(output_filepath) and os.path.getsize(output_filepath) > 0:
                return {
                    "file": output_filepath,
                    "size": os.path.getsize(output_filepath),
                    "created_at": datetime.now().isoformat()
                }

            print(f"[ElevenLabs Warning] Empty file on attempt {attempt+1}")
            time.sleep(delay)

        except Exception as e:
            print(f"[ElevenLabs Error] {e} — retry {attempt+1}/{retries}")
            time.sleep(delay)

    raise Exception("ElevenLabs TTS failed after multiple retries or produced empty files")


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