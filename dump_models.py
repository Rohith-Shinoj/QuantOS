import os
import google.generativeai as genai
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path, override=True)

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    print("NO API KEY")
else:
    genai.configure(api_key=api_key)
    with open("models.txt", "w") as f:
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                f.write(f"{m.name}\n")
    print("Done")
