import nltk
import ssl
import os

# Try to use certifi's certificates for this session
# This might help NLTK's downloader
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    # Python 2.7.9+ or 3.4+ already has this, pass
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

# Define a local NLTK data path
local_nltk_data_path = os.path.join(os.getcwd(), 'nltk_data_local')
if not os.path.exists(local_nltk_data_path):
    os.makedirs(local_nltk_data_path)

print(f"Attempting to download NLTK data to: {local_nltk_data_path}")

# Add local path to NLTK's search paths
if local_nltk_data_path not in nltk.data.path:
    nltk.data.path.append(local_nltk_data_path)

required_packages = ['punkt', 'averaged_perceptron_tagger']
for package in required_packages:
    try:
        print(f"Downloading NLTK package: {package}...")
        nltk.download(package, download_dir=local_nltk_data_path)
        print(f"Successfully downloaded {package}.")
    except Exception as e:
        print(f"Error downloading NLTK package {package}: {e}")

print("NLTK download process finished.")
print(f"NLTK data paths: {nltk.data.path}")
print(f"Please ensure your application (specifically unstructured or NLTK) can find data in one of these paths, or set the NLTK_DATA environment variable to '{local_nltk_data_path}'.") 