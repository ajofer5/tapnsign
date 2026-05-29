FROM node:22-slim

# Install fontconfig so librsvg can find system fonts
RUN apt-get update && \
    apt-get install -y --no-install-recommends fonts-dejavu-core fontconfig && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# Register Optima with fontconfig so librsvg can use it by name in SVG text
RUN mkdir -p /usr/local/share/fonts/optima && \
    cp assets/Optima.ttc /usr/local/share/fonts/optima/ && \
    fc-cache -f && \
    fc-list | grep -i optima

EXPOSE 8080
CMD ["node", "index.js"]
