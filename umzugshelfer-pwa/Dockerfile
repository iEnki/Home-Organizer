# Node is needed only while building. The runtime remains the existing Nginx image.
FROM node:22.23.5-alpine3.24 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts --include=dev
COPY . .
RUN npm run postinstall

# Reviewed public values only; server credentials must never be build arguments.
ARG REACT_APP_SUPABASE_URL
ARG REACT_APP_SUPABASE_ANON_KEY
ARG REACT_APP_VAPID_PUBLIC_KEY
ARG REACT_APP_PASSWORD_RESET_REDIRECT_URL
ARG REACT_APP_GLOBAL_ASSISTANT_ENABLED=true
ENV REACT_APP_SUPABASE_URL=$REACT_APP_SUPABASE_URL
ENV REACT_APP_SUPABASE_ANON_KEY=$REACT_APP_SUPABASE_ANON_KEY
ENV REACT_APP_VAPID_PUBLIC_KEY=$REACT_APP_VAPID_PUBLIC_KEY
ENV REACT_APP_PASSWORD_RESET_REDIRECT_URL=$REACT_APP_PASSWORD_RESET_REDIRECT_URL
ENV REACT_APP_GLOBAL_ASSISTANT_ENABLED=$REACT_APP_GLOBAL_ASSISTANT_ENABLED
ENV NODE_OPTIONS=--max-old-space-size=2048
ENV GENERATE_SOURCEMAP=false
RUN npm run build

FROM nginx:1.30.6-alpine3.24
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
