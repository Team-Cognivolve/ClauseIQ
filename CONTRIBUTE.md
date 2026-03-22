# Contribution Guidelines

Thank you for contributing to this project.

This repository follows a structured branching and pull request workflow. 
All team members must follow the rules below.

--------------------------------------------------

Branch Strategy

- main → Stable milestone / submission branch
- prototype → IA-1 development branch (Frozen after IA-1 submission)
- dev → IA-2 ongoing full project development
- feature/* → Individual task branches

--------------------------------------------------

Important Rules

- Do NOT push directly to main
- Do NOT push directly to prototype or dev
- Always create a new feature branch for any task

Branch Naming Format:

feature/<task>

Examples:
- feature/clause-analysis
- feature/navbar-ui
- feature/db-schema

--------------------------------------------------

👨‍💻 Development Workflow

1. Clone the repository
2. Checkout the correct base branch (prototype for IA-1 or dev for IA-2)
3. Pull latest changes
4. Create a feature branch
5. Implement the task
6. Commit changes with meaningful messages
7. Push the branch
8. Create a Pull Request

--------------------------------------------------

✅ Pull Request Guidelines

- One Pull Request = One logical feature or task
- Provide proper description of changes
- Mention related Issue (if any)
- Wait for Developer Lead review before merging

--------------------------------------------------

🧪 Testing Requirement

Before creating Pull Request:

- Project should run locally
- No major console errors
- Feature should work as expected

--------------------------------------------------

📌 IA Workflow

- IA-1 development happens in prototype branch
- After IA-1 submission, prototype branch will be frozen
- IA-2 development will continue in dev branch
- Final stable version will be merged into main

--------------------------------------------------

Progress Tracking

After completing a task:

- Update progress.md
