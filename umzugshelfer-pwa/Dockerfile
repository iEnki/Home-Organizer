# Stage 1: Build der React-Anwendung
FROM node:18-alpine AS builder

WORKDIR /app

# Kopiere package.json und package-lock.json (oder yarn.lock)
# Es ist besser, package-lock.json zu verwenden, wenn vorhanden, für deterministische Builds.
COPY package*.json ./

# Installiere Abhängigkeiten
# CI=true stellt sicher, dass Warnungen nicht als Fehler behandelt werden und Tests nicht interaktiv laufen.
# Die vorherige komplexe Installationszeile wird durch `npm ci` ersetzt, 
# was auf Basis der package-lock.json alle Abhängigkeiten (inkl. devDependencies) installiert.
RUN npm ci
# Oder einfach:
# RUN npm install

# Kopiere den Rest der Anwendungsdateien
COPY . .

# Deklariere die Build-Argumente, die von docker-compose übergeben werden
ARG REACT_APP_SUPABASE_URL
ARG REACT_APP_SUPABASE_ANON_KEY
ARG REACT_APP_VAPID_PUBLIC_KEY
# ARG REACT_APP_OPENAI_API_KEY wurde entfernt

# Setze die Umgebungsvariablen für den Build-Prozess
ENV REACT_APP_SUPABASE_URL=$REACT_APP_SUPABASE_URL
ENV REACT_APP_SUPABASE_ANON_KEY=$REACT_APP_SUPABASE_ANON_KEY
ENV REACT_APP_VAPID_PUBLIC_KEY=$REACT_APP_VAPID_PUBLIC_KEY
# ENV REACT_APP_OPENAI_API_KEY=$REACT_APP_OPENAI_API_KEY wurde entfernt

# Erhöhe den für Node.js verfügbaren Speicher während des Builds
ENV NODE_OPTIONS=--max-old-space-size=2048
# Deaktiviere Source Maps Generierung, um Speicher zu sparen
ENV GENERATE_SOURCEMAP=false

# Baue die Anwendung für die Produktion
RUN npm run build

# Stage 2: Serve der Anwendung mit Nginx
FROM nginx:stable-alpine

# Kopiere die gebaute Anwendung aus dem Builder-Stage
COPY --from=builder /app/build /usr/share/nginx/html

# Kopiere die benutzerdefinierte Nginx-Konfiguration
# Diese Konfiguration stellt sicher, dass alle Anfragen an index.html weitergeleitet werden,
# um client-seitiges Routing mit React Router zu ermöglichen.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Auskommentiert, da die Konfiguration jetzt in nginx.conf steht:
# Eine einfache nginx.conf könnte so aussehen, um React Router zu unterstützen:
# server {
#    listen 80;
#    server_name localhost;
#
#    root /usr/share/nginx/html;
#    index index.html index.htm;
#
#    location / {
#        try_files $uri $uri/ /index.html;
#    }
# }


# Exponiere Port 80
EXPOSE 80

# Starte Nginx
CMD ["nginx", "-g", "daemon off;"]
