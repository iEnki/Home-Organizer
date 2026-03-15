# Stage 1: Build the React application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json ./
COPY package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Define build arguments
ARG REACT_APP_SUPABASE_URL
ARG REACT_APP_SUPABASE_ANON_KEY
ARG REACT_APP_PASSWORD_RESET_REDIRECT_URL

# Set them as environment variables for the build process
ENV REACT_APP_SUPABASE_URL=${REACT_APP_SUPABASE_URL}
ENV REACT_APP_SUPABASE_ANON_KEY=${REACT_APP_SUPABASE_ANON_KEY}
ENV REACT_APP_PASSWORD_RESET_REDIRECT_URL=${REACT_APP_PASSWORD_RESET_REDIRECT_URL}

# Build the application
RUN npm run build

# Stage 2: Serve the application using a static server
FROM node:18-alpine

WORKDIR /app

# Install serve
RUN npm install -g serve

# Copy the build output from the builder stage
COPY --from=builder /app/build ./build

# Expose port 3000 (default for serve)
EXPOSE 3000

# Start the server
CMD ["serve", "-s", "build", "-l", "3000"]
