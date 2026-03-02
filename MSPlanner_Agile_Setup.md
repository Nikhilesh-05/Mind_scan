# MS Planner: Sprint Backlog & Daily Scrum Setup

For your presentation, you want to show that you didn't do all 10 User Stories at once. A "Sprint" is a short 2-week cycle. For **Sprint 1**, you should pick the foundational stories.

---

## 1. What to add to your Sprint Backlog (Sprint 1)
In MS Planner, create a new Bucket called "Sprint 1 Backlog". You will drag **User Story 1** and **User Story 8** into this sprint. Then, break them down into these specific MS Planner Tasks:

### Task 1: Setup React Frontend & Tailwind
*   **Assigned to:** [Your Name]
*   **Description:** Initialize the Vite + React 18 project scaffolding. Install Tailwind CSS and Framer Motion. Set up the foundational folder structure (components, pages, assets) and baseline routing using React Router v6.

### Task 2: Setup FastAPI Backend & Database Schema
*   **Assigned to:** [Your Name]
*   **Description:** Initialize the Python FastAPI backend. Configure Alembic for database migrations. Create the SQLAlchemy ORM models (tables) for `User` and `Session` in PostgreSQL/SQLite.

### Task 3: Implement Authentication API & Password Hashing
*   **Assigned to:** [Your Name]
*   **Description:** Write backend endpoints for `/auth/register` and `/auth/login`. Integrate the `passlib` and `bcrypt` libraries to securely hash user passwords before saving them to the database. Generate JWT tokens upon login.

### Task 4: Build Login & Registration UI Screens
*   **Assigned to:** [Your Name]
*   **Description:** Develop the React components for the Signup and Login pages. Implement form validation. Use Framer Motion to add smooth transition animations. Connect the forms to the backend API using Axios.

### Task 5: Implement Responsive Global Dashboard Layout
*   **Assigned to:** [Your Name]
*   **Description:** Build the main application shell including the sidebar navigation (Chat, Audio, Video, Report) and top header metrics. Ensure the layout utilizes CSS Flexbox/Grid so it scales down perfectly on mobile devices (User Story 8).

---

## 2. What to add for the "Daily Scrum"
In MS Planner, you usually track the "status" of the tasks above (To Do -> In Progress -> Done). You track the *Daily Scrum* in a document (like OneNote). Show these 3 hypothetical days in your presentation to prove you did Daily Scrums.

### Daily Scrum: Day 2 (Database & Setup Phase)
*   **What I did yesterday:** Initialized the React frontend and installed Tailwind CSS (Task 1).
*   **What I will do today:** Initialize the FastAPI backend and write the SQLAlchemy `User` table (Task 2).
*   **Impediments (Blockers):** I struggled with a Docker syntax error when linking the PostgreSQL container to the Python app, but resolving it today.

### Daily Scrum: Day 5 (Authentication Phase)
*   **What I did yesterday:** Completed the password hashing and JWT token generation endpoint (Task 3).
*   **What I will do today:** Build the animated React Login screen and wire it up to the `/auth/login` endpoint (Task 4).
*   **Impediments (Blockers):** Currently facing a CORS (Cross-Origin Resource Sharing) error where the React app is being blocked by FastAPI. I need to configure the FastAPI middleware to allow localhost:5173.

### Daily Scrum: Day 8 (UI & Responsive Phase)
*   **What I did yesterday:** Successfully fixed the CORS issue and users can now log in securely.
*   **What I will do today:** Build the main responsive Dashboard layout and sidebar navigation (Task 5).
*   **Impediments (Blockers):** None today. The authentication flow is completely finished and passed testing.
