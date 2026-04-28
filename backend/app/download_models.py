import os
from pathlib import Path
import gdown
import pickle

def download_file_from_google_drive(file_id, output_path):
    """
    Download a file from Google Drive using gdown.
    
    Args:
        file_id (str): The file ID from Google Drive
        output_path (Path): Where to save the file
    """
    url = f'https://drive.google.com/uc?id={file_id}'
    
    # Create parent directory if it doesn't exist
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"Downloading to {output_path}...")
    try:
        # Use gdown to download the file
        gdown.download(url, str(output_path), quiet=False, fuzzy=True)
        
        # Verify file exists and has size
        if not output_path.exists():
            raise RuntimeError("Download failed - file not created")
        
        file_size = output_path.stat().st_size
        if file_size == 0:
            raise RuntimeError("Downloaded file is empty")
        
        print(f"Downloaded file size: {file_size / (1024*1024):.2f} MB")
        
        # Verify pickle file
        if output_path.suffix.lower() == '.pkl':
            with open(output_path, 'rb') as f:
                pickle.load(f)
            print("✅ Successfully verified pickle file")
        
        return True
        
    except Exception as e:
        print(f"❌ Download failed: {str(e)}")
        if output_path.exists():
            output_path.unlink()  # Delete failed download
        return False

def download_models():
    """Download all required model files."""
    model_dir = Path("app/ml_model")
    
    # Download simi.pkl
    simi_path = model_dir / "simi.pkl"
    if not download_file_from_google_drive(
        "1z48JOfbPcYLfZzbr9ax0lBqTDtND0Bvn",
        simi_path
    ):
        raise RuntimeError("Failed to download simi.pkl")
    
    # Download movie_dict.pkl
    movie_dict_path = model_dir / "movie_dict.pkl"
    if not download_file_from_google_drive(
        "1XraEXCrqAr_8JR11ZGA2Gxe2QYHxy8lu",
        movie_dict_path
    ):
        raise RuntimeError("Failed to download movie_dict.pkl")

if __name__ == "__main__":
    try:
        download_models()
        print("✅ All models downloaded successfully")
    except Exception as e:
        print(f"❌ Error downloading models: {e}")
        exit(1) 