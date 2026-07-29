FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Runs as root on purpose, unlike the API image. The security boundary here is
# the Docker socket bind-mounted at run time: whoever can reach it can start a
# privileged container and own the host regardless of the UID inside this one.
# A non-root user would buy nothing and would add two brittle runtime
# requirements (matching VM2's docker GID via --group-add, and matching the
# owner of the bind-mounted log directory).

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
