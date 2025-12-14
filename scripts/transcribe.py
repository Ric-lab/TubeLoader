import sys
import os
import warnings
import whisper
import argparse

# Suppress warnings
warnings.filterwarnings("ignore")

def transcribe_audio(file_path, output_dir, model_name="tiny"):
    print(f"DEBUG: Loading Whisper model '{model_name}'...")
    try:
        model = whisper.load_model(model_name)
    except Exception as e:
        print(f"ERROR: Failed to load model: {e}")
        sys.exit(1)

    print(f"DEBUG: Transcribing '{file_path}'...")
    try:
        result = model.transcribe(file_path)
    except Exception as e:
        print(f"ERROR: Transcription failed: {e}")
        sys.exit(1)

    # Save as SRT
    filename = os.path.basename(file_path)
    base_name = os.path.splitext(filename)[0]
    srt_path = os.path.join(output_dir, f"{base_name}.srt")

    print(f"DEBUG: Saving to '{srt_path}'...")
    
    with open(srt_path, "w", encoding="utf-8") as f:
        # Write SRT format
        for i, segment in enumerate(result["segments"]):
            start = format_timestamp(segment["start"])
            end = format_timestamp(segment["end"])
            text = segment["text"].strip()
            
            f.write(f"{i + 1}\n")
            f.write(f"{start} --> {end}\n")
            f.write(f"{text}\n\n")

    print(f"SUCCESS: {srt_path}")

def format_timestamp(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transcribe audio using Whisper")
    parser.add_argument("file", help="Path to the audio file")
    parser.add_argument("output_dir", help="Directory to save the SRT file")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.file):
        print(f"ERROR: File not found: {args.file}")
        sys.exit(1)
        
    transcribe_audio(args.file, args.output_dir)
