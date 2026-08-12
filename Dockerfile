FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

COPY backend/pyproject.toml /tmp/pyproject.toml
RUN python -c "import tomllib; \
    deps = tomllib.load(open('/tmp/pyproject.toml', 'rb'))['project']['dependencies']; \
    print('\n'.join(deps))" | xargs pip install --no-cache-dir

COPY backend /app/backend
COPY cities /app/cities

WORKDIR /app/backend

EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn rentroo.api.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
