import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv("backend/.env")

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    print("No GOOGLE_API_KEY found in backend/.env")
else:
    genai.configure(api_key=api_key)
    print("Available Models:")
    try:
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(m.name)
    except Exception as e:
        print(f"Error listing models: {e}")
