FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=build /app/dist ./static
ENV DB_PATH=/data/fondi.db
# /data se crea y se le da dueño ANTES del VOLUME: así un volumen nuevo hereda ese dueño y
# el proceso no necesita root. Un volumen que ya existía de una imagen anterior sigue siendo
# de root y hay que corregirlo una vez a mano (ver README).
RUN useradd --uid 10001 --create-home fondi && mkdir -p /data && chown fondi:fondi /data
VOLUME /data
USER fondi
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health').read()"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
