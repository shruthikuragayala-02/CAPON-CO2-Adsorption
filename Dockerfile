
# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./

RUN npm ci

COPY frontend/ ./

RUN npm run build


# Stage 2: Prepare the Python backend
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt

RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend source code
COPY backend /app/backend

# Copy the dataset
COPY data /app/data

# Copy the production React build
COPY --from=frontend-build /frontend/dist /app/backend/frontend_dist

WORKDIR /app/backend

EXPOSE 8000

# Start FastAPI
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
