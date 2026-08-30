FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TZ=Asia/Ho_Chi_Minh

WORKDIR /app

# Cài deps trước để tận dụng cache layer khi sửa code
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bot/ ./bot/
COPY run.py .

# Thư mục data được mount ra ngoài để SQLite sống sót qua các lần rebuild
RUN mkdir -p /app/data
VOLUME ["/app/data"]

CMD ["python", "run.py", "serve"]
