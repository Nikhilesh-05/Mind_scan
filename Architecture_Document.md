# MindScan: Technical Architecture Document

## 1. Application Architecture

**Selected Architecture:** Decoupled Monolithic Architecture (Client-Server)

**Detailed Explanation & Justification:**
The MindScan project adopts a Decoupled Monolithic Architecture, where the system is cleanly divided into a rich frontend client (React/Vite) and a centralized monolithic backend (FastAPI/Python), decoupled via RESTful APIs. 

While Microservices provide granular scalability, they introduce unnecessary overhead, complex container orchestration, and network latency—factors that are highly detrimental to a small team executing rapid iterations. Event-Driven architecture and Serverless architectures were considered but ultimately discarded. Serverless functions suffer from "cold starts" which could disrupt the fluidity of the real-time AI report generation, and an Event-Driven setup would overcomplicate the sequential, straightforward nature of the user's session states (Login -> Chat -> Audio -> Video -> Report).

A Decoupled Monolithic backend is highly justified because:
1. **Performance:** Running FastAPI as a single service async application leverages an unblocked event loop, allowing rapid database transactions and integration with the Fusion Engine without inter-service RPC calls.
2. **Edge Computing:** The architecture intentionally pushes heavy, high-latency computational work (such as the Video processing using `face-api.js`) to the client-side edge. The backend only handles light JSON storage, Sarvam AI integrations, and the final deterministic mathematical fusion.
3. **Simplicity & Maintainability:** A single backend repository with localized standard relational database connections is significantly easier to develop, debug, and deploy. 

---

## 2. Database Design

The data persistence layer relies on a relational model (PostgreSQL/SQLite) mapped via SQLAlchemy ORM. The relational schema heavily utilizes Foreign Key cascading for data integrity.

### 2.1 Schema Design
* **User Entity:** Stores the fundamental account information (`id`, `email`, `hashed_password`). Passwords are salted and hashed via bcrypt before insertion.
* **Session Entity:** Acts as the parent container tracking a unified diagnostic trial (`id`, `user_id`, `status`, `created_at`).
* **Modality Results (ChatResult, AudioResult, VideoResult):** These are child tables tied to the Session via foreign keys. Instead of rigidly typing every AI metadata metric, they utilize JSON/VARCHAR columns to gracefully store algorithmically generated arrays (e.g., Sentiment scores, PHQ-9 flags, emotion confidence bounds).

### 2.2 Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    USER ||--o{ SESSION : creates
    SESSION ||--o| CHAT_RESULT : contains
    SESSION ||--o| AUDIO_RESULT : contains
    SESSION ||--o| VIDEO_RESULT : contains

    USER {
        int id PK
        string email
        string hashed_password
    }
    SESSION {
        int id PK
        int user_id FK
        string status
        datetime created_at
    }
    CHAT_RESULT {
        int id PK
        int session_id FK
        json metadata
    }
    AUDIO_RESULT {
        int id PK
        int session_id FK
        json metadata
    }
    VIDEO_RESULT {
        int id PK
        int session_id FK
        json metadata
    }
```

---

## 3. Data Exchange Contract

MindScan relies on a strict data exchange contract between its decoupled layers to securely manage real-time diagnostic captures without leaking raw biometric records.

### 3.1 Frequency of Data Exchanges
* **Continuous Edge Aggregation:** The webcam processes frames at ~10-15 FPS entirely locally in the browser. Network exchanges do not occur per frame; instead, the browser averages the emotion arrays over a 30-second sliding window and sends a single deterministic JSON payload upon completion.
* **Chucked Streaming Responses:** Audio modalities transfer 15 to 30-second WAV audio buffers per step.
* **Turn-based Asynchronous Polling:** Chat messages trigger an API call immediately after the user sends text to evaluate sentiment with the Sarvam AI NLP modules. 

### 3.2 Data Sets
* **Authentication Data:** JWT tokens attached to HTTP headers, holding encoded `user_id` and signatures.
* **Visual/Audio Metadata:** Array variables, tracking percentages for core emotions (Happy, Sad, Neutral, Disgust), and acoustic features like Pitch Mean (~140-165Hz). 
* **Conversational Logs:** String objects containing raw user prompts, and structured dictionaries denoting PHQ-9 trigger occurrences.
* **Reporting Data:** Streamed application/pdf binary bytes holding the final fused result.

### 3.3 Mode of Exchanges
The primary communication mode is **REST API** operating over standard HTTP/HTTPS channels.
* **JSON (application/json):** Used for lightweight parameter transmission (login requests, chat text loops, algorithm weight uploads).
* **Multi-Part Form Data (multipart/form-data):** Exclusively utilized to transfer the raw Audio BLOBs securely.
* **Streaming Response:** Used to serve the generated fpdf2 PDF files without forcing the browser to load oversized blobs in local memory layout.

---

## 4. System Diagrams

### 4.1 Use Case Diagram

```mermaid
flowchart LR
    User([End-User / Patient])
    Therapist([Healthcare Provider])

    subgraph MindScan System
        UC1(Register/Login Account)
        UC2(Interact with Conversational Agent)
        UC3(Record Vocal Audio Prompt)
        UC4(Capture Webcam Video Emotions)
        UC5(Generate Consolidated PDF Report)
    end

    User --> UC1
    User --> UC2
    User --> UC3
    User --> UC4
    User --> UC5

    UC5 --> Therapist
