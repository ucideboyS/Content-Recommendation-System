---

# 🎬 Movie Recommendation System

This project is a **Content-Based Movie Recommendation System** that suggests movies to users based on their preferences using metadata like genres, keywords, and descriptions. It leverages machine learning techniques and an interactive frontend to deliver personalized movie recommendations.

---
## 🎥 Project Demo
[![MovieRec Demo](https://img.youtube.com/vi/e1pU-sygGWU/0.jpg)](https://youtu.be/e1pU-sygGWU)

# Watch the full project demo on YouTube:
[MovieRec – Full Project Demo | Movie Recommendation System](https://youtu.be/e1pU-sygGWU)



---
---
## 🚀 Live Demo

[![Visit Live Site](https://img.shields.io/badge/Live%20Demo-Visit%20Now-blue?style=for-the-badge)](https://movie-recommendation-system-nine-beta.vercel.app)

---

## 📌 Table of Contents

* [Abstract](#abstract)
* [Features](#features)
* [Tech Stack](#tech-stack)
* [System Architecture](#system-architecture)
* [Installation](#installation)
* [Usage](#usage)
* [Screenshots](#screenshots)
* [Future Scope](#future-scope)
* [License](#license)

---

## 🧠 Abstract

The Movie Recommendation System enhances user experience by providing **personalized movie suggestions** using **content-based filtering** techniques. It analyzes movie metadata such as genres, keywords, and descriptions. Core ML techniques like **TF-IDF**, **Count Vectorizer**, and **Cosine Similarity** are used to compute similarities between movies.

The system is designed to work even for new users (cold-start problem) and does not depend on user ratings or collaborative behavior. Built with **Python, Pandas, NumPy, Scikit-learn**, and a **React.js** frontend, it ensures a seamless and engaging user experience.

---

## ✨ Features

* 🔐 User Registration & Login
* 🎥 Personalized Movie Recommendations
* 📜 Search and Movie Detail View
* 📖 Search & Recommendation History
* ⚙️ Content-Based Filtering using Cosine Similarity
* 💻 Interactive Frontend built in React.js
* 🧮 Efficient backend processing using Python & Jupyter Notebook

---
# Movie Recommendation System

[![Visit Live Site](https://img.shields.io/badge/Live%20Demo-Visit%20Now-blue?style=for-the-badge)](https://movie-recommendation-system-nine-beta.vercel.app)

## Technologies Used

**Frontend**  
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-764ABC?style=for-the-badge)
![Axios](https://img.shields.io/badge/Axios-5A29E4?style=for-the-badge&logo=axios&logoColor=white)
![Lottie](https://img.shields.io/badge/Lottie-000000?style=for-the-badge&logo=lottiefiles&logoColor=white)

**Backend & Database**  
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Uvicorn](https://img.shields.io/badge/Uvicorn-499848?style=for-the-badge&logo=uvicorn&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Neon DB](https://img.shields.io/badge/Neon%20DB-00f900?style=for-the-badge)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-000000?style=for-the-badge&logo=sqlalchemy&logoColor=white)
![Alembic](https://img.shields.io/badge/Alembic-000000?style=for-the-badge)
![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=JSON%20web%20tokens&logoColor=white)

**Machine Learning**  
![Scikit-learn](https://img.shields.io/badge/scikit_learn-F7931E?style=for-the-badge&logo=scikit-learn&logoColor=white)
![Pandas](https://img.shields.io/badge/Pandas-2C2D72?style=for-the-badge&logo=pandas&logoColor=white)
![NumPy](https://img.shields.io/badge/NumPy-013243?style=for-the-badge&logo=numpy&logoColor=white)

**Development Tools**  
![VS Code](https://img.shields.io/badge/VS_Code-0078D4?style=for-the-badge&logo=visual%20studio%20code&logoColor=white)
![Jupyter](https://img.shields.io/badge/Jupyter-F37626?style=for-the-badge&logo=jupyter&logoColor=white)
![pip](https://img.shields.io/badge/pip-3775A9?style=for-the-badge&logo=pypi&logoColor=white)
![npm](https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white)
![Postman](https://img.shields.io/badge/Postman-FF6C37?style=for-the-badge&logo=postman&logoColor=white)
![.env](https://img.shields.io/badge/.env-ECD53F?style=for-the-badge)
## 🧰 Tech Stack

---

## 🛠️ System Architecture

* **User Input:** Preferences like favorite genres, actors, and directors
* **Data Source:** Movies fetched from TMDB dataset
* **Feature Extraction:** TF-IDF / Count Vectorizer on metadata
* **Similarity Calculation:** Cosine Similarity
* **Frontend:** React.js interface for user interactions
* **Backend:** Python for data processing and serving recommendations

---

## 🔧 Installation

Follow the steps below to set up the project locally:

---

### 📥 Clone the Repository

```bash
git clone https://github.com/mahesh-bhosale/movie-recommendation-system.git
cd movie-recommendation-system
```

---

### 🧠 Backend Setup (FastAPI)

#### 📌 Create and Activate Virtual Environment

```bash
cd backend
python -m venv venv
```

##### 🖥️ For Windows (PowerShell):

```bash
venv\Scripts\activate
```

#### 📦 Install Dependencies

```bash
pip install -r requirements.txt
```

#### 🛠️ Add `.env` File in `backend/` Folder

Create a `.env` file and add the following:

```env
# Database Configuration
DATABASE_URL=create_your_own_key_postgresql_neondb

# API Keys
TMDB_API_KEY=create_your_own_key_from_tmdb

# JWT Configuration
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

#### 🤖 Add Trained Model

Place the `.pkl` model files in:

```
movie-recommendation-system/backend/app/ml_model/
```

You can download the models by running:

```bash
python backend/app/download_models.py
```

✅ Make sure to:

* Run this **after activating the virtual environment**.
* Ensure all dependencies are installed (`pip install -r requirements.txt`).
* Be in the **root directory** (`movie-recommendation-system/`) or adjust the path accordingly if you're inside the `backend` folder:

If you're **inside the `backend` folder**, use:

```bash
python app/download_models.py
```

#### 🚀 Run FastAPI Server

```bash
uvicorn app.main:app --reload
```

The backend will be available at: [http://127.0.0.1:8000](http://127.0.0.1:8000)

---

### 🌐 Frontend Setup (Next.js)

Open a **new terminal**:

```bash
cd frontend
```

#### 📄 Add `.env.local` File in `frontend/` Folder

Create a `.env.local` file and add:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000

# TMDB API Key
NEXT_PUBLIC_TMDB_API_KEY=create_your_own_key_from_tmdb
```

#### 📦 Install Dependencies

```bash
npm install
```

#### 🚀 Run the Frontend

```bash
npm run dev
```

The frontend will be available at: [http://localhost:3000](http://localhost:3000)

---


## 🚀 Usage

1. Register or log in.
2. Search for movies or browse suggestions.
3. View detailed information and similar movies.
4. Revisit previous search history.

---

## 📸 Screenshots


---

## 🎬 Features

### 1. 🔐 User Registration

Users can register by providing a username, email ID, and password. They can also select their favorite genres, actors, and directors.
![image](https://github.com/user-attachments/assets/2c9a8898-169e-4a05-8465-33f4193b7ef9)
![image](https://github.com/user-attachments/assets/c5c8a0fe-0450-4895-9384-71c76c724dca)
![image](https://github.com/user-attachments/assets/4a392f0a-bdf3-42bd-bddc-56ff2c2456fd)

---

### 2. 🔓 User Login

Registered users can log in using their valid username and password.
![image](https://github.com/user-attachments/assets/21458588-5560-4a89-acd5-e9e7bb15b4d2)

---

### 3. 🏠 Home Page

Displays popular movies and personalized recommendations for the user.
![image](https://github.com/user-attachments/assets/61c45f8d-d2f1-4497-a502-2c0e8b277e0b)
![image](https://github.com/user-attachments/assets/62d5ce17-d5a4-46e3-8a63-334d71bcc1f8)

---

### 4. 🔍 Search Engine

Users can search for movies. 
![image](https://github.com/user-attachments/assets/9d461008-304e-48b2-a46f-123e71f8e355)

---

### 5. 🎥 Movie Description

Users can:

* View detailed information about the movie
![image](https://github.com/user-attachments/assets/2b1acbaf-de93-47d8-9937-b0f655d9e741)
 
* Watch trailers
![image](https://github.com/user-attachments/assets/9408fe39-7574-4f78-8509-d528553482cf)

* Rate movies on a scale of 5
![image](https://github.com/user-attachments/assets/99f8b6f6-63be-4f47-95a9-1c9afa95dccb)

* Get similar movie recommendations by clicking on the **"Get Recommendation"** button
Recommendations are generated based on a **Content-based recommendation system**.
![image](https://github.com/user-attachments/assets/be9e69af-d959-4fb4-a281-1c357e76d045)
![image](https://github.com/user-attachments/assets/34be47dd-cdab-4598-9b34-f32366603592)

---

### 6. 📝 History

Displays a history of the movies watched by the user.
![image](https://github.com/user-attachments/assets/1da83be7-2166-4d2e-8e5b-1d68b0c7abd7)

---

### 7. 👤 User Profile

Users can view and manage their profile.
![image](https://github.com/user-attachments/assets/64735060-f955-4d47-a344-645a542e8f98)
![image](https://github.com/user-attachments/assets/60aeab1a-e70a-4e8d-937a-10cada0e3236)


---



---

## 🔮 Future Scope

* Add collaborative filtering for hybrid recommendations
* Improve UI/UX with advanced animations

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---