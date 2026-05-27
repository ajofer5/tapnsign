FROM node:22-slim

# Install fonts so librsvg (used by sharp) can render SVG text
RUN apt-get update && \
    apt-get install -y --no-install-recommends fonts-dejavu-core fontconfig && \
    fc-cache -f && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

EXPOSE 8080
CMD ["node", "index.js"]