```

### 4.2 Class Diagram

```mermaid
classDiagram
    class User {
        +int id
        +String email
        +String hashed_password
        +login()
        +register()
    }
    class Session {
        +int id
        +int user_id
        +String status
        +start_session()
        +end_session()
    }
    class ModalityResult {
        <<Abstract>>
        +int id
        +int session_id
        +JSON metadata
        +save_result()
    }
    class ChatResult
    class AudioResult
    class VideoResult

    class FusionEngine {
        +calculate_risk(chat_data, audio_data, video_data)
        +generate_report_pdf()
    }

    User "1" -- "*" Session
    Session "1" -- "1" ChatResult
    Session "1" -- "1" AudioResult
    Session "1" -- "1" VideoResult
    ModalityResult <|-- ChatResult
    ModalityResult <|-- AudioResult
    ModalityResult <|-- VideoResult
    FusionEngine ..> Session : requires references
```

### 4.3 Data Flow Diagram (DFD)

```mermaid
flowchart TD
    U[End User] -->|1. Credentials| Auth[FastAPI Auth Service]
    Auth -->|2. Validates/Stores| DB[(Relational Database)]
    
    U -->|3. Text Chat| NLP[NLP Application Endpoint]
    NLP -->|4. AI Metrics| DB
    
    U -->|5. Voice / Audio Blobs| Audio[Audio Processing Service]
    Audio -->|6. Prosody Model Metrics| DB
    
    U -->|7. Evaluated Emotion Confidences| Frontend[React Client-Side AI]
    Frontend -->|8. Pre-Processed Arrays| Video[Video Scoring Endpoint]
    Video --> DB
    
    U -->|9. Requests Report| Report[Report Generation Endpoint]
    Report -->|10. Queries all metadata| DB
    DB -->|11. Aggregated JSON| Fusion[Fusion Logic Module]
    Fusion -->|12. Produces PDF stream| Report
    Report -->|13. Returns Diagnostic PDF| U
```

### 4.4 Component Diagram

```mermaid
flowchart TB
    subgraph Client [Client-Side Browser Frontend]
        ReactUI[React.js User Interface]
        State[Zustand State Manager]
        VideoEngine[Face-API.js Deep Learning Model]
        AudioEngine[HTML5 MediaRecorder WebAudio API]
    end

    subgraph Backend [High-Performance Backend Server]
        Router[FastAPI Route Handlers]
        AuthService[Passlib / JWT Auth Pipeline]
        FusionCore[Fusion Risk Math Engine]
        PDF[fpdf2 Generator Tool]
        Sarvam[Sarvam AI Integrator]
        ORM[SQLAlchemy v2 ORM]
    end

    subgraph Persistence [Database Container]
        DB[(PostgreSQL)]
    end

    ReactUI -->|HTTPS Calls| Router
    VideoEngine -->|Local Event Updates| ReactUI
    AudioEngine -->|Buffered Signals| ReactUI
    
    Router <--> AuthService
    Router <--> Sarvam
    Router <--> FusionCore
    FusionCore <--> PDF
    
    AuthService <--> ORM
    Sarvam <--> ORM
    FusionCore <--> ORM
    
    ORM <--> DB
```

### 4.5 Sequence Diagram

```mermaid
sequenceDiagram
    actor Patient
    participant React UI
    participant FastAPI Application
    participant Sarvam AI
    participant PostgreSQL Database

    Patient->>React UI: Logs into MindScan
    React UI->>FastAPI Application: POST /auth/login
    FastAPI Application->>PostgreSQL Database: Validate hashed password
    PostgreSQL Database-->>FastAPI Application: Validation OK
    FastAPI Application-->>React UI: Returns active JWT Token

    Patient->>React UI: Engages text chatbot
    React UI->>FastAPI Application: POST /chat w/ JWT
    FastAPI Application->>Sarvam AI: Proxy request for text sentiment
    Sarvam AI-->>FastAPI Application: Returns negative/positive scoring
    FastAPI Application->>PostgreSQL Database: Insert ChatResult row
    FastAPI Application-->>React UI: Returns Next Chat Prompt

    Patient->>React UI: Activates Webcam Window
    React UI->>React UI: face-api.js processes frames Client Edge
    React UI->>FastAPI Application: POST precalculated emotion arrays
    FastAPI Application->>PostgreSQL Database: Insert VideoResult row

    Patient->>React UI: Requests final analysis
    React UI->>FastAPI Application: GET /report/download
    FastAPI Application->>PostgreSQL Database: Fetch Chat, Audio, Video Results
    PostgreSQL Database-->>FastAPI Application: Returns related Session metadata
    FastAPI Application->>FastAPI Application: Fuse weighted average risks
    FastAPI Application->>FastAPI Application: Render raw metrics into fpdf2 PDF 
    FastAPI Application-->>React UI: Application/PDF Byte Stream
    React UI-->>Patient: Downloads Document
```

### 4.6 Deployment Diagram

```mermaid
flowchart TD
    subgraph EndUser [Client Premise]
        WebCam[Webcam Hardware]
        Mic[Microphone Hardware]
        Browser[Modern Browser - HTML5 MediaDevices]
        
        WebCam --> Browser
        Mic --> Browser
    end

    subgraph ServerCloud [Cloud Platform / VPS]
        Nginx[Reverse Proxy - Nginx/SSL]
        Uvicorn[ASGI Web Worker - Uvicorn]
        App[FastAPI Python Application]
        
        Nginx <--> Uvicorn
        Uvicorn <--> App
    end

    subgraph DataTier [Secure Database Network]
        RDBS[(PostgreSQL 15+)]
    end
    
    subgraph ThirdParty [Third Party APIs]
        ExAI[Sarvam AI NLP]
    end

    Browser <-->|HTTPS REST & JSON| Nginx
    App <-->|SQL TCP/IP| RDBS
    App <-->|HTTPS JSON API| ExAI
```
